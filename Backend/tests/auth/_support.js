// Local helpers for the /auth/backup and /auth/backup-pg tests.
// Shared helpers in tests/helpers are used as-is; nothing here edits them.
//
// These endpoints do not go through uploads/ and do not produce Word files:
// they write CSV/SQL + an encrypted ZIP into getBackupTempDir()
// (%PROGRAMDATA%\GSPApp\temp, falling back to os.tmpdir()/gspapp/temp),
// res.sendFile() the ZIP and delete everything in the sendFile callback.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { mockReq, mockRes } = require("../helpers/http");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const UPLOADS_DIR = path.join(BACKEND_ROOT, "uploads");
const SEVEN_ZIP = require("7zip-bin").path7za;

// Charset of generateSecurePassword() — registerController.js:75
const PASSWORD_RE = /^[A-Za-z0-9!@#$%^&*()\-_=+[\]{}|;:,.<>?]{16}$/;

function countUploads() {
  try {
    return fs.readdirSync(UPLOADS_DIR).length;
  } catch {
    return 0;
  }
}

// A private sandbox under the REAL os.tmpdir(), captured before any test
// re-points TEMP/TMP. PROGRAMDATA is pointed into it so nothing touches the
// real C:\ProgramData.
function createSandbox(label) {
  const realTmp = os.tmpdir();
  const root = fs.mkdtempSync(path.join(realTmp, `gsp-${label}-test-`));
  const saved = {};
  const ENV_KEYS = ["PROGRAMDATA", "TEMP", "TMP", "TMPDIR", "DATABASE_URL", "PG_BIN_DIR"];
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  const programData = path.join(root, "programdata");
  fs.mkdirSync(programData, { recursive: true });
  process.env.PROGRAMDATA = programData;

  return {
    root,
    programData,
    realTmp,
    // %PROGRAMDATA%\GSPApp\temp — registerController.js:51
    backupDir: path.join(programData, "GSPApp", "temp"),
    dir(...p) {
      const d = path.join(root, ...p);
      fs.mkdirSync(d, { recursive: true });
      return d;
    },
    restoreEnv() {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    },
    resetEnv() {
      // back to the sandbox defaults between tests
      for (const k of ["TEMP", "TMP", "TMPDIR"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      process.env.PROGRAMDATA = programData;
    },
    cleanup() {
      this.restoreEnv();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return null;
  }
}

// mockRes() whose sendFile() snapshots the ZIP and the temp folder BEFORE
// invoking the controller's cleanup callback (the shared mockRes calls the
// callback immediately, which would delete the file before we can read it).
//   sendError: passed to the callback as `err` (simulates a failed transfer)
//   headersSent: value of res.headersSent seen by the callback
function fileRes({ sendError = null, headersSent = false } = {}) {
  const res = mockRes();
  res.headersSent = headersSent;
  const json = res.json;
  res.json = (body) => {
    const result = json(body);
    res.headersSent = true;
    return result;
  };
  res.sendFile = (p, opts, cb) => {
    const done = typeof opts === "function" ? opts : cb;
    // Express reports a missing file through its callback. This also captures
    // the controller's late send attempt when its archive stream closes after
    // an archive-error response has already deleted the ZIP.
    if (!fs.existsSync(p)) {
      res.missingFileAttempt = p;
      if (typeof done === "function") done(Object.assign(new Error("File missing"), { code: "ENOENT" }));
      return res;
    }
    res.sentFile = p;
    res.sentFileOptions = typeof opts === "function" ? undefined : opts;
    res.sentBuffer = fs.readFileSync(p);
    res.tempBefore = listDir(path.dirname(p));
    if (typeof done === "function") done(sendError);
    res.tempAfter = listDir(path.dirname(p));
    res.finished = true;
    // resolve res.done (json() inside the callback may already have done so)
    res.end();
    return res;
  };
  return res;
}

async function call(handler, reqOpts = {}, resOpts = {}) {
  const req = mockReq(reqOpts);
  const res = fileRes(resOpts);
  await handler(req, res);
  await res.done;
  return res;
}

// ---- ZIP inspection (no extra dependency) --------------------------------
// Reads the central directory and returns one entry per file.
function listZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central dir entry");
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString("utf8");
    const localFlags = buf.readUInt16LE(localOffset + 6);
    entries.push({ name, flags, localFlags, method, compressedSize, size, encrypted: (flags & 1) === 1 });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Extracts with the bundled 7za into a fresh folder under the real tmpdir.
// Returns { files: {name: Buffer}, listing: "7za l -slt" output }.
function extractZip(buf, password, workRoot) {
  const work = fs.mkdtempSync(path.join(workRoot, "unzip-"));
  const zipFile = path.join(work, "in.zip");
  const outDir = path.join(work, "out");
  fs.writeFileSync(zipFile, buf);
  try {
    const listing = execFileSync(SEVEN_ZIP, ["l", "-slt", `-p${password}`, zipFile], { encoding: "utf8" });
    execFileSync(SEVEN_ZIP, ["x", `-p${password}`, `-o${outDir}`, "-y", zipFile], { stdio: "pipe" });
    const files = {};
    for (const name of fs.readdirSync(outDir)) files[name] = fs.readFileSync(path.join(outDir, name));
    return { files, listing };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Returns the 7za exit status when extracting with `password` (0 = ok).
function tryExtract(buf, password, workRoot) {
  const work = fs.mkdtempSync(path.join(workRoot, "unzip-"));
  const zipFile = path.join(work, "in.zip");
  fs.writeFileSync(zipFile, buf);
  try {
    execFileSync(SEVEN_ZIP, ["x", `-p${password}`, `-o${path.join(work, "out")}`, "-y", zipFile], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Minimal RFC 4180 parser: quoted fields, "" escapes, embedded , and \n.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Wraps the real `archiver` factory in require.cache so a test can see the
// options it was called with, and optionally make the archive fail.
// Must run BEFORE the controller is required.
function installArchiverSpy() {
  const realPath = require.resolve("archiver");
  const real = require("archiver");
  const spy = {
    created: [],
    failNext: null, // Error to emit instead of finalizing
    openStreams: [],
  };
  const wrapper = function (format, options) {
    const snapshot = structuredClone(options);
    const inst = real(format, options);
    spy.created.push({ format, options: snapshot });
    if (spy.failNext) {
      const err = spy.failNext;
      spy.failNext = null;
      let dest = null;
      const origPipe = inst.pipe.bind(inst);
      inst.pipe = (d, o) => {
        dest = d;
        spy.openStreams.push(d);
        return origPipe(d, o);
      };
      inst.finalize = () => {
        const fire = () => setImmediate(() => inst.emit("error", err));
        if (dest && dest.pending) dest.once("open", fire);
        else fire();
        return Promise.resolve();
      };
    }
    return inst;
  };
  Object.assign(wrapper, real);
  require.cache[realPath].exports = wrapper;
  spy.closeOpenStreams = () =>
    Promise.all(
      spy.openStreams.splice(0).map(
        (s) => new Promise((r) => (s.destroyed || s.closed ? r() : (s.once("close", r), s.destroy())))
      )
    );
  return spy;
}

const FROZEN_NOW = new Date("2026-01-15T09:00:00Z");
// new Date().toISOString().replace(/[:.]/g, '-') — registerController.js:5021 / 5332
const FROZEN_TS = "2026-01-15T09-00-00-000Z";

// Exercise Express JSON serialization and sendFile rather than the response
// double. Authorization is covered separately by routes/documentRoutes.test.js.
async function postViaHttp(handler, body = {}) {
  const express = require('express');
  const { startServer } = require('../helpers/pipeServer');
  const app = express();
  app.use(express.json());
  app.post('/backup', handler);
  const server = await startServer(app);
  try { return await server.request('/backup', { method: 'POST', body }); }
  finally { await server.close(); }
}

module.exports = {
  BACKEND_ROOT,
  SEVEN_ZIP,
  PASSWORD_RE,
  FROZEN_NOW,
  FROZEN_TS,
  countUploads,
  createSandbox,
  listDir,
  fileRes,
  call,
  listZipEntries,
  extractZip,
  tryExtract,
  parseCsv,
  installArchiverSpy,
  postViaHttp,
};
