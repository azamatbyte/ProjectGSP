// Local helpers for the statistics report tests (reportStatements,
// reportFromForm, statisticsByForm, statisticsByYear). The shared helpers in
// tests/helpers are used as-is; nothing here edits them.
//
// The four controllers only differ in which `prisma.registration.count`
// queries they fire, so `countHandler()` classifies each count call by the
// shape of its `where` (metric) and by workplace / form / year (row key), and
// answers from a plain fixture table. That lets every test state the expected
// cell values next to the fixture they come from.
const path = require("path");
const { mock } = require("node:test");
const { installFakePrisma } = require("../../helpers/fakePrisma");
const { captureGeneratedFiles, UPLOADS } = require("../../helpers/captureFiles");
const { mockReq, mockRes } = require("../../helpers/http");
const { inspectDocx } = require("../../helpers/docxInspector");

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const linkRegex = (serverUrl) => new RegExp(`^${escapeRe(serverUrl)}/api/v1/download/${UUID}\\.docx$`);

// Frozen "now" for formatRussianDateTime() and statisticsByForm's `expired lte new Date()`.
const NOW = new Date("2026-01-15T09:00:00Z");

// Boots the fake Prisma + file capture + controller once per test file.
function setup() {
  const prisma = installFakePrisma();
  const cap = captureGeneratedFiles();
  const ctrl = require("../../../api/controllers/statisticsController");
  const { SERVER_URL } = require("../../../api/helpers/constants");
  return { prisma, cap, ctrl, SERVER_URL };
}

function freezeTime() {
  mock.timers.enable({ apis: ["Date"], now: NOW });
}
function unfreezeTime() {
  mock.timers.reset();
}

// Calls a handler with a mock req/res; console noise from the controller
// (console.log(req.userId), console.error on the 500 paths) is silenced.
async function call(handler, body, userId = "admin-7f3c") {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    const res = mockRes();
    await handler(mockReq({ body, userId }), res);
    await res.done;
    return res;
  } finally {
    console.log = log;
    console.error = error;
  }
}

// ---------------------------------------------------------------- count fixtures
// Metric of a registration.count call, derived from its where clause.
function metricOf(where) {
  const s = JSON.stringify(where);
  if (s.includes('"expired"')) return "access_expired";
  if (s.includes("повт")) return s.includes("ОТКАЗ-1") ? "pov_otkz1" : "pov_otkz";
  if (s.includes('"notes"')) return "km";
  if (s.includes("ОТКАЗ-1")) return "otk1";
  if (s.includes('"not":"ДОПУСК"')) return "eliminete";
  if (s.includes("ДОПУСК")) return "access";
  if (s.includes("regEndDate")) return "close";
  if (s.includes("regDate")) return "open";
  return "unknown";
}

// Row key of a registration.count call: workplace, else single form, else
// form list ("in"), plus the year for statisticsByYear.
function keyOf(where) {
  if (where.workplace) return where.workplace.equals;
  if (where.form_reg && where.form_reg.equals !== undefined) return where.form_reg.equals;
  return `forms:${(where.form_reg?.in || []).join(",")}`;
}
function yearOf(where) {
  const range = where.regDate || where.regEndDate || where.OR?.[0]?.regEndDate;
  return range ? new Date(range.gte).getUTCFullYear() : undefined;
}

// table: { [key]: { open, close, km, ... } } ; byYear: key the table by year instead.
function countHandler(table, { byYear = false, throwFor } = {}) {
  return (args) => {
    const where = args.where;
    const key = byYear ? String(yearOf(where)) : keyOf(where);
    if (throwFor && throwFor === key) throw new Error(`count failed for ${key}`);
    const row = table[key] || {};
    return row[metricOf(where)] ?? 0;
  };
}

// ---------------------------------------------------------------- docx shapes
// Deep copy without the inspector's positional bookkeeping (index/sectionIndex),
// so whole paragraphs / cells can be compared with deepStrictEqual.
function bare(v) {
  if (Array.isArray(v)) return v.map(bare);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) if (k !== "index" && k !== "sectionIndex") out[k] = bare(val);
    return out;
  }
  return v;
}

// A run exactly as the inspector reports it. No font is ever set by these
// generators (Word default font), so `font` is absent on purpose.
const run = (text, size, extra = {}) => ({ text, size, sizeCs: size, ...extra, breaks: [], tabs: 0 });

// A body / cell paragraph exactly as the inspector reports it.
const para = (text, props, runs, inTable = false) => ({
  text,
  ...props,
  runs,
  hasPageBreak: false,
  inTable,
});

const pct = (n) => ({ size: `${n}%`, type: "pct" });
const border = (val, size, color, space) => ({ val, size, space, color });

// Paragraph inside a cell whose single run carries the whole text.
function cellPara(text, size, props, runExtra) {
  return para(text, props, text === "" ? [] : [run(text, size, runExtra)], true);
}
function cell({ width, gridSpan = 1, vMerge, verticalAlign, shading, paragraphs }) {
  const c = {};
  if (width !== undefined) c.width = width;
  c.gridSpan = gridSpan;
  if (vMerge !== undefined) c.vMerge = vMerge;
  if (verticalAlign !== undefined) c.verticalAlign = verticalAlign;
  if (shading !== undefined) c.shading = shading;
  c.paragraphs = paragraphs;
  c.tables = [];
  c.text = paragraphs.map((p) => p.text).join("\n");
  return c;
}
// The empty continuation cell docx emits under a rowSpan:2 cell.
const vMergeContinue = () => cell({ vMerge: "continue", paragraphs: [para("", {}, [], true)] });

// Cell texts of a row.
const rowTexts = (row) => row.cells.map((c) => c.text);
const cellWidths = (row) => row.cells.map((c) => (c.width ? c.width.size : undefined));

// Common page geometry of all four generators: no `size` given -> docx default
// A4 portrait; margins (1440*cm)/2.54 truncated to whole twips.
const PAGE = { width: 11906, height: 16838, orientation: "portrait" };
const MARGINS = {
  top: 1133, // (1440 * 2) / 2.54 = 1133.86 — "2cm"
  right: 850, // (1440 * 1.5) / 2.54 = 850.39 — "1.5cm"
  bottom: 1133, // (1440 * 2) / 2.54 — "2cm"
  left: 1417, // (1440 * 2.5) / 2.54 = 1417.32 — "2.5cm"
  header: 708, // docx default
  footer: 708, // docx default
  gutter: 0, // docx default
};

// formatRussianDateTime() (api/helpers/time.js) uses the process' local time.
const RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function expectedDateLine(now = NOW) {
  const d = new Date(now.getTime());
  const pad = (n) => String(n).padStart(2, "0");
  return `Дата составления: ${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()} года в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The 160- and 137-underscore decorative lines used by every generator.
const LINE_160 = "_".repeat(160);
const LINE_137 = "_".repeat(137);

// Reads the one .docx captured by the last call and checks it really is an upload.
function lastDocx(cap) {
  const f = cap.last();
  if (!f) throw new Error("no file captured");
  return { file: f, doc: inspectDocx(f.buffer), name: path.basename(f.path), dir: path.dirname(path.resolve(f.path)) };
}

module.exports = {
  UUID,
  NOW,
  UPLOADS,
  linkRegex,
  setup,
  freezeTime,
  unfreezeTime,
  call,
  metricOf,
  countHandler,
  bare,
  run,
  para,
  pct,
  border,
  cellPara,
  cell,
  vMergeContinue,
  rowTexts,
  cellWidths,
  PAGE,
  MARGINS,
  expectedDateLine,
  LINE_160,
  LINE_137,
  lastDocx,
};
