const dotenv = require('dotenv');

let loaded = false;
let cachedEnv = null;

function loadEnv() {
  if (loaded) {
    return process.env;
  }

  dotenv.config();
  loaded = true;
  return process.env;
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOrigin(value) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(String(value).trim());
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function parseOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

function resolveServerUrl(rawServerUrl, host, port) {
  const fallbackHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return normalizeOrigin(rawServerUrl) || `http://${fallbackHost}:${port}`;
}

function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const raw = loadEnv();
  const host = raw.HOST || '0.0.0.0';
  const port = asInt(raw.PORT, 8080);
  const serverUrl = resolveServerUrl(raw.SERVER_URL, host, port);

  cachedEnv = Object.freeze({
    NODE_ENV: raw.NODE_ENV || 'development',
    HOST: host,
    PORT: port,
    SERVER_URL: serverUrl,
    PROGRAM_DATA: raw.ProgramData || raw.PROGRAMDATA || 'C:\\ProgramData',
    UPLOAD_DIR: raw.UPLOAD_DIR || '/var/lib/gspapp/uploads/migrations',
    EMAILCOMPANY: raw.EMAILCOMPANY || '',
    EMAILPASSWORD: raw.EMAILPASSWORD || '',
    OLEDB_PROVIDER: raw.OLEDB_PROVIDER || 'Microsoft.ACE.OLEDB.12.0',
    BATCH_SIZE: asInt(raw.BATCH_SIZE, 2000),
    DATABASE_URL: raw.DATABASE_URL || '',
    CORS_ALLOWED_ORIGINS: parseOrigins(raw.CORS_ALLOWED_ORIGINS),
  });

  return cachedEnv;
}

module.exports = {
  loadEnv,
  getEnv,
};
