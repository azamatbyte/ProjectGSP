// POST /api/v1/auth/backup-pg. The real archive implementation runs against
// synthetic SQL. spawn is replaced before importing the controller, so no
// pg_dump process or database connection can run.
const { test, describe, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const cp = require('node:child_process');
const S = require('./_support');
const { installFakePrisma } = require('../helpers/fakePrisma');
const sandbox = S.createSandbox('pgdump');
const prisma = installFakePrisma();
const archive = S.installArchiverSpy();
const originalSpawn = cp.spawn;
const calls = [];
let outcome;
const SQL = '-- Synthetic fixture only\r\nSET transaction_timeout = 0;\r\nSET statement_timeout = 0;\r\nCREATE TABLE sample (name text);\r\nINSERT INTO sample VALUES (\'Тест, O\'\'Brien\');\r\nSET transaction_timeout = 900;\n';
const CLEAN_SQL = '-- Synthetic fixture only\r\nSET statement_timeout = 0;\r\nCREATE TABLE sample (name text);\r\nINSERT INTO sample VALUES (\'Тест, O\'\'Brien\');\r\n';
cp.spawn = (bin, args, options) => {
  calls.push({ bin, args, options });
  const proc = new EventEmitter();
  proc.stderr = new EventEmitter();
  process.nextTick(() => {
    const file = args[args.indexOf('-f') + 1];
    if (outcome.write !== false) fs.writeFileSync(file, outcome.sql ?? SQL);
    if (outcome.error) return proc.emit('error', outcome.error);
    for (const message of outcome.stderr || []) proc.stderr.emit('data', Buffer.from(message));
    proc.emit('close', outcome.code ?? 0);
  });
  return proc;
};
const ctrl = require('../../api/controllers/registerController');
const ZIP = `pgdump_${S.FROZEN_TS}.zip`;
const SQL_FILE = `pgdump_${S.FROZEN_TS}.sql`;
let warning;
before(() => {
  mock.timers.enable({ apis: ['Date'], now: S.FROZEN_NOW });
  mock.method(console, 'error', () => {});
  warning = mock.method(console, 'warn', () => {});
});
beforeEach(() => {
  sandbox.resetEnv();
  process.env.DATABASE_URL = 'postgresql://test%20user:p%40ss%3Aword@db.invalid:5544/fixture_db?schema=public';
  process.env.PG_BIN_DIR = sandbox.dir('pg-bin');
  // An inert marker makes binary resolution deterministic; spawn is mocked.
  fs.writeFileSync(path.join(process.env.PG_BIN_DIR, 'pg_dump'), 'not executable');
  calls.length = 0;
  archive.created.length = 0;
  archive.failNext = null;
  prisma.reset();
  warning.mock.resetCalls();
  outcome = {};
});
afterEach(async () => {
  await archive.closeOpenStreams();
  assert.deepEqual(prisma.log, [], 'pg_dump backup must not use Prisma');
});
after(() => {
  cp.spawn = originalSpawn;
  mock.restoreAll();
  mock.timers.reset();
  sandbox.cleanup();
});

describe('PostgreSQL backup: actual encrypted archive and HTTP file contract', () => {
  test('uses explicit binary, decoded credentials, custom port, safe argument array and password environment', async () => {
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bin, path.join(process.env.PG_BIN_DIR, 'pg_dump'));
    assert.deepEqual(calls[0].args, ['-h', 'db.invalid', '-p', '5544', '-U', 'test user', '-d', 'fixture_db', '-F', 'p', '--clean', '--if-exists', '--no-owner', '--no-acl', '-f', path.join(sandbox.backupDir, SQL_FILE)]);
    assert.equal(calls[0].options.env.PGPASSWORD, 'p@ss:word');
    assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(calls[0].options.shell, undefined);
    assert.equal(calls[0].args.includes('p@ss:word'), false);
  });

  test('200 attachment is a ZIP file with password header, no JSON link or extra info header', async () => {
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 200);
    assert.equal(res.sentFile, path.join(sandbox.backupDir, ZIP));
    assert.equal(res.sentBuffer.subarray(0, 4).toString('hex'), '504b0304');
    assert.equal(res.headers['content-type'], 'application/zip');
    assert.equal(res.headers['content-disposition'], `attachment; filename="${ZIP}"`);
    assert.match(res.headers['x-backup-password'], S.PASSWORD_RE);
    assert.equal(res.headers['x-backup-info'], undefined);
    assert.equal(res.body, undefined);
    assert.equal(res.downloaded, null);
  });

  test('archive uses ZipCrypto, deflate level 6; sole SQL entry is encrypted in both headers', async () => {
    const res = await S.call(ctrl.exportPgDump);
    assert.deepEqual(archive.created, [{ format: 'zip-encrypted', options: { zlib: { level: 6 }, encryptionMethod: 'zip20', password: res.headers['x-backup-password'] } }]);
    const entries = S.listZipEntries(res.sentBuffer);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, SQL_FILE);
    assert.equal(entries[0].encrypted, true);
    assert.equal(entries[0].localFlags & 1, 1);
    assert.equal(entries[0].method, 8);
  });

  test('correct password decrypts UTF-8 SQL with unsupported settings removed and all other bytes preserved', async () => {
    const res = await S.call(ctrl.exportPgDump);
    const extracted = S.extractZip(res.sentBuffer, res.headers['x-backup-password'], sandbox.dir('work'));
    assert.deepEqual(Object.keys(extracted.files), [SQL_FILE]);
    assert.equal(extracted.files[SQL_FILE].toString('utf8'), CLEAN_SQL);
    assert.match(extracted.listing, /Encrypted = \+/);
    assert.equal(warning.mock.callCount(), 1);
    assert.match(warning.mock.calls[0].arguments[0], /transaction_timeout/);
  });

  test('wrong password cannot decrypt the SQL', async () => {
    const res = await S.call(ctrl.exportPgDump);
    assert.notEqual(S.tryExtract(res.sentBuffer, 'wrong-password', sandbox.dir('work')), 0);
  });

  test('SQL without unsupported settings is kept byte-for-byte, without warning', async () => {
    outcome.sql = '-- safe SQL\nSELECT \'Привет\';\n';
    const res = await S.call(ctrl.exportPgDump);
    const { files } = S.extractZip(res.sentBuffer, res.headers['x-backup-password'], sandbox.dir('work'));
    assert.equal(files[SQL_FILE].toString('utf8'), outcome.sql);
    assert.equal(warning.mock.callCount(), 0);
  });

  test('SQL and ZIP exist for transfer, then both are deleted', async () => {
    const res = await S.call(ctrl.exportPgDump);
    assert.deepEqual(res.tempBefore, [SQL_FILE, ZIP].sort());
    assert.deepEqual(res.tempAfter, []);
  });

  test('successive exports generate independent archive passwords', async () => {
    const a = await S.call(ctrl.exportPgDump);
    const b = await S.call(ctrl.exportPgDump);
    assert.notEqual(a.headers['x-backup-password'], b.headers['x-backup-password']);
  });

  test('binary resolution accepts a Windows .exe override', { skip: process.platform !== 'win32' }, async () => {
    fs.unlinkSync(path.join(process.env.PG_BIN_DIR, 'pg_dump'));
    fs.writeFileSync(path.join(process.env.PG_BIN_DIR, 'pg_dump.exe'), 'not executable');
    await S.call(ctrl.exportPgDump);
    assert.equal(calls[0].bin, path.join(process.env.PG_BIN_DIR, 'pg_dump.exe'));
  });
});

describe('PostgreSQL backup: errors and cleanup', () => {
  for (const [label, url, message] of [
    ['missing URL', undefined, 'DATABASE_URL is not set'],
    ['invalid URL', 'invalid', 'Invalid DATABASE_URL format'],
    ['unsupported URL scheme', 'mysql://u:p@h:123/db', 'Invalid DATABASE_URL format'],
  ]) {
    test(`${label}: 500 without spawning or producing files`, async () => {
      if (url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = url;
      const res = await S.call(ctrl.exportPgDump);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Failed to create PostgreSQL backup', message });
      assert.equal(calls.length, 0);
      assert.deepEqual(res.headers, {});
      assert.deepEqual(S.listDir(sandbox.backupDir), []);
    });
  }

  test('pg_dump nonzero exit includes combined stderr and removes partial SQL', async () => {
    outcome = { code: 2, stderr: ['connection ', 'refused'] };
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to create PostgreSQL backup', message: 'pg_dump exited with code 2: connection refused' });
    assert.deepEqual(S.listDir(sandbox.backupDir), []);
    assert.equal(archive.created.length, 0);
  });

  test('missing pg_dump gives actionable binary error and no archive', async () => {
    outcome = { write: false, error: Object.assign(new Error('missing'), { code: 'ENOENT' }) };
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, `pg_dump not found at "${path.join(process.env.PG_BIN_DIR, 'pg_dump')}". Please install PostgreSQL or set PG_BIN_DIR.`);
    assert.deepEqual(S.listDir(sandbox.backupDir), []);
  });

  test('other process errors are reported unchanged and partial SQL removed', async () => {
    outcome.error = new Error('spawn permission denied');
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'spawn permission denied');
    assert.deepEqual(S.listDir(sandbox.backupDir), []);
  });

  test('successful process that failed to create SQL returns a read error and no attachment', async () => {
    outcome.write = false;
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /ENOENT/);
    assert.equal(res.sentFile, null);
    assert.deepEqual(res.headers, {});
  });

  test('archive failure returns 500, removes temporary files; test closes leaked output stream', async () => {
    archive.failNext = new Error('archive disk full');
    const res = await S.call(ctrl.exportPgDump);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Failed to create PostgreSQL backup', message: 'archive disk full' });
    assert.deepEqual(res.headers, {});
    await archive.closeOpenStreams();
    assert.deepEqual(S.listDir(sandbox.backupDir), []);
  });

  test('transfer failure before headers returns 500 and cleans both files', async () => {
    const res = await S.call(ctrl.exportPgDump, {}, { sendError: new Error('EPIPE') });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Error sending pg dump file' });
    assert.deepEqual(res.tempAfter, []);
  });

  test('transfer failure after headers does not send a second body; cleanup still runs', async () => {
    const res = await S.call(ctrl.exportPgDump, {}, { sendError: new Error('ECONNRESET'), headersSent: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined);
    assert.deepEqual(res.tempAfter, []);
  });

  test('process failure after headers skips a second response and still removes partial SQL', async () => {
    outcome.code = 3;
    const res = S.fileRes({ headersSent: true });
    await ctrl.exportPgDump({}, res);
    assert.equal(res.finished, false);
    assert.equal(res.body, undefined);
    assert.deepEqual(S.listDir(sandbox.backupDir), []);
  });

  test('unwritable temp candidates currently reject before the handler catch (known defect)', { skip: process.platform !== 'win32' }, async () => {
    const blocked = sandbox.dir('blocked-pd');
    const blockedTmp = sandbox.dir('blocked-tmp');
    fs.writeFileSync(path.join(blocked, 'GSPApp'), 'file prevents mkdir');
    fs.writeFileSync(path.join(blockedTmp, 'gspapp'), 'file prevents mkdir');
    process.env.PROGRAMDATA = blocked;
    process.env.TEMP = blockedTmp;
    process.env.TMP = blockedTmp;
    const res = S.fileRes();
    await assert.rejects(ctrl.exportPgDump({}, res), /gspapp/i);
    assert.equal(res.finished, false);
    assert.equal(calls.length, 0);
  });
});

test('real Express sends the entire encrypted SQL ZIP before cleaning the source files', async () => {
  const response = await S.postViaHttp(ctrl.exportPgDump);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/zip');
  assert.equal(response.headers['content-disposition'], `attachment; filename="${ZIP}"`);
  assert.equal(Number(response.headers['content-length']), response.buffer.length);
  assert.match(response.headers['x-backup-password'], S.PASSWORD_RE);
  assert.equal(response.headers['x-backup-info'], undefined);
  const { files } = S.extractZip(response.buffer, response.headers['x-backup-password'], sandbox.dir('http-zip'));
  assert.deepEqual(Object.keys(files), [SQL_FILE]);
  assert.equal(files[SQL_FILE].toString('utf8'), CLEAN_SQL);
  assert.deepEqual(S.listDir(sandbox.backupDir), []);
  assert.equal(calls.length, 1);
});

test('SQL cleanup failure is swallowed but ZIP cleanup still proceeds (known residual-file behavior)', async (t) => {
  const blocked = path.join(sandbox.backupDir, SQL_FILE);
  const unlink = fs.unlinkSync;
  const spy = t.mock.method(fs, 'unlinkSync', function (file) {
    if (file === blocked) throw Object.assign(new Error('synthetic sharing violation'), { code: 'EBUSY' });
    return unlink.call(this, file);
  });
  try {
    const response = await S.call(ctrl.exportPgDump);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.tempAfter, [SQL_FILE]);
    assert.equal(fs.existsSync(response.sentFile), false);
  } finally {
    spy.mock.restore();
    if (fs.existsSync(blocked)) unlink(blocked);
  }
});
