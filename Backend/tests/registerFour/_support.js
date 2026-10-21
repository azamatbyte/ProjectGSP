// Local helpers for the registerFour export tests (Excel / ExcelJS).
// Shared helpers in tests/helpers are used as-is; nothing here edits them.
const { mockReq, mockRes } = require("../helpers/http");
const { inspectXlsx } = require("../helpers/xlsxInspector");

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// ^<SERVER_URL>/api/v1/download/<uuid>.xlsx$
function linkRegex(serverUrl) {
  return new RegExp(`^${escapeRe(serverUrl)}\\/api\\/v1\\/download\\/${UUID}\\.xlsx$`);
}

// The controllers write to `./uploads/<uuid>.xlsx` (relative to cwd = Backend).
const UPLOAD_PATH_RE = new RegExp(`^\\.\\/uploads\\/${UUID}\\.xlsx$`);

// Calls a controller handler with a mock req/res and waits for the reply.
async function call(handler, reqOpts) {
  const res = mockRes();
  await handler(mockReq(reqOpts), res);
  await res.done;
  return res;
}

// Silences console.error/log for the duration of fn (controllers log on errors).
async function quiet(fn) {
  const { error, log } = console;
  console.error = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.error = error;
    console.log = log;
  }
}

const THIN = { style: "thin" };
const THIN_BOX = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const CENTER_MIDDLE = { horizontal: "center", vertical: "middle" };
const LEFT_MIDDLE = { horizontal: "left", vertical: "middle" };

// Calibri 11 (theme colour 1) is what ExcelJS writes for cells that get a style
// (border/alignment/fill) without an explicit font; it comes back on reload.
const DEFAULT_FONT = { color: { theme: 1 }, family: 2, scheme: "minor", size: 11, name: "Calibri" };
const NO_FILL = { type: "pattern", pattern: "none" };

// Exact page setup ExcelJS writes for addWorksheet(name) or
// addWorksheet(name, { pageSetup: { orientation } }): default margins (inches),
// no paperSize, no fit-to-page, scale 100.
function defaultPageSetup(orientation) {
  return {
    fitToPage: false,
    margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    orientation,
    horizontalDpi: 4294967295,
    verticalDpi: 4294967295,
    pageOrder: "downThenOver",
    blackAndWhite: false,
    draft: false,
    cellComments: "None",
    errors: "displayed",
    scale: 100,
    fitToWidth: 1,
    fitToHeight: 1,
    firstPageNumber: 1,
    useFirstPageNumber: false,
    usePrinterDefaults: false,
    copies: 1,
  };
}

// "HH:MM  DD/MM/YYYY" exactly as the Сверка G2 cell is built (en-GB, local TZ).
function sverkaStamp(now) {
  const t = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const d = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${t}  ${d}`;
}

// Header block (rows 1-5) shared by exportSverkaMain and exportSverka.
// Returns { address: { value, font, alignment, border, fill, master } } for every
// cell the controller styles, including the slave cells of each merge (ExcelJS
// copies the master value + style into them).
function sverkaHeaderCells({ kompr = false, stamp }) {
  const B11 = { bold: true, size: 11 };
  const out = {};
  const put = (addr, value, font, alignment, border, master) => {
    out[addr] = { value, font, alignment, border, fill: NO_FILL, master };
  };
  const titleCols = kompr ? "ABCDEFGHI" : "ABCDEFGH";
  // Title A1:H1 (A1:I1 with Компрматериалы) — bold 14, centre/middle, thin box.
  for (const c of titleCols) put(`${c}1`, "Сверка", { bold: true, size: 14 }, CENTER_MIDDLE, THIN_BOX, "A1");
  // F2 "время:" — bold 11, right/middle, no border.
  put("F2", "время:", B11, { horizontal: "right", vertical: "middle" }, {}, undefined);
  // G2:H2 timestamp — italic 11, centre/middle, thin box (never extended to I).
  put("G2", stamp, { italic: true, size: 11 }, CENTER_MIDDLE, THIN_BOX, "G2");
  put("H2", stamp, { italic: true, size: 11 }, CENTER_MIDDLE, THIN_BOX, "G2");
  // A3:A5 .. F3:F5 vertical merges — bold 11, centre/middle, thin box.
  const vert = { A: "№", B: "Фам", C: "Имя", D: "Отч", E: "Г.р.", F: "Место работы" };
  for (const [c, v] of Object.entries(vert)) {
    for (const r of [3, 4, 5]) put(`${c}${r}`, v, B11, CENTER_MIDDLE, THIN_BOX, `${c}3`);
  }
  // G3:H3 "Допуск/отказ", G4:H4 "Форма", G5 "Р/О", H5 "У".
  put("G3", "Допуск/отказ", B11, CENTER_MIDDLE, THIN_BOX, "G3");
  put("H3", "Допуск/отказ", B11, CENTER_MIDDLE, THIN_BOX, "G3");
  put("G4", "Форма", B11, CENTER_MIDDLE, THIN_BOX, "G4");
  put("H4", "Форма", B11, CENTER_MIDDLE, THIN_BOX, "G4");
  put("G5", "Р/О", B11, CENTER_MIDDLE, THIN_BOX, undefined);
  put("H5", "У", B11, CENTER_MIDDLE, THIN_BOX, undefined);
  if (kompr) {
    // I3:I5 "Компрматериалы" — bold 11, centre/middle + wrapText, thin box.
    const wrap = { ...CENTER_MIDDLE, wrapText: true };
    for (const r of [3, 4, 5]) put(`I${r}`, "Компрматериалы", B11, wrap, THIN_BOX, "I3");
  }
  return out;
}

// Asserts every header cell (value + full style) against sverkaHeaderCells().
function assertSverkaHeader(assert, s, opts) {
  const expected = sverkaHeaderCells(opts);
  for (const [addr, e] of Object.entries(expected)) {
    const c = s.cell(addr);
    assert.equal(c.value, e.value, `${addr} value`);
    assert.deepEqual(c.font, e.font, `${addr} font`);
    assert.deepEqual(c.alignment, e.alignment, `${addr} alignment`);
    assert.deepEqual(c.border, e.border, `${addr} border`);
    assert.deepEqual(c.fill, e.fill, `${addr} fill`);
    assert.equal(c.numFmt, undefined, `${addr} numFmt`);
    assert.equal(c.isMerged, e.master !== undefined, `${addr} isMerged`);
    assert.equal(c.master, e.master, `${addr} master`);
  }
  // A2:E2 (and I2 / I1-I5 when not used) stay empty and unstyled.
  const empty = ["A2", "B2", "C2", "D2", "E2", "I2"];
  if (!opts.kompr) empty.push("I1", "I3", "I4", "I5");
  for (const addr of empty) {
    const c = s.cell(addr);
    assert.equal(c.value, null, `${addr} empty`);
    assert.equal(c.font, undefined, `${addr} no font`);
    assert.equal(c.border, undefined, `${addr} no border`);
    assert.equal(c.alignment, undefined, `${addr} no alignment`);
  }
  // Header rows keep the default height (no explicit height is set).
  for (const r of [1, 2, 3, 4, 5]) assert.equal(s.rows[r].height, undefined, `row ${r} height`);
}

// Asserts one Сверка data row: values, default Calibri 11 font, thin box
// borders, per-column alignment and the 20pt row height.
//   B,C,D,F -> left/middle; A,E,G,H -> centre/middle (from row.alignment);
//   I (Компрматериалы) -> left/middle + wrapText.
function assertSverkaDataRow(assert, s, rowNum, values) {
  const cols = "ABCDEFGHI".slice(0, values.length).split("");
  assert.equal(s.rows[rowNum].height, 20, `row ${rowNum} height`); // row.height = 20
  cols.forEach((col, i) => {
    const where = `${col}${rowNum}`;
    const c = s.cell(where);
    assert.equal(c.value, values[i], `${where} value`);
    assert.deepEqual(c.font, DEFAULT_FONT, `${where} font`);
    assert.deepEqual(c.border, THIN_BOX, `${where} border`);
    assert.deepEqual(c.fill, NO_FILL, `${where} fill`);
    assert.equal(c.numFmt, undefined, `${where} numFmt`);
    assert.equal(c.isMerged, false, `${where} not merged`);
    const align = col === "I" ? { ...LEFT_MIDDLE, wrapText: true } : "BCDF".includes(col) ? LEFT_MIDDLE : CENTER_MIDDLE;
    assert.deepEqual(c.alignment, align, `${where} alignment`);
  });
  // Nothing written past the last expected column.
  const next = "ABCDEFGHIJ"[values.length];
  assert.equal(s.cell(`${next}${rowNum}`).value, null, `${next}${rowNum} empty`);
}

module.exports = {
  call,
  quiet,
  inspectXlsx,
  linkRegex,
  UPLOAD_PATH_RE,
  THIN_BOX,
  CENTER_MIDDLE,
  LEFT_MIDDLE,
  DEFAULT_FONT,
  NO_FILL,
  defaultPageSetup,
  sverkaStamp,
  sverkaHeaderCells,
  assertSverkaHeader,
  assertSverkaDataRow,
};
