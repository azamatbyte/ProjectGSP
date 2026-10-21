// Shared setup for the monitoringByAdmin / weeeklyReport / exportDashboardChart
// characterization tests (statisticsController.js).
//
// Requiring this file FIRST pins the process timezone so every local-time
// computation in the controller (month buckets, formatRussianDateTime,
// toLocaleDateString / toLocaleString) is deterministic. node --test runs each
// test file in its own process, so this does not leak into other suites.
process.env.TZ = "Asia/Tashkent"; // UTC+5, no DST — the production timezone

const assert = require("node:assert/strict");
const path = require("path");
const { installFakePrisma } = require("../../helpers/fakePrisma");
const { captureGeneratedFiles } = require("../../helpers/captureFiles");
const { mockReq, mockRes } = require("../../helpers/http");

// 2026-01-15T09:00:00Z == 15.01.2026 14:00 in Asia/Tashkent
const FROZEN_NOW = new Date("2026-01-15T09:00:00Z");
const FROZEN_RU_DATETIME = "15 января 2026 года в 14:00"; // helpers/time.js formatRussianDateTime()

function loadController() {
  const prisma = installFakePrisma(); // must happen before the controller is required
  const ctrl = require("../../../api/controllers/statisticsController");
  const { SERVER_URL } = require("../../../api/helpers/constants");
  return { prisma, ctrl, SERVER_URL };
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const linkRe = (serverUrl, ext) => new RegExp(`^${escapeRe(serverUrl)}/api/v1/download/(${UUID})\\.${ext}$`);

async function invoke(handler, { body, userId = "admin-sa" } = {}) {
  const res = mockRes();
  await handler(mockReq({ body, userId }), res);
  await res.done;
  return res;
}

// Silence the controller's console.log/console.error noise for expected error
// paths, and return what was logged so tests can assert on swallowed errors.
async function quiet(fn) {
  const orig = { log: console.log, error: console.error };
  const logged = [];
  console.log = (...a) => logged.push(a);
  console.error = (...a) => logged.push(a);
  try {
    return { result: await fn(), logged };
  } finally {
    console.log = orig.log;
    console.error = orig.error;
  }
}

// Mojibake: UTF-8 bytes of a Cyrillic literal re-read as Windows-1251.
// Some statisticsController literals are stored like this in the source.
const mojibake = (s) => new TextDecoder("windows-1251").decode(Buffer.from(s, "utf8"));

// ---------------------------------------------------------------------------
// The two docx builders under test (reportMonitoringByAdmin and
// weeeklyReportFunction) share the same frame: title, a "white" separator
// line, the table, a 1-half-point white line, a black decorative line and the
// "Дата составления" footer. These helpers assert one block each, exactly.
const LINE_160 = "_".repeat(160);
const LINE_137 = "_".repeat(137);

function assertTitle(p, text) {
  assert.equal(p.text, text);
  assert.equal(p.alignment, "center"); // AlignmentType.CENTER
  assert.deepEqual(p.spacing, { before: 276, after: 0 }); // spacing: { after: 0, before: 276 }
  assert.equal(p.indent, undefined);
  assert.equal(p.borders, undefined);
  assert.equal(p.runs.length, 1);
  assert.deepEqual(p.runs[0], { text, size: 32, sizeCs: 32, bold: true, breaks: [], tabs: 0 }); // size: 32, bold: true, no font
}

function assertSeparator(p) {
  assert.equal(p.text, LINE_160);
  assert.equal(p.alignment, "center");
  assert.deepEqual(p.spacing, { before: 0, after: 0 });
  assert.equal(p.indent, undefined);
  // NOTE: the source passes `value: "dash"` (not `style`), so docx emits w:bottom
  // without w:val — Word treats such a border as invalid/none. Locked in as-is.
  assert.deepEqual(p.borders, { bottom: { val: undefined, size: 40, space: 1, color: "ffffff" } });
  assert.deepEqual(p.runs, [{ text: LINE_160, size: 12, sizeCs: 12, bold: true, breaks: [], tabs: 0 }]);
}

function assertWhiteHairline(p) {
  assert.equal(p.text, LINE_137);
  assert.equal(p.alignment, undefined); // no alignment set
  assert.deepEqual(p.spacing, { before: 0, after: 0 });
  assert.equal(p.borders, undefined);
  assert.deepEqual(p.runs, [{ text: LINE_137, size: 1, sizeCs: 1, bold: true, color: "ffffff", breaks: [], tabs: 0 }]);
}

function assertBlackLine(p) {
  assert.equal(p.text, LINE_137);
  assert.equal(p.alignment, "center");
  assert.deepEqual(p.spacing, { before: 400, after: 400 });
  assert.deepEqual(p.runs, [{ text: LINE_137, size: 12, sizeCs: 12, bold: true, color: "000000", breaks: [], tabs: 0 }]);
}

function assertDateFooter(p) {
  const text = `Дата составления: ${FROZEN_RU_DATETIME}`;
  assert.equal(p.text, text);
  assert.equal(p.alignment, "right"); // AlignmentType.RIGHT
  assert.deepEqual(p.spacing, { before: 300, after: 200 });
  assert.equal(p.indent, undefined);
  assert.deepEqual(p.runs, [{ text, size: 22, sizeCs: 22, bold: false, italic: true, breaks: [], tabs: 0 }]); // size 22, italics
}

// Table shell shared by both builders.
function assertTableShell(t, colCount) {
  assert.deepEqual(t.width, { size: "5000%", type: "pct" }); // width: { size: 100 * 50, type: PERCENTAGE }
  assert.equal(t.alignment, "center"); // alignment: AlignmentType.CENTER
  assert.equal(t.layout, undefined);
  assert.equal(t.indent, undefined);
  assert.equal(t.style, undefined);
  assert.equal(t.nested, false);
  // borders block is commented out in the source -> docx library default borders
  const b = { val: "single", size: 4, space: undefined, color: "auto" };
  assert.deepEqual(t.borders, { top: b, left: b, bottom: b, right: b, insideH: b, insideV: b });
  assert.equal(t.cellMargins, undefined);
  assert.deepEqual(t.grid, Array(colCount).fill(100)); // percentage cells -> docx emits 100-twip grid columns
}

// One table cell: pct width, vAlign center, one centered paragraph with one
// 12pt non-bold run, no borders/margins/shading/merge.
function assertCell(cell, { text, widthPct }) {
  assert.deepEqual(cell.width, { size: `${widthPct}%`, type: "pct" });
  assert.equal(cell.gridSpan, 1);
  assert.equal(cell.vMerge, undefined);
  assert.equal(cell.verticalAlign, "center"); // VerticalAlign.CENTER
  assert.equal(cell.borders, undefined);
  assert.equal(cell.margins, undefined);
  assert.equal(cell.shading, undefined);
  assert.equal(cell.paragraphs.length, 1);
  const p = cell.paragraphs[0];
  assert.equal(p.alignment, "center");
  assert.equal(p.spacing, undefined); // `color: "0f0f0f"` on the Paragraph is ignored by docx
  assert.equal(p.indent, undefined);
  assert.equal(p.runs.length, 1);
  const r = p.runs[0];
  assert.equal(r.size, 24); // size: 24
  assert.equal(r.sizeCs, 24);
  assert.equal(r.bold, false); // bold: false -> explicit <w:b w:val="false"/>
  assert.equal(r.italic, undefined);
  assert.equal(r.underline, undefined);
  assert.equal(r.font, undefined);
  assert.equal(r.color, undefined);
  assert.deepEqual(r.breaks, []);
  assert.equal(cell.text, text);
}

function assertRow(row, cells) {
  assert.equal(row.height, undefined); // no height set
  assert.equal(row.isHeader, false); // no tableHeader
  assert.equal(row.cantSplit, false);
  assert.equal(row.cells.length, cells.length);
  row.cells.forEach((c, i) => assertCell(c, cells[i]));
}

// 1x1 transparent PNG
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

module.exports = {
  FROZEN_NOW,
  FROZEN_RU_DATETIME,
  loadController,
  captureGeneratedFiles,
  linkRe,
  invoke,
  quiet,
  mojibake,
  LINE_160,
  LINE_137,
  assertTitle,
  assertSeparator,
  assertWhiteHairline,
  assertBlackLine,
  assertDateFooter,
  assertTableShell,
  assertCell,
  assertRow,
  PNG_B64,
  PNG_DATA_URL,
  UPLOADS_DIR,
};
