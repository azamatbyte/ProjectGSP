const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakePrisma } = require('../helpers/fakePrisma');
const { captureGeneratedFiles } = require('../helpers/captureFiles');
const { inspectXlsx } = require('../helpers/xlsxInspector');
const { startServer } = require('../helpers/pipeServer');
const S = require('./_support');
const prisma = installFakePrisma();
const ctrl = require('../../api/controllers/registerController');
let cap;
before(() => { cap = captureGeneratedFiles(); });
after(() => cap.restore());
beforeEach(() => {
  prisma.reset(); cap.clear();
  prisma.when('admin.findUnique', S.EXECUTOR);
  prisma.when('$queryRawUnsafe', S.exportRows());
});
const assertReadOnly = () => {
  assert.equal(cap.files.length, 0);
  assert.deepEqual(prisma.log.map(call => call.key), ['admin.findUnique', '$queryRawUnsafe']);
};

test('serialization failure returns JSON 500 before attachment headers or file writes', async () => {
  const xlsx = require('exceljs/lib/xlsx/xlsx').prototype;
  const serialize = mock.method(xlsx, 'writeBuffer', async () => { throw new Error('synthetic serialization failure'); });
  const quiet = mock.method(console, 'error', () => {});
  try {
    const res = await S.callExport(ctrl, {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: 'Internal server error', error: 'synthetic serialization failure' });
    assert.deepEqual(res.headers, {});
    assert.equal(serialize.mock.callCount(), 1);
    assertReadOnly();
  } finally { serialize.mock.restore(); quiet.mock.restore(); }
});

for (const field of ['birth_date', 'reg_date', 'reg_end_date', 'expired', 'updatedat']) {
  test(`invalid stored ${field} aborts entire export before serialization (current behavior)`, async () => {
    prisma.when('$queryRawUnsafe', [{ ...S.exportRows()[0], [field]: 'not-a-date' }]);
    const quiet = mock.method(console, 'error', () => {});
    try {
      const res = await S.callExport(ctrl, {});
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { code: 500, message: 'Internal server error', error: 'Invalid time value' });
      assert.deepEqual(res.headers, {});
      assertReadOnly();
    } finally { quiet.mock.restore(); }
  });
}

test('formula-like text and leading-zero identifiers remain literal strings after XLSX serialization', async () => {
  const values = ['=SUM(1,2)', '+123', '-456', '@command', "'quoted", '00001234567890'];
  prisma.when('$queryRawUnsafe', values.map(value => ({ ...S.exportRows()[0], full_name: value, notes: value, pinfl: value, passport: value })));
  const res = await S.callExport(ctrl, {});
  assert.equal(res.statusCode, 200);
  const sheet = (await inspectXlsx(res.body)).sheet('Поиск');
  values.forEach((value, index) => {
    for (const col of ['F', 'M', 'N', 'R']) {
      const cell = sheet.cell(`${col}${index + 5}`);
      assert.equal(cell.value, value);
      assert.equal(cell.type, 3, 'String cell, not formula or number');
    }
  });
  assertReadOnly();
});

test('80 long Unicode records retain every row, wrapped borders, capped widths and print margins', async () => {
  const text = 'Ўзбекистон <АО> & "Тест" 🧪\n' + 'Длинные сведения '.repeat(35);
  const rows = Array.from({ length: 80 }, (_, i) => ({ ...S.exportRows()[0], full_name: `Имя ${i}`, notes: `${i}: ${text}` }));
  prisma.when('$queryRawUnsafe', rows);
  const res = await S.callExport(ctrl, {});
  assert.equal(res.statusCode, 200);
  const sheet = (await inspectXlsx(res.body)).sheet('Поиск');
  assert.equal(sheet.rowCount, 84);
  assert.deepEqual(sheet.pageSetup.margins, { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 });
  assert.equal(sheet.columns[17].width, 40);
  rows.forEach((row, index) => {
    assert.equal(sheet.cell(`A${index + 5}`).value, index + 1);
    assert.equal(sheet.cell(`F${index + 5}`).value, row.full_name);
    assert.equal(sheet.cell(`R${index + 5}`).value, row.notes);
    for (const cell of sheet.row(index + 5)) {
      assert.deepEqual(cell.alignment, { vertical: 'middle', wrapText: true }, cell.address);
      assert.deepEqual(cell.border, { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }, cell.address);
    }
  });
  assertReadOnly();
});

test('null request body exports unfiltered records without pagination', async () => {
  const res = await S.callExport(ctrl, null);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(prisma.calls('$queryRawUnsafe')[0][0], /WHERE|LIMIT|OFFSET/);
  assertReadOnly();
});

test('real register router authenticates and authorizes before returning a readable XLSX attachment', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const secret = 'register-export-route-test-only';
  const replace = (id, exports) => { require.cache[id] = { id, filename: id, loaded: true, exports }; };
  replace(require.resolve('@prisma/client'), { PrismaClient: function () { return prisma; } });
  replace(require.resolve('../../config/auth.config'), { secret });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/register', require('../../api/router/register'));
  const server = await startServer(app);
  const url = '/api/v1/register/globalSearchExport';
  try {
    const denied = await server.request(url, { method: 'POST', body: {} });
    assert.equal(denied.status, 403);
    assert.equal(prisma.log.length, 0);
    const headers = { 'x-access-token': jwt.sign({ id: 'test-admin' }, secret, { expiresIn: '1h' }) };
    prisma.when('admin.findUnique', { ...S.EXECUTOR, id: 'test-admin', role: 'admin' });
    const wrongRole = await server.request(url, { method: 'POST', body: {}, headers });
    assert.equal(wrongRole.status, 406);
    assert.equal(prisma.calls('$queryRawUnsafe').length, 0);
    prisma.when('admin.findUnique', { ...S.EXECUTOR, id: 'test-admin', role: 'superAdmin' });
    const response = await server.request(url, { method: 'POST', body: { regNumber: '1708-19' }, headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(response.headers['content-disposition'], /^attachment; filename="global_search_export_.*_Admin_Super.xlsx"$/);
    assert.equal(Number(response.headers['content-length']), response.buffer.length);
    const sheet = (await inspectXlsx(response.buffer)).sheet('Поиск');
    assert.equal(sheet.rowCount, 8);
    assert.equal(sheet.cell('F5').value, S.exportRows()[0].full_name);
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls('$queryRawUnsafe').length, 1);
  } finally { await server.close(); }
});
