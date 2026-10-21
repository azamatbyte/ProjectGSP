const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./_support');

const PAGE = { width: 11906, height: 16838, orientation: 'portrait' };
const MARGINS = { top: 1133, right: 850, bottom: 1133, left: 1417, header: 708, footer: 708, gutter: 0 };
const padding = value => ({ top: value, left: value, bottom: value, right: value });
const pct = size => ({ size: `${size}%`, type: 'pct' });
const body = { ids: ['reg-0001'], signListIds: ['sign-0001', 'sign-0002'], raport_data: '2026-01-15T09:00:00Z' };

function configure({ regs = [S.registration()], signers = [S.signers.s1, S.signers.s2], types = [S.raportType()], overrides = {} } = {}) {
  S.prisma.reset();
  S.prisma.when('registration.findMany', regs);
  S.prisma.when('relatives.findMany', []);
  S.prisma.when('signList.findMany', signers);
  S.prisma.when('admin.findUnique', S.admin);
  S.routeRaportTypes(() => types);
  for (const [key, value] of Object.entries(overrides)) S.prisma.when(key, value);
}

// These are regression contracts for serialized Word output, including current
// inherited formatting and oversized percentage widths. They do not establish
// that Word's rendered pagination or those legacy widths are visually correct.
for (const [handler, fontSize] of [['generateMalumotnomaList', 24], ['generateRelativeList', 28]]) {
  describe(`${handler} — page, signature and failure contracts`, () => {
    for (const count of [0, 1, 3]) {
      test(`${count} signers: all signature cells retain padding, widths, run styling and date merge`, async () => {
        const signers = Object.values(S.signers).slice(0, count);
        configure({ signers });
        const { res, doc } = await S.run(S.ctrl[handler], body);
        assert.equal(res.statusCode, 200);
        assert.equal(doc.sections.length, 1);
        assert.deepEqual(doc.sections[0].page, PAGE);
        assert.deepEqual(doc.sections[0].margins, MARGINS);
        assert.deepEqual(doc.sections[0].headers, {});
        assert.deepEqual(doc.sections[0].footers, {});
        assert.equal(doc.pageBreakCount, 0);
        const table = doc.tables.find(t => t.rows[0].cells.some(c => c.text.includes('Имзо (подпись)')));
        assert.ok(table);
        assert.deepEqual(table.borders, S.NO_BORDERS);
        assert.deepEqual(table.width, pct(5000), 'Legacy width is serialized as 5000%, not 100%');
        assert.deepEqual(table.grid, [100, 100, 100]);
        assert.equal(table.cellMargins, undefined);
        assert.equal(table.rows.length, Math.max(1, count) + 1);
        for (const [rowIndex, row] of table.rows.slice(0, -1).entries()) {
          assert.deepEqual(row.cells.map(c => c.width), [pct(1750), pct(1750), pct(1500)]);
          assert.equal(row.isHeader, false);
          assert.equal(row.cantSplit, false);
          assert.equal(row.height, undefined);
          for (const [column, cell] of row.cells.entries()) {
            assert.equal(cell.margins, undefined, 'Signature padding is inherited');
            assert.equal(cell.verticalAlign, 'center');
            assert.equal(cell.gridSpan, 1);
            assert.equal(cell.vMerge, undefined);
            assert.equal(cell.shading, undefined);
            assert.equal(cell.paragraphs.length, 1);
            const paragraph = cell.paragraphs[0];
            assert.equal(paragraph.alignment, 'center');
            assert.equal(paragraph.spacing, undefined);
            assert.equal(paragraph.indent, undefined);
            assert.equal(paragraph.runs.length, 2);
            const [value, label] = paragraph.runs;
            assert.equal(value.size, fontSize);
            assert.equal(value.sizeCs, fontSize);
            assert.equal(value.bold, false);
            assert.equal(value.underline, count && column !== 1 ? 'single' : undefined);
            assert.equal(value.font, undefined, 'Value font currently inherits Word defaults');
            assert.equal(label.size, fontSize);
            assert.equal(label.font.ascii, 'Times New Roman');
            assert.deepEqual(label.breaks, ['textWrapping']);
          }
          assert.equal(row.cells[0].paragraphs[0].runs[0].text, count ? signers[rowIndex].position : '____________________');
          assert.equal(row.cells[2].paragraphs[0].runs[0].text, count
            ? `${signers[rowIndex].lastName} ${signers[rowIndex].firstName[0]}.${signers[rowIndex].fatherName[0]}.`
            : '____________________');
        }
        const dateCells = table.rows.at(-1).cells;
        assert.equal(dateCells.length, 2);
        assert.deepEqual(dateCells.map(c => c.gridSpan), [1, 2]);
        assert.deepEqual(dateCells.map(c => c.width), [pct(1750), pct(3250)]);
        assert.equal(dateCells[0].paragraphs[0].text, handler === 'generateRelativeList' ? '\n2026г.' : '\n15 января 2026 г');
        for (const p of dateCells[0].paragraphs) {
          assert.equal(p.alignment, 'center');
          assert.deepEqual(p.spacing, { before: 0, after: 0 });
        }
        const line = dateCells[0].paragraphs[1];
        assert.deepEqual(line.borders.bottom, { val: undefined, size: 40, space: 1, color: '000000' });
        assert.equal(line.runs[0].size, 12);
        assert.equal(line.runs[0].bold, true);
      });
    }

    for (const failure of ['registration.findMany', 'raport.create', 'raportLink.create']) {
      test(`${failure} failure returns 500 without publishing a file`, async () => {
        configure({ overrides: { [failure]: () => { throw new Error(`fixture ${failure} unavailable`); } } });
        const r = await S.run(S.ctrl[handler], body);
        assert.equal(r.res.statusCode, 500);
        assert.deepEqual(r.res.body, { code: 500, message: 'Internal server error', error: `fixture ${failure} unavailable` });
        assert.equal(r.files.length, 0);
        assert.equal(S.prisma.calls('registration.update').length, 0);
        assert.equal(S.prisma.calls('raport.create').length, failure === 'registration.findMany' ? 0 : 1);
        assert.equal(S.prisma.calls('raportLink.create').length, failure === 'raportLink.create' ? 1 : 0);
      });
    }
  });
}

describe('generateMalumotnomaList — nested recipient and list geometry', () => {
  test('recipient box padding differs from all record cells; borders and widths remain explicit', async () => {
    configure();
    const { doc } = await S.run(S.ctrl.generateMalumotnomaList, body);
    const nested = doc.tables.filter(t => t.nested);
    assert.equal(nested.length, 1);
    const box = nested[0];
    assert.deepEqual(box.width, { size: 100, type: 'auto' });
    assert.deepEqual(box.grid, [100]);
    assert.deepEqual(box.rows[0].cells[0].margins, { top: 200, left: 400, bottom: 200, right: 400 });
    assert.equal(box.rows[0].cells[0].paragraphs[0].alignment, 'center');
    const records = doc.tables.find(t => t.rows[0].cells[0].text === 'Ф.И.О.');
    assert.deepEqual(records.width, pct(5000));
    assert.deepEqual(records.grid, [100, 100, 100]);
    for (const table of [box, records]) {
      for (const border of Object.values(table.borders)) {
        assert.deepEqual(border, { val: 'single', size: 4, space: undefined, color: 'auto' });
      }
    }
    for (const row of records.rows) for (const cell of row.cells) {
      assert.deepEqual(cell.margins, padding(100));
      assert.deepEqual(cell.width, pct(1250));
    }
    const notes = doc.findParagraph('Примечание по спискам');
    assert.deepEqual(notes.spacing, { before: 276, after: 0 });
    assert.equal(notes.alignment, 'left');
    assert.equal(notes.runs[0].size, 20);
    assert.equal(notes.runs[0].bold, true);
    assert.deepEqual(notes.runs[0].breaks, ['textWrapping', 'textWrapping']);
  });
});

describe('generateRelativeList — both table sort variants', () => {
  test('each section retains every header/body cell margin, width, size and independent row ordering', async () => {
    const regs = [S.registration({ id: 'r-a', lastName: 'Алиев', regNumber: '200' }), S.registration({ id: 'r-z', lastName: 'Якубов', regNumber: '100' })];
    configure({ regs, types: [S.raportType({ link: 'type1' }), S.raportType({ link: 'type2' })] });
    const { res, doc } = await S.run(S.ctrl.generateRelativeList, { ...body, ids: regs.map(r => r.id) });
    assert.equal(res.statusCode, 200);
    assert.equal(doc.sections.length, 2);
    for (const section of doc.sections) {
      assert.deepEqual(section.page, PAGE);
      assert.deepEqual(section.margins, MARGINS);
    }
    const tables = doc.tables.filter(t => t.rows[0].cells[0].text === '№');
    assert.equal(tables.length, 2);
    assert.deepEqual(tables.map(t => t.rows.slice(1).map(r => r.cells[1].text)), [['200', '100'], ['100', '200']]);
    for (const table of tables) {
      assert.deepEqual(table.width, pct(100));
      assert.deepEqual(table.grid, Array(6).fill(100));
      assert.equal(table.cellMargins, undefined);
      assert.equal(table.layout, undefined);
      for (const [rowIndex, row] of table.rows.entries()) {
        assert.equal(row.isHeader, false, 'Current output does not repeat headers across pages');
        assert.equal(row.cantSplit, false);
        assert.deepEqual(row.cells.map(c => c.width), [7, 7, 36, 7, 10, 33].map(pct));
        for (const [column, cell] of row.cells.entries()) {
          assert.deepEqual(cell.margins, padding(rowIndex ? 20 : 100));
          assert.equal(cell.verticalAlign, 'center');
          assert.equal(cell.gridSpan, 1);
          assert.equal(cell.vMerge, undefined);
          assert.equal(cell.shading, undefined);
          for (const p of cell.paragraphs) {
            assert.equal(p.alignment, 'center');
            assert.equal(p.spacing, undefined);
            assert.equal(p.indent, undefined);
            for (const run of p.runs) {
              assert.equal(run.size, !rowIndex && column === 5 ? 24 : 28);
              assert.equal(run.font, undefined);
              assert.equal(run.bold, false);
            }
          }
        }
      }
    }
  });
});
