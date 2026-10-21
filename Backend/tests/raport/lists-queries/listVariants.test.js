const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./_support');
function configure({ regs = [S.registration()], relatives = [], signers = [S.signers.s1, S.signers.s2], types = [S.raportType()], sessions = [] } = {}) {
  S.prisma.reset();
  S.prisma.when('registration.findMany', regs);
  S.prisma.when('relatives.findMany', relatives);
  S.prisma.when('registration.findFirst', a => regs.find(r => r.id === a.where.id) || null);
  S.prisma.when('relatives.findFirst', a => relatives.find(r => r.id === a.where.id) || null);
  S.prisma.when('session.findMany', sessions);
  S.prisma.when('signList.findMany', signers);
  S.prisma.when('admin.findUnique', S.admin);
  S.routeRaportTypes(() => types);
}
const body = { ids: ['reg-0001'], signListIds: ['sign-0001', 'sign-0002'], raport_data: '2026-01-15T09:00:00Z' };
describe('generateMalumotnomaList — variable rows, signers and selection', () => {
  test('30 records retain every cell padding, alignment, font size and row order', async () => {
    const regs = Array.from({ length: 30 }, (_, i) => S.registration({ id: `reg-${i}`, firstName: `Имя-${i}`, birthDate: new Date(`${1970 + i}-03-12T00:00:00Z`), birthYear: 1970 + i }));
    configure({ regs });
    const r = await S.run(S.ctrl.generateMalumotnomaList, { ...body, ids: regs.map(v => v.id) });
    assert.equal(r.res.statusCode, 200);
    const table = r.doc.tables.find(t => t.rows[0].cells[0].text === 'Ф.И.О.');
    assert.equal(table.rows.length, 31);
    assert.deepEqual(table.grid, [100, 100, 100]);
    for (const [index, row] of table.rows.entries()) {
      assert.equal(row.cells.length, 3);
      assert.equal(row.isHeader, false); // Current output does not repeat table headers.
      assert.equal(row.cantSplit, false);
      for (const cell of row.cells) {
        assert.deepEqual(cell.margins, { top: 100, left: 100, bottom: 100, right: 100 });
        assert.equal(cell.verticalAlign, 'center');
        assert.equal(cell.gridSpan, 1);
        assert.equal(cell.vMerge, undefined);
        for (const p of cell.paragraphs) {
          assert.equal(p.alignment, 'center');
          assert.equal(p.indent, undefined);
          for (const run of p.runs) { assert.equal(run.size, 24); assert.equal(run.bold, false); }
        }
      }
      if (index) {
        assert.ok(row.cells[0].text.startsWith(`Имя-${index - 1} `));
        assert.equal(row.cells[1].text, `${1970 + index - 1} г.`);
      }
    }
    assert.deepEqual(S.prisma.calls('raportLink.create')[0].data.registrations.connect, regs.map(r => ({ id: r.id })));
  });
  test('type8 switches title to refusal notification while retaining the record table', async () => {
    configure();
    const r = await S.run(S.ctrl.generateMalumotnomaList, { ...body, name: 'type8' });
    assert.equal(r.res.statusCode, 200);
    assert.match(r.doc.text, /уведомление об ОТКАЗЕ в допуске/);
    assert.ok(r.doc.tables.some(t => t.rows[0].cells[0].text === 'Ф.И.О.'));
    assert.equal(S.prisma.calls('raportLink.create')[0].data.code, 'type8');
  });
  test('omitting signListIds passes an undefined filter and includes returned signers (known broad selection)', async () => {
    configure();
    const r = await S.run(S.ctrl.generateMalumotnomaList, { ids: body.ids });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(S.prisma.calls('signList.findMany'), [{ where: { id: { in: undefined } } }]);
    assert.match(r.doc.text, /Каримов Б\.Р\./);
    assert.match(r.doc.text, /Юсупова Д\.А\./);
  });
  test('missing signers returned as an empty array still generate an unsigned list', async () => {
    configure({ signers: [] });
    const r = await S.run(S.ctrl.generateMalumotnomaList, body);
    assert.equal(r.res.statusCode, 200);
    assert.doesNotMatch(r.doc.text, /Каримов|Юсупова/);
    assert.equal(S.prisma.calls('raport.create').length, 1);
  });
  test('session fallback loads relatives after failed registration lookup and drops unresolved IDs', async () => {
    configure({ regs: [], relatives: [S.relative()], sessions: [{ registrationId: 'rel-0001' }, { registrationId: 'missing' }] });
    const r = await S.run(S.ctrl.generateMalumotnomaList, { ...body, ids: [], type: 'RESERVE' });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(S.prisma.calls('session.findMany'), [{ where: { adminId: S.ADMIN_ID, type: 'RESERVE' } }]);
    assert.deepEqual(S.prisma.calls('raportLink.create')[0].data.registrations.connect, [{ id: 'rel-0001' }]);
    assert.match(r.doc.text, /Тилаволди/);
    // Relation persistence is mocked: a real registration FK may reject this relative ID.
  });
  test('no matching records stops before signer/template and persistence lookups', async () => {
    configure({ regs: [], relatives: [] });
    const r = await S.run(S.ctrl.generateMalumotnomaList, body);
    assert.equal(r.res.statusCode, 404);
    assert.equal(r.files.length, 0);
    assert.equal(S.prisma.calls('signList.findMany').length, 0);
    assert.equal(S.prisma.calls('raport.create').length, 0);
  });
});
describe('generateRelativeList — mixed sources and templates', () => {
  test('mixed records are sorted by name while the report link uses the first fetched registration', async () => {
    configure({ regs: [S.registration(), S.registration({ id: 'reg-2', firstName: 'Второй' })], relatives: [S.relative()] });
    const r = await S.run(S.ctrl.generateRelativeList, { ...body, ids: ['rel-0001', 'reg-2', 'reg-0001'] });
    assert.equal(r.res.statusCode, 200);
    const text = r.doc.text.toLocaleLowerCase('ru-RU');
    assert.ok(text.includes('тохир') && text.includes('второй') && text.includes('тилаволди каримович'));
    assert.ok(text.indexOf('второй') < text.indexOf('тилаволди каримович'));
    assert.ok(text.indexOf('тилаволди каримович') < text.indexOf('тохир'));
    assert.deepEqual(S.prisma.calls('raportLink.create')[0].data.registrations.connect, [{ id: 'reg-0001' }]);
    assert.equal(S.prisma.calls('registration.update').length, 0);
  });
  test('type1 and type2 produce separate sections while disabled type3 is omitted', async () => {
    configure({ types: [S.raportType({ link: 'type1' }), S.raportType({ link: 'type2' }), S.raportType({ link: 'type3' })] });
    const r = await S.run(S.ctrl.generateRelativeList, body);
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.doc.sections.length, 2);
    assert.deepEqual(r.doc.sections[0].page, r.doc.sections[1].page);
    assert.deepEqual(r.doc.sections[0].margins, r.doc.sections[1].margins);
    assert.equal(r.files.length, 1);
    assert.equal(S.prisma.calls('raport.create').length, 1);
  });
  test('omitted signListIds uses all returned signers and empty returned signers still succeeds', async () => {
    configure();
    const all = await S.run(S.ctrl.generateRelativeList, { ids: body.ids });
    assert.equal(all.res.statusCode, 200);
    assert.deepEqual(S.prisma.calls('signList.findMany')[0].where.id, { in: undefined });
    assert.match(all.doc.text, /Каримов Б\.Р\./);
    configure({ signers: [] });
    const empty = await S.run(S.ctrl.generateRelativeList, body);
    assert.equal(empty.res.statusCode, 200);
    assert.doesNotMatch(empty.doc.text, /Каримов|Юсупова/);
  });
});
