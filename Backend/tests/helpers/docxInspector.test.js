const { test } = require("node:test");
const assert = require("node:assert/strict");
const AdmZip = require("adm-zip");
const { inspectDocx } = require("./docxInspector");
function fixture(body, settings = "") {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`));
  zip.addFile("word/settings.xml", Buffer.from(`<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${settings}</w:settings>`));
  return zip.toBuffer();
}
test("inspector distinguishes explicit zero/false flags from enabled flags", () => {
  for (const [value, expected] of [["false", false], ["0", false], ["true", true], ["1", true]]) {
    const doc = inspectDocx(fixture(`<w:tbl><w:tr><w:trPr><w:tblHeader w:val="${value}"/><w:cantSplit w:val="${value}"/></w:trPr><w:tc><w:p><w:r><w:rPr><w:b w:val="${value}"/><w:i w:val="${value}"/></w:rPr><w:t>Test</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`, `<w:evenAndOddHeaders w:val="${value}"/>`));
    assert.equal(doc.settings.evenAndOddHeaders, expected);
    assert.equal(doc.tables[0].rows[0].isHeader, expected);
    assert.equal(doc.tables[0].rows[0].cantSplit, expected);
    assert.equal(doc.allParagraphs[0].runs[0].bold, expected);
    assert.equal(doc.allParagraphs[0].runs[0].italic, expected);
  }
});
test("inspector keeps exact page margins, paragraph spacing and cell padding units", () => {
  const doc = inspectDocx(fixture(`<w:tbl><w:tblPr><w:tblCellMar><w:left w:w="108"/></w:tblCellMar></w:tblPr><w:tr><w:tc><w:tcPr><w:tcMar><w:top w:w="0"/><w:right w:w="72"/><w:bottom w:w="90"/><w:left w:w="144"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="567"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>A &amp; B &lt; C</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1417" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`));
  assert.deepEqual(doc.sections[0].margins, { top: 1134, right: 850, bottom: 1134, left: 1417, header: 720, footer: 720, gutter: 0 });
  assert.deepEqual(doc.tables[0].cellMargins, { left: 108 });
  assert.deepEqual(doc.tables[0].rows[0].cells[0].margins, { top: 0, right: 72, bottom: 90, left: 144 });
  assert.deepEqual(doc.allParagraphs[0].spacing, { before: 0, after: 120, line: 240, lineRule: "auto" });
  assert.deepEqual(doc.allParagraphs[0].indent, { firstLine: 567 });
  assert.equal(doc.allParagraphs[0].runs[0].size, 28);
  assert.equal(doc.text, "A & B < C");
});
test("inspector rejects non-ZIP input and ZIPs with no Word document", () => {
  assert.throws(() => inspectDocx(Buffer.from("not a file")), /not a zip/);
  const zip = new AdmZip(); zip.addFile("not-word.txt", Buffer.from("test"));
  assert.throws(() => inspectDocx(zip.toBuffer()), /document.xml missing/);
});
test("inspector preserves whitespace-only Word text and field instructions", () => {
  const doc = inspectDocx(fixture('<w:p><w:r><w:t xml:space="preserve">       </w:t><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r></w:p>'));
  assert.equal(doc.text, "       ");
  assert.equal(doc.paragraphs[0].runs[0].fieldCode, " PAGE ");
});

test('inspector preserves nested table padding independently of parent padding and borders', () => {
  const doc = inspectDocx(fixture(`<w:tbl><w:tblPr><w:tblCellMar><w:top w:w="10"/><w:start w:w="20"/><w:bottom w:w="30"/><w:end w:w="40"/></w:tblCellMar></w:tblPr><w:tr><w:tc><w:tcPr><w:tcMar><w:top w:w="0"/><w:left w:w="80"/></w:tcMar><w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders></w:tcPr><w:p><w:r><w:t>Outer</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblCellMar><w:left w:w="90"/></w:tblCellMar></w:tblPr><w:tr><w:trPr><w:trHeight w:val="360" w:hRule="atLeast"/><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcMar><w:left w:w="0"/><w:right w:w="120"/></w:tcMar></w:tcPr><w:p><w:r><w:t>Inner</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>`));
  const [outer, inner] = doc.tables;
  assert.equal(outer.nested, false);
  assert.equal(inner.nested, true);
  assert.deepEqual(outer.cellMargins, { top: 10, start: 20, bottom: 30, end: 40 });
  assert.deepEqual(outer.rows[0].cells[0].margins, { top: 0, left: 80 });
  assert.deepEqual(outer.rows[0].cells[0].borders.bottom, { val: 'single', size: 4, space: 0, color: '000000' });
  assert.deepEqual(inner.cellMargins, { left: 90 });
  assert.deepEqual(inner.rows[0].cells[0].margins, { left: 0, right: 120 });
  assert.deepEqual(inner.rows[0].height, { size: 360, rule: 'atLeast' });
  assert.equal(inner.rows[0].cantSplit, true);
  assert.deepEqual(doc.allParagraphs.map(p => p.text), ['Outer', 'Inner']);
  assert.equal(outer.rows[0].cells[0].tables[0], inner);
});

test('inspector resolves header/footer relationships and section-specific page settings', () => {
  const zip = new AdmZip(fixture(`<w:p><w:pPr><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="0" w:right="100" w:bottom="200" w:left="300" w:header="0" w:footer="50" w:gutter="0"/><w:headerReference w:type="first" r:id="header1"/><w:titlePg/></w:sectPr></w:pPr><w:r><w:t>First section</w:t></w:r></w:p><w:p><w:r><w:t>Second section</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:footerReference w:type="default" r:id="footer1"/><w:pgNumType w:start="3"/></w:sectPr>`));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships><Relationship Id="header1" Target="header1.xml"/><Relationship Id="footer1" Target="/word/footer1.xml"/></Relationships>'));
  zip.addFile('word/header1.xml', Buffer.from('<w:hdr><w:p><w:pPr><w:spacing w:before="0" w:after="20"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Header</w:t></w:r></w:p></w:hdr>'));
  zip.addFile('word/footer1.xml', Buffer.from('<w:ftr><w:p><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText><w:t>3</w:t></w:r></w:p></w:ftr>'));
  const doc = inspectDocx(zip.toBuffer());
  assert.equal(doc.sections.length, 2);
  assert.deepEqual(doc.paragraphs.map(p => p.sectionIndex), [0, 1]);
  assert.equal(doc.paragraphs[0].endsSection, true);
  assert.equal(doc.sections[0].page.orientation, 'landscape');
  assert.deepEqual(doc.sections[0].margins, { top: 0, right: 100, bottom: 200, left: 300, header: 0, footer: 50, gutter: 0 });
  assert.equal(doc.sections[0].titlePage, true);
  const header = doc.sections[0].headers.first.paragraphs[0];
  assert.equal(header.text, 'Header');
  assert.deepEqual(header.spacing, { before: 0, after: 20 });
  assert.equal(header.runs[0].bold, true);
  assert.equal(header.runs[0].size, 18);
  assert.equal(doc.sections[1].pageNumberStart, 3);
  assert.equal(doc.sections[1].footers.default.paragraphs[0].runs[0].fieldCode, ' PAGE ');
});

test('inspector distinguishes inherited defaults from explicit font, paragraph and style overrides', () => {
  const zip = new AdmZip(fixture('<w:p><w:pPr><w:pStyle w:val="Body"/><w:keepNext w:val="false"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:u w:val="double"/><w:spacing w:val="0"/></w:rPr><w:t>Styled</w:t></w:r></w:p><w:p><w:r><w:t>Inherited</w:t></w:r></w:p>'));
  zip.addFile('word/styles.xml', Buffer.from('<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="28"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Body" w:default="1"><w:name w:val="Body text"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="567"/></w:pPr><w:rPr><w:i/></w:rPr></w:style></w:styles>'));
  const doc = inspectDocx(zip.toBuffer());
  assert.equal(doc.styles.defaults.run.font.ascii, 'Times New Roman');
  assert.equal(doc.styles.defaults.run.size, 28);
  assert.deepEqual(doc.styles.defaults.paragraph.spacing, { before: 0, after: 120 });
  assert.equal(doc.styles.byId.Body.basedOn, 'Normal');
  assert.equal(doc.styles.byId.Body.isDefault, true);
  assert.deepEqual(doc.styles.byId.Body.paragraph, { alignment: 'both', indent: { firstLine: 567 } });
  assert.equal(doc.styles.byId.Body.run.italic, true);
  assert.equal(doc.paragraphs[0].keepNext, false);
  assert.equal(doc.paragraphs[0].runs[0].size, 22);
  assert.equal(doc.paragraphs[0].runs[0].underline, 'double');
  assert.equal(doc.paragraphs[0].runs[0].characterSpacing, 0);
  assert.equal(doc.paragraphs[1].runs[0].font, undefined, 'Absent is inherited, not a chosen effective font');
  assert.equal(doc.paragraphs[1].spacing, undefined);
});
