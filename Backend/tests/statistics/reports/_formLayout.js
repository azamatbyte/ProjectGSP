const assert = require('node:assert/strict');
const S = require('./_support');
const M = require('../monitoring-dashboard/_support');

// Exact OOXML contracts, not rendered-page screenshots. Unspecified padding
// and fonts are asserted as absent, so adding explicit overrides is detected.
function assertFrame(doc, title) {
  assert.equal(doc.sections.length, 1);
  const section = doc.sections[0];
  assert.deepEqual(section.page, S.PAGE);
  assert.deepEqual(section.margins, S.MARGINS);
  assert.deepEqual(section.headers, {});
  assert.deepEqual(section.footers, {});
  assert.equal(section.columns, undefined);
  assert.equal(section.titlePage, undefined);
  assert.equal(doc.pageBreakCount, 0);
  assert.deepEqual(doc.styles.defaults, {
    run: {},
    paragraph: {}
  });
  assert.deepEqual(doc.blocks.map(b => b.type), ['paragraph', 'paragraph', 'table', 'paragraph', 'paragraph', 'paragraph']);
  M.assertTitle(doc.paragraphs[0], title);
  M.assertSeparator(doc.paragraphs[1]);
  M.assertWhiteHairline(doc.paragraphs[2]);
  M.assertBlackLine(doc.paragraphs[3]);
  M.assertDateFooter(doc.paragraphs[4]);
  for (const p of doc.allParagraphs) {
    for (const key of ['indent', 'tabs', 'keepNext', 'keepLines', 'pageBreakBefore', 'numbering', 'shading']) {
      assert.equal(p[key], undefined, `${key} on ${p.text}`);
    }
    for (const r of p.runs) {
      for (const key of ['font', 'underline', 'strike', 'caps', 'smallCaps', 'highlight', 'characterSpacing', 'vertAlign']) {
        assert.equal(r[key], undefined, `${key} on ${r.text}`);
      }
    }
  }
}
const cell = (text, width, size = 24, extra = {}) => S.cell({
  width: S.pct(width),
  verticalAlign: 'center',
  ...extra,
  paragraphs: [S.cellPara(String(text), size, {
    alignment: 'center'
  }, {
    bold: false
  })]
});
function assertRows(doc, expectedRows, kind = 'form') {
  const table = doc.tables[0];
  M.assertTableShell(table, kind === 'workplace' ? 7 : 9);
  for (const row of table.rows) {
    assert.equal(row.height, undefined);
    assert.equal(row.isHeader, false);
    assert.equal(row.cantSplit, false);
    for (const c of row.cells) {
      assert.equal(c.margins, undefined);
      assert.equal(c.borders, undefined);
      assert.equal(c.shading, undefined);
      assert.equal(c.textDirection, undefined);
      assert.deepEqual(c.tables, []);
    }
  }
  let headers;
  let widths;
  if (kind === 'workplace') {
    widths = [20, 15, 15, 15, 15, 15, 20];
    headers = [[...['Объект', 'СП развернута', 'СП завершена', 'Допуск был оформлен', 'Срок действия допуска истек', 'Отказы', 'ОТК-1'].map((t, i) => cell(t, widths[i]))]];
  } else {
    widths = [20, 15, 15, 15, 15, 5, 5, 5, 5];
    const names = ['Формы спецпроверки (СП)', 'СП развернута', 'СП завершена', 'К/м', 'ДОПУСК'];
    headers = [[...names.map((t, i) => cell(t, widths[i], 24, {
      vMerge: 'restart'
    })), cell('Отказы', 10, 24, {
      gridSpan: 2
    }), cell('Повторные отказы', 10, 24, {
      gridSpan: 2
    })], [...Array.from({
      length: 5
    }, S.vMergeContinue), cell('Всего', 7, 14), cell('ОТК-1', 8, 14), cell('Всего', 7, 14), cell('ОТК-1', 50, 14)]];
  }
  const all = [...headers, ...expectedRows.map(row => row.map((t, i) => cell(t, widths[i])))];
  assert.equal(table.rows.length, all.length);
  table.rows.forEach((row, i) => assert.deepEqual(S.bare(row.cells), all[i], `row ${i}`));
}
module.exports = {
  assertFrame,
  assertRows
};
