// Composes real authentication, router, controller, serializer and download
// middleware. Only persistence, configuration and the upload directory are fake.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { startServer } = require('../helpers/pipeServer');
const { inspectDocx } = require('../helpers/docxInspector');
const { S, F, NOW, cases, configure, layout } = require('../raport/_layoutSupport');
const endpoints = require('../helpers/documentEndpoints');

const secret = 'generated-documents-integration-tests-only';
const backend = path.resolve(__dirname, '../..');
function replace(id, exports) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
replace(require.resolve('../../config/auth.config'), { secret });
const env = S.boot();
replace(require.resolve('@prisma/client'), { PrismaClient: function () { return env.prisma; } });
const api = express.Router();
api.use('/raport', require('../../api/router/raport'));
api.use('/conclusion', require('../../api/router/conclusion'));
replace(require.resolve('../../api/router'), api);
replace(require.resolve('swagger-jsdoc'), () => ({}));
replace(require.resolve('swagger-ui-express'), {
  serve: (_req, _res, next) => next(), setup: () => (_req, _res, next) => next(),
});
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'gsp-generated-http-'));
const uploads = path.join(sandbox, 'uploads');
fs.mkdirSync(uploads);
let server;
before(async () => {
  const app = express();
  app.use(express.json());
  const realStatic = express.static;
  express.static = (dir, options) => realStatic(
    path.resolve(dir) === path.join(backend, 'uploads') ? uploads : path.join(sandbox, 'empty-build'), options);
  try { require('../../app/registerRoutes').registerRoutes(app); }
  finally { express.static = realStatic; }
  server = await startServer(app);
});
after(async () => {
  try { if (server) await server.close(); }
  finally {
    env.shutdown();
    assert.ok(path.resolve(sandbox).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
function authorize() {
  env.prisma.when('admin.findUnique', { ...F.admin(), id: 'admin-1', role: 'admin', status: 'active' });
  return { 'x-access-token': jwt.sign({ id: 'admin-1' }, secret, { expiresIn: '1h' }) };
}

for (const variant of cases) {
  const endpoint = endpoints.find(e => e.mount === 'raport' && e.handler === variant.handler);
  test(`${endpoint.url} (${variant.name}): authenticated generation → persisted URL → exact downloadable DOCX`, async () => {
    configure(env, variant);
    mock.timers.enable({ apis: ['Date'], now: NOW });
    const consoleMethods = { log: console.log, error: console.error, warn: console.warn };
    console.log = console.error = console.warn = () => {};
    try {
      const response = await server.request(endpoint.url, {
        method: 'POST', body: variant.body, headers: authorize(),
      });
      await S.flush();
      assert.equal(response.status, 200, response.buffer.toString());
      assert.match(response.headers['content-type'], /^application\/json/);
      assert.equal(response.headers['content-disposition'], undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
      const result = response.json();
      assert.match(result.link, env.LINK_RE);
      assert.equal(env.cap.files.length, 1);
      const file = env.cap.last();
      const url = new URL(result.link);
      assert.equal(path.basename(url.pathname), path.basename(file.path));
      assert.equal(env.prisma.calls('raport.create')[0].data.link, result.link);
      assert.equal(env.prisma.calls('raport.create')[0].data.executorId, 'admin-1');
      // Materialize only the captured synthetic bytes in the private static root.
      fs.writeFileSync(path.join(uploads, path.basename(file.path)), file.buffer);
      const download = await server.request(`${url.pathname}?newFileName=${encodeURIComponent('Проверка документа.pdf')}`);
      assert.equal(download.status, 200);
      assert.equal(download.headers['content-type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      assert.equal(Number(download.headers['content-length']), file.buffer.length);
      assert.equal(download.headers['cache-control'], 'public, max-age=300');
      assert.ok(download.headers['content-disposition'].endsWith(`filename*=UTF-8''${encodeURIComponent('Проверка документа.docx')}`));
      assert.deepEqual(download.buffer, file.buffer);
      const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../raport/layouts', `${variant.name}.json`), 'utf8'));
      assert.deepEqual(layout(inspectDocx(download.buffer)), expected, 'Downloaded file retains every expected layout property');
      assert.equal(env.uploadsCount(), env.uploadsBefore);
    } finally {
      mock.timers.reset();
      Object.assign(console, consoleMethods);
    }
  });
}

test('raport download lookup composes real auth, controller and stored-link response', async () => {
  env.prisma.reset(); env.cap.clear();
  env.prisma.when('raportLink.findFirst', { raport: { link: 'https://documents.test.invalid/api/v1/download/stored.docx', name: 'Stored report' } });
  const headers = authorize();
  const denied = await server.request('/api/v1/raport/download?registrationId=reg-1&code=type123');
  assert.equal(denied.status, 403);
  assert.equal(env.prisma.calls('raportLink.findFirst').length, 0);
  const response = await server.request('/api/v1/raport/download?registrationId=reg-1&code=type123', { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json().data, { link: 'https://documents.test.invalid/api/v1/download/stored.docx', name: 'Stored report' });
  assert.equal(env.cap.files.length, 0, 'Lookup does not regenerate a document');
});

test('conclusion generator stub explicitly returns pending implementation, with no generated file or DB mutation', async () => {
  env.prisma.reset(); env.cap.clear();
  const url = '/api/v1/conclusion/genreate_conclusion';
  assert.equal((await server.request(url, { method: 'POST', body: {} })).status, 403);
  const response = await server.request(url, { method: 'POST', body: {}, headers: authorize() });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json(), { message: 'genreate_conclusion is pending implementation' });
  assert.equal(response.headers['content-disposition'], undefined);
  assert.equal(env.cap.files.length, 0);
  assert.deepEqual(env.prisma.log.map(call => call.key), ['admin.findUnique']);
});
