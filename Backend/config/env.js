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

function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const raw = loadEnv();
  const host = raw.HOST || '127.0.0.1';
  const port = asInt(raw.PORT, 8080);

  cachedEnv = Object.freeze({
    NODE_ENV: raw.NODE_ENV || 'development',
    HOST: host,
    PORT: port,
    SERVER_URL: raw.SERVER_URL || `http://${host}:${port}`,
    PROGRAM_DATA: raw.ProgramData || raw.PROGRAMDATA || 'C:\\ProgramData',
    UPLOAD_DIR: raw.UPLOAD_DIR || '/var/lib/gspapp/uploads/migrations',
    EMAILCOMPANY: raw.EMAILCOMPANY || '',
    EMAILPASSWORD: raw.EMAILPASSWORD || '',
    OLEDB_PROVIDER: raw.OLEDB_PROVIDER || 'Microsoft.ACE.OLEDB.12.0',
    BATCH_SIZE: asInt(raw.BATCH_SIZE, 2000),
    DATABASE_URL: raw.DATABASE_URL || '',
  });

  return cachedEnv;
}

module.exports = {
  loadEnv,
  getEnv,
};
