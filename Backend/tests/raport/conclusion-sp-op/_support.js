// Local support for the raport conclusion / SP / OP tests (generateReport,
// generateSP, generateOPRaport, downloadRaport). Shared helpers in
// tests/helpers are used as-is; everything specific to this folder lives here.
//
//   const S = require("./_support");
//   const env = S.boot();                 // fake prisma + controller + file capture + conclusions stub
//   const { res, file, doc } = await S.call(env, "generateSP", { body });
//   S.para(doc.paragraphs[0])             // compact, assertion-friendly paragraph summary
//   S.table(doc.tables[0])                // compact table summary
const fs = require("fs");
const path = require("path");
const { installFakePrisma } = require("../../helpers/fakePrisma");
const { captureGeneratedFiles, UPLOADS } = require("../../helpers/captureFiles");
const { mockReq, mockRes } = require("../../helpers/http");
const { inspectDocx } = require("../../helpers/docxInspector");

// conclusionController.readConclusions() reads this JSON file on every call.
// The tests serve it from memory so the real file is never read or created.
const CONCLUSIONS_FILE = path.resolve(__dirname, "../../../api/temp/conclusions.json");

const UUID_DOCX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.docx$/;

function stubConclusions() {
  const state = { list: [] };
  const origAccess = fs.promises.access;
  const origRead = fs.promises.readFile;
  const same = (p) => typeof p === "string" && path.resolve(p).toLowerCase() === CONCLUSIONS_FILE.toLowerCase();
  fs.promises.access = async function (p, ...rest) {
    if (same(p)) return undefined;
    return origAccess.call(this, p, ...rest);
  };
  fs.promises.readFile = async function (p, ...rest) {
    if (same(p)) {
      if (state.throw) throw state.throw;
      return JSON.stringify(state.list);
    }
    return origRead.call(this, p, ...rest);
  };
  state.restore = () => {
    fs.promises.access = origAccess;
    fs.promises.readFile = origRead;
  };
  return state;
}

// Boots the fake prisma (must happen before the controller is required),
// the upload capture and the conclusions stub. Call once per test file.
function boot() {
  const prisma = installFakePrisma();
  const ctrl = require("../../../api/controllers/raportController");
  const { SERVER_URL } = require("../../../api/helpers/constants");
  const cap = captureGeneratedFiles();
  const conclusions = stubConclusions();
  const uploadsCount = () => {
    try { return fs.readdirSync(UPLOADS).length; }
    catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  };
  const uploadsBefore = uploadsCount();
  return {
    prisma,
    ctrl,
    cap,
    conclusions,
    SERVER_URL,
    uploadsBefore,
    LINK_RE: new RegExp(`^${SERVER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/v1/download/[0-9a-f-]{36}\\.docx$`),
    shutdown() {
      cap.restore();
      conclusions.restore();
    },
    uploadsCount,
  };
}

// Lets the controllers' fire-and-forget `forEach(async ...)` work settle.
async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) await new Promise((r) => setImmediate(r));
}

// Calls a handler with console noise silenced. Returns the response, the
// captured upload (if any) and the inspected docx.
async function call(env, fn, { body = {}, query = {}, userId = "admin-1" } = {}) {
  env.cap.clear();
  const res = mockRes();
  const saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = () => {};
  try {
    await env.ctrl[fn](mockReq({ body, query, userId }), res);
    await res.done;
    await flush();
  } finally {
    Object.assign(console, saved);
  }
  const file = env.cap.last();
  return { res, file, doc: file ? inspect(file.buffer) : undefined };
}

// The shared inspector preserves whitespace-only Word text runs.
const inspect = inspectDocx;

// ------------------------------------------------------------ summaries
// Long underscore "lines" (the generators draw rules with 20-160 "_") are
// shown as ‹_×N› so expectations stay readable but still pin the exact count.
const squeeze = (s) => (typeof s === "string" ? s.replace(/_{10,}/g, (m) => `‹_×${m.length}›`) : s);

// Compact run: only the properties that are set, so deepEqual reads like the source.
function run(r) {
  const out = { text: squeeze(r.text) };
  if (r.font) out.font = r.font.ascii === r.font.hAnsi && r.font.ascii === r.font.cs && r.font.ascii === r.font.eastAsia ? r.font.ascii : r.font;
  for (const k of ["size", "bold", "italic", "underline", "caps", "color", "highlight"]) if (r[k] !== undefined) out[k] = r[k];
  if (r.breaks && r.breaks.length) out.breaks = r.breaks;
  return out;
}

function para(p) {
  const out = { text: squeeze(p.text) };
  for (const k of ["alignment", "spacing", "indent", "tabs", "borders", "keepNext", "pageBreakBefore"]) if (p[k] !== undefined) out[k] = p[k];
  out.runs = p.runs.map(run);
  return clean(out);
}

function cell(c) {
  const out = {};
  for (const k of ["width", "gridSpan", "vMerge", "verticalAlign", "borders", "margins", "shading"]) if (c[k] !== undefined) out[k] = c[k];
  if (out.gridSpan === 1) delete out.gridSpan;
  out.text = squeeze(c.text);
  if (c.tables && c.tables.length) out.nestedTables = c.tables.length;
  return out;
}

// Drops undefined keys recursively (the inspector keeps e.g. border.space: undefined).
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}

function table(t) {
  return clean({
    width: t.width,
    layout: t.layout,
    alignment: t.alignment,
    indent: t.indent,
    borders: t.borders,
    cellMargins: t.cellMargins,
    grid: t.grid,
    rows: t.rows.map((r) => ({ height: r.height, isHeader: r.isHeader, cells: r.cells.map(cell) })),
  });
}

// The `noBorders` object used by the conclusion generators: every side NONE/0/FFFFFF.
const NONE_SIDE = { val: "none", size: 0, color: "FFFFFF" };
const noBorders6 = () => ({
  top: { ...NONE_SIDE },
  left: { ...NONE_SIDE },
  bottom: { ...NONE_SIDE },
  right: { ...NONE_SIDE },
  insideH: { ...NONE_SIDE },
  insideV: { ...NONE_SIDE },
});

module.exports = {
  boot,
  call,
  inspect,
  flush,
  run,
  para,
  cell,
  table,
  clean,
  squeeze,
  noBorders6,
  NONE_SIDE,
  UUID_DOCX,
  CONCLUSIONS_FILE,
};
