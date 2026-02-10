const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const { execFile, execFileSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ── Parse .env without external deps ────────────────────────────────────
function parseEnvFile(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) return;
    map[line.substring(0, eq).trim()] = line.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
  });
  return map;
}

// ── Path resolution ─────────────────────────────────────────────────────
const isPackaged = app.isPackaged;

// Inno Setup layout: {app}/frontend/КОМПЛЕКС.exe → install root is parent
// Dev layout: frontedn_v2/node_modules/.bin/electron → backend is sibling
const INSTALL_ROOT = isPackaged
  ? path.join(path.dirname(process.execPath), '..')
  : path.join(__dirname, '..', '..');

const BACKEND_ROOT = isPackaged
  ? path.join(INSTALL_ROOT, 'backend')
  : path.join(INSTALL_ROOT, 'Backend');

// ── .env resolution (ProgramData > backend bundled) ─────────────────────
const PROGRAMDATA_DIR = path.join(
  process.env.ProgramData || 'C:\\ProgramData', 'GSPApp'
);
const ENV_PROGRAMDATA = path.join(PROGRAMDATA_DIR, '.env');
const ENV_BACKEND = path.join(BACKEND_ROOT, '.env');
const envPath = fs.existsSync(ENV_PROGRAMDATA)
  ? ENV_PROGRAMDATA
  : fs.existsSync(ENV_BACKEND) ? ENV_BACKEND : null;

const envConfig = envPath ? parseEnvFile(envPath) : {};

// ── Configuration ───────────────────────────────────────────────────────
const BACKEND_PORT = parseInt(envConfig.PORT) || 8080;
const SCREEN_PROTECTION = (envConfig.SCREEN_PROTECTION || 'true') !== 'false';
const ICON_PATH = path.join(__dirname, 'icon.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let servicesStartedByUs = false;
let nodeProcess = null; // Node child process spawned by Electron

// ── Helpers ─────────────────────────────────────────────────────────────

function readLastLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return '(file not found)';
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-n).join('\n');
  } catch (_) { return '(could not read)'; }
}

// ── Service lifecycle ───────────────────────────────────────────────────

function runPowerShell(scriptPath, args) {
  return new Promise((resolve) => {
    if (!fs.existsSync(scriptPath)) { resolve(false); return; }
    execFile('powershell.exe', [
      '-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Hidden',
      '-File', scriptPath, ...args,
    ], { timeout: 180000 }, (err, stdout, stderr) => {
      if (stdout) console.log('[PS]', stdout.trim());
      if (stderr) console.error('[PS]', stderr.trim());
      resolve(!err);
    });
  });
}

function runPowerShellSync(scriptPath, args) {
  if (!fs.existsSync(scriptPath)) return;
  try {
    execFileSync('powershell.exe', [
      '-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Hidden',
      '-File', scriptPath, ...args,
    ], { timeout: 30000 });
  } catch (e) {
    console.error('[PS sync]', e.message);
  }
}

function isBackendRunning() {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${BACKEND_PORT}/status`, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body).Hello === 'World!'); }
        catch (_) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureBackendRunning() {
  // Check if already running (user may have started it manually)
  if (await isBackendRunning()) {
    console.log('[Electron] Backend already running on port ' + BACKEND_PORT);
    return;
  }

  if (!isPackaged) {
    // Dev mode — just assume backend is running
    console.log('[Electron] Dev mode — please start backend manually.');
    return;
  }

  servicesStartedByUs = true;

  const nodeExe = path.join(BACKEND_ROOT, 'node', 'node.exe');
  const indexJs = path.join(BACKEND_ROOT, 'app', 'index.js');
  const appDir = path.join(BACKEND_ROOT, 'app');
  const pidsDir = path.join(PROGRAMDATA_DIR, 'pids');
  const logsDir = path.join(PROGRAMDATA_DIR, 'logs');
  const appLog = path.join(logsDir, 'app.log');

  // Ensure directories exist
  try { fs.mkdirSync(pidsDir, { recursive: true }); } catch (_) {}
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}

  // 1. Start PG + prisma + seed via PowerShell (fire-and-forget, best effort).
  //    This handles PostgreSQL startup and database schema creation.
  const startScript = path.join(BACKEND_ROOT, 'scripts', 'start_services.ps1');
  if (fs.existsSync(startScript)) {
    console.log('[Electron] Starting PG/prisma/seed via PowerShell...');
    runPowerShell(startScript, ['-AppRoot', BACKEND_ROOT]);
  }

  // 2. Start Node server DIRECTLY (primary mechanism — no PowerShell dependency).
  //    This guarantees /status responds quickly regardless of PowerShell issues.
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`node.exe not found at: ${nodeExe}`);
  }
  if (!fs.existsSync(indexJs)) {
    throw new Error(`index.js not found at: ${indexJs}`);
  }

  // Build environment: current env + .env file values
  const env = Object.assign({}, process.env);
  for (const [k, v] of Object.entries(envConfig)) {
    env[k] = v;
  }
  env.NODE_ENV = 'production';

  console.log('[Electron] Starting Node server directly...');
  nodeProcess = spawn(nodeExe, [indexJs], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Write PID file so start_services.ps1 knows Node is already running
  try {
    fs.writeFileSync(path.join(pidsDir, 'node.pid'), String(nodeProcess.pid), 'ascii');
  } catch (_) {}

  // Pipe stdout/stderr to log file
  try {
    const logStream = fs.createWriteStream(appLog, { flags: 'a' });
    nodeProcess.stdout.pipe(logStream);
    nodeProcess.stderr.pipe(logStream);
  } catch (_) {}

  nodeProcess.on('exit', (code) => {
    console.log(`[Electron] Node process exited with code ${code}`);
    nodeProcess = null;
  });

  // 3. Poll /status until Node responds (up to 120s)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));

    if (await isBackendRunning()) {
      console.log('[Electron] Backend is ready!');
      return;
    }

    // Detect early crash — no point waiting 120s if Node already exited
    if (nodeProcess === null) {
      const lastLog = readLastLines(appLog, 30);
      throw new Error(
        'Node server crashed during startup.\n\n' +
        'Last log output:\n' + lastLog
      );
    }

    if (i % 10 === 9) console.log(`[Electron] Still waiting... (${i + 1}s)`);
  }

  const lastLog = readLastLines(appLog, 20);
  throw new Error(
    'Backend did not respond within 120 seconds.\n\n' +
    `Logs: ${appLog}\n\nLast output:\n${lastLog}`
  );
}

function stopServices() {
  // Kill Node process we spawned directly
  if (nodeProcess) {
    try { nodeProcess.kill(); } catch (_) {}
    nodeProcess = null;
  }

  // Also stop PG and any other Node via stop script
  if (servicesStartedByUs && isPackaged) {
    const stopScript = path.join(BACKEND_ROOT, 'scripts', 'stop_services.ps1');
    console.log('[Electron] Stopping backend services...');
    runPowerShellSync(stopScript, ['-AppRoot', BACKEND_ROOT]);
  }
}

// ── Window & Tray ───────────────────────────────────────────────────────

function resolveIcon() {
  const candidates = [
    path.join(__dirname, 'icons', 'win', 'icon.ico'),
    ICON_PATH,
  ];
  return candidates.find(p => fs.existsSync(p));
}

async function createWindow() {
  if (mainWindow) { mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    icon: resolveIcon(),
  });

  if (SCREEN_PROTECTION) {
    try { mainWindow.setContentProtection(true); } catch (_) { }
  }

  mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  if (tray) return;
  const img = fs.existsSync(ICON_PATH) ? ICON_PATH : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('\u041A\u041E\u041C\u041F\u041B\u0415\u041A\u0421');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '\u041E\u0442\u043A\u0440\u044B\u0442\u044C', click: () => createWindow() },
    { label: '\u0412\u044B\u0445\u043E\u0434', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => createWindow());
}

// ── App lifecycle ───────────────────────────────────────────────────────

app.on('ready', async () => {
  createTray();
  try {
    await ensureBackendRunning();
    await createWindow();
  } catch (err) {
    console.error('[Electron] Startup error:', err);
    dialog.showErrorBox(
      '\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430',
      `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440.\n\n${err.message}\n\n` +
      '\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435:\n' +
      '1. PostgreSQL \u0437\u0430\u043F\u0443\u0449\u0435\u043D\n' +
      `2. \u041A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044F: ${envPath || '(.env \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D)'}\n` +
      `3. \u041B\u043E\u0433\u0438: ${path.join(PROGRAMDATA_DIR, 'logs')}`
    );
    app.quit();
  }
});

app.on('browser-window-created', (_e, win) => {
  if (SCREEN_PROTECTION) try { win.setContentProtection(true); } catch (_) { }
});

app.on('window-all-closed', (e) => {
  if (!isQuitting) e.preventDefault();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServices();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', () => createWindow()); }
