const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { installFakePrisma } = require('../helpers/fakePrisma');
const { captureGeneratedFiles } = require('../helpers/captureFiles');
const S = require('./_support');
const prisma = installFakePrisma();
const ctrl = require('../../api/controllers/registerFourController');
const xlsx = require('exceljs/lib/xlsx/xlsx').prototype;
const NOW = new Date('2026-01-15T09:00:00Z');
const TEXT = 'Ўзбекистон & <Тест> "Oʻzbekiston"\n' + 'Длинное название организации '.repeat(15);
const person = {
  id: 'person-1', registrationId: 'person-1', registration: 'person-1',
  regNumber: '100-26', lastName: TEXT, firstName: '=1+1', fatherName: 'Анварович',
  birthYear: 1980, workplace: TEXT, birthPlace: TEXT, order: 1,
  kompromat_status: true,
};
const cases = [
  ['exportTemporaryDataToExcel', { type: 'SESSION' }, 'Temporary Data'],
  ['exportSverkaMain', { type: 'SESSION' }, 'Сверка'],
  ['exportSverka', { executorId: 'operator-1', komprMaterials: true }, 'Сверка'],
];
let cap;
before(() => {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  cap = captureGeneratedFiles();
});
after(() => { cap.restore(); mock.timers.reset(); });
beforeEach(() => {
  prisma.reset(); cap.clear();
  prisma.when('session.findMany', [person]);
  prisma.when('temporaryData.findMany', [person]);
  prisma.when('registration.findMany', [person]);
  prisma.when('relatives.findMany', []);
  prisma.when('registration.findUnique', { id: 'person-1', model: 'registration', accessStatus: 'ДОПУСК', expired: NOW, notes: TEXT });
});

for (const [handler, body, sheetName] of cases) {
  for (const stage of ['writeBuffer', 'writeFile']) {
    test(`${handler}: ${stage} failure returns 500 without link, file or metadata`, async () => {
      const original = xlsx[stage];
      xlsx[stage] = async () => { throw new Error(`${stage} synthetic failure`); };
      try {
        const res = await S.quiet(() => S.call(ctrl[handler], { body, userId: 'operator-1' }));
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { code: 500, message: 'Internal server error', error: `${stage} synthetic failure` });
        assert.equal(res.body.link, undefined);
        assert.equal(cap.files.length, 0);
        assert.equal(prisma.calls('raport.create').length, 0);
        assert.equal(prisma.calls('raportLink.create').length, 0);
      } finally { xlsx[stage] = original; }
    });
  }

  test(`${handler}: long Unicode/XML text and formula-like text survive real XLSX serialization`, async () => {
    const res = await S.call(ctrl[handler], { body, userId: 'operator-1' });
    assert.equal(res.statusCode, 200);
    assert.equal(cap.files.length, 1);
    const sheet = (await S.inspectXlsx(cap.last().buffer)).sheet(sheetName);
    const temporary = handler === 'exportTemporaryDataToExcel';
    const row = temporary ? 2 : 6;
    const nameAddress = `${temporary ? 'C' : 'B'}${row}`;
    const formulaAddress = `${temporary ? 'D' : 'C'}${row}`;
    assert.equal(sheet.cell(nameAddress).value, TEXT);
    assert.equal(sheet.cell(formulaAddress).value, '=1+1');
    assert.equal(sheet.cell(formulaAddress).type, 3, 'User text remains a string, never an Excel formula');
    assert.equal(sheet.raw.getCell(formulaAddress).formula, undefined);
    assert.equal(sheet.cell(`${temporary ? 'G' : 'F'}${row}`).value, TEXT);
    assert.deepEqual(sheet.pageSetup, S.defaultPageSetup(temporary ? 'portrait' : 'landscape'));
    if (!temporary) {
      assert.equal(sheet.rows[row].height, 20, 'Characterization: fixed height does not grow for multiline text');
      assert.deepEqual(sheet.cell(nameAddress).alignment, S.LEFT_MIDDLE);
      assert.deepEqual(sheet.cell(nameAddress).border, S.THIN_BOX);
    }
    if (handler === 'exportSverka') {
      assert.equal(sheet.cell('I6').value, TEXT.trim());
      assert.deepEqual(sheet.cell('I6').alignment, { ...S.LEFT_MIDDLE, wrapText: true });
      assert.equal(prisma.calls('raport.create')[0].data.executorId, 'operator-1');
    }
  });
}

for (const model of ['registration', 'relatives']) {
  test(`exportTemporaryDataToExcel: ${model} query failure aborts without serializing partial results`, async () => {
    prisma.when(`${model}.findMany`, () => { throw new Error(`${model} unavailable`); });
    const res = await S.quiet(() => S.call(ctrl.exportTemporaryDataToExcel, { body: { type: 'SESSION' } }));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, `${model} unavailable`);
    assert.equal(cap.files.length, 0);
    if (model === 'registration') assert.equal(prisma.calls('relatives.findMany').length, 0);
  });
}

test('exportSverka: failed link insert leaves the generated file and report row (known persistence defect)', async () => {
  prisma.when('raport.create', args => ({ id: 'report-1', ...args.data }));
  prisma.when('raportLink.create', () => { throw new Error('link unavailable'); });
  const res = await S.quiet(() => S.call(ctrl.exportSverka, { body: { executorId: 'operator-1' } }));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'link unavailable');
  assert.equal(res.body.link, undefined);
  assert.equal(cap.files.length, 1);
  assert.equal(prisma.calls('raport.create').length, 1);
  assert.deepEqual(prisma.calls('raportLink.create')[0], { data: { raportId: 'report-1', display: true } });
  assert.equal(prisma.calls('raport.delete').length, 0, 'No rollback of the created report');
  assert.equal((await S.inspectXlsx(cap.last().buffer)).sheet('Сверка').cell('B6').value, TEXT);
});

test('exportSverka: one failed status lookup preserves the other status and its notes', async () => {
  prisma.when('temporaryData.findMany', [{ ...person, registration_four: 'form4-1' }]);
  prisma.when('registration.findUnique', args => {
    if (args.where.id === 'person-1') throw new Error('one lookup failed');
    return { accessStatus: 'ОТКАЗ', regDate: NOW, notes: 'Другой источник' };
  });
  const res = await S.quiet(() => S.call(ctrl.exportSverka, { body: { executorId: 'operator-1', komprMaterials: true } }));
  assert.equal(res.statusCode, 200);
  const sheet = (await S.inspectXlsx(cap.last().buffer)).sheet('Сверка');
  assert.equal(sheet.cell('G6').value, 'Ошибка');
  assert.equal(sheet.cell('H6').value, 'ОТКАЗ от 15.01.2026');
  assert.equal(sheet.cell('I6').value, 'Другой источник');
  assert.equal(prisma.calls('raport.create').length, 1);
});
