// Local helpers for the AVR / UPK / Malumotnoma characterization tests.
// (Shared helpers in tests/helpers/ are used as-is; anything extra lives here.)
//
//   const S = require("./_support");
//   const env = S.setup();                    // fake prisma + file capture + controller
//   S.wire(env.prisma, { registration, signers, raportTypes });
//   const { res, doc, file } = await S.run(env, "generateAVR", body);
//   S.assertBlocks(doc.blocks, expectedSpec)  // or S.norm(block) for one block
//
// Fixtures follow prisma/schema.prisma (Registration, Relatives, SignList,
// RaportTypes) and the include/select shapes the handlers ask for: relations
// that are not included (or columns not selected) are dropped, exactly as
// Prisma would, so e.g. executor.phone only reaches the document when the
// handler selects it.
const path = require("path");
const assert = require("node:assert/strict");

const BACKEND = path.resolve(__dirname, "../../..");
const { installFakePrisma } = require(path.join(BACKEND, "tests/helpers/fakePrisma"));
const { captureGeneratedFiles } = require(path.join(BACKEND, "tests/helpers/captureFiles"));
const { mockReq, mockRes } = require(path.join(BACKEND, "tests/helpers/http"));
const { inspectDocx } = require(path.join(BACKEND, "tests/helpers/docxInspector"));

// ------------------------------------------------------------------ setup
function setup() {
  const prisma = installFakePrisma();
  const cap = captureGeneratedFiles();
  // eslint-disable-next-line global-require
  const ctrl = require(path.join(BACKEND, "api/controllers/raportController"));
  const { SERVER_URL } = require(path.join(BACKEND, "api/helpers/constants"));
  return { prisma, cap, ctrl, SERVER_URL };
}

// The handlers log errors with console.log/console.error; keep test output clean.
function silenceConsole() {
  const orig = { log: console.log, error: console.error };
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = orig.log;
    console.error = orig.error;
  };
}

async function run(env, fn, body, { userId = "admin-7f3c" } = {}) {
  const before = env.cap.files.length;
  const res = mockRes();
  const restore = silenceConsole();
  try {
    await env.ctrl[fn](mockReq({ body, userId }), res);
    await res.done;
  } finally {
    restore();
  }
  const written = env.cap.files.slice(before);
  const file = written[written.length - 1];
  const doc = file && file.ext === ".docx" ? inspectDocx(file.buffer) : undefined;
  return { res, file, written, doc };
}

// ------------------------------------------------------------------ fixtures
const REG_ID = "35d603b1-946d-42df-b565-100c98f0750c";
const REL_ID = "8b0c2f4e-1d7a-4c35-9e61-2f0a7d9c4b18";

function makeRegistration(over = {}) {
  return {
    id: REG_ID,
    form_reg: "2",
    form_reg_log: "",
    regNumber: "1708-19",
    regDate: new Date("2025-02-10T00:00:00Z"),
    regEndDate: new Date("2027-03-01T00:00:00Z"),
    fullName: "Абдукаххоров Зайниддин Рахмонович",
    firstName: "Зайниддин",
    lastName: "Абдукаххоров",
    fatherName: "Рахмонович",
    nationality: "узбек",
    pinfl: "31205901234567",
    passport: "AA1234567",
    birthDate: new Date("1990-05-12T00:00:00Z"),
    birthYear: 1990,
    workplace: "Министерство юстиции",
    position: "главный специалист",
    birthPlace: "Самаркандская обл.",
    residence: "г. Ташкент, Юнусабадский р-н",
    model: "registration",
    notes: "к/м",
    additionalNotes: "",
    accessStatus: "ПРОВЕРКА",
    completeStatus: "WAITING",
    recordNumber: "",
    or_tab: "init-01",
    executorId: "admin-exec-01",
    executor: { id: "admin-exec-01", first_name: "Анна", last_name: "Иванова", father_name: "Каримовна", phone: "+998901234567", username: "ivanova" },
    Initiator: { id: "init-01", first_name: "Михаил", last_name: "Кузнецов", father_name: "Ильич", rank: "майор" },
    // Two relatives exist in the DB; none of these handlers include them.
    Relatives: [
      { id: REL_ID, firstName: "Гулнора", lastName: "Абдукаххорова", fatherName: "Шавкатовна", relationDegree: "Жена" },
      { id: "c41e7a2b-0d55-4f9a-8a3e-6b1f2c9d7e40", firstName: "Рахмон", lastName: "Абдукаххоров", fatherName: "Каримович", relationDegree: "Отец" },
    ],
    ...over,
  };
}

function makeRelative(over = {}) {
  // Relatives has no form_reg / regEndDate columns (schema.prisma:207).
  return {
    id: REL_ID,
    registrationId: REG_ID,
    regNumber: "1708-19",
    relationDegree: "Жена",
    fullName: "Абдукаххорова Гулнора Шавкатовна",
    firstName: "Гулнора",
    lastName: "Абдукаххорова",
    fatherName: "Шавкатовна",
    nationality: "узбечка",
    birthYear: 1993,
    birthDate: new Date("1993-11-03T00:00:00Z"),
    birthPlace: "г. Бухара",
    residence: "г. Ташкент, Мирабадский р-н",
    workplace: "Школа №110",
    position: "учитель",
    notes: "",
    or_tab: "init-02",
    executorId: "admin-exec-02",
    executor: { id: "admin-exec-02", first_name: "Дилшод", last_name: "Юсупов", father_name: "Бахромович", phone: "+998935551122" },
    Initiator: { id: "init-02", first_name: "Сардор", last_name: "Тошматов", father_name: "Уктамович" },
    ...over,
  };
}

const SIGNERS = [
  { id: "2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9", lastName: "Каримов", firstName: "Бахтиёр", fatherName: "Алиевич", workplace: "ГСБП", position: "Начальник отдела", rank: "полковник", status: "active" },
  { id: "5f1a9c3d-8e2b-4a7c-9d10-3b6e2f8a1c55", lastName: "Рахимова", firstName: "Нилуфар", fatherName: "Анваровна", workplace: "ГСБП", position: "Заместитель начальника", rank: "подполковник", status: "active" },
  { id: "9a4c6e2f-1b3d-4f8a-b7c9-0d2e4f6a8b10", lastName: "Ахмедов", firstName: "Шерзод", fatherName: "", workplace: "ГСБП", position: "Старший инспектор", rank: "майор", status: "active" },
];

function makeRaportType(over = {}) {
  return {
    id: "rt-avr-01",
    name: "АВР СГБ Республики Узбекистан",
    code: "avr",
    code_ru: "АВР",
    code_uz: "АВР",
    organization: "СГБ Республики Узбекистан",
    requested_organization: "ГСБП Республики Узбекистан",
    rank: "",
    signed_fio: "Иванов А.К.",
    signed_position: "Генеральный директор",
    link: "type4",
    notes: "проверка по учетам СГБ",
    editable_word: "",
    executorId: null,
    data: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...over,
  };
}

// Applies a Prisma `include` (with nested `select`) to a fixture record.
const RELATIONS = ["executor", "Initiator", "Relatives", "registration", "raportLinks", "RegistrationLog"];
function project(record, include) {
  if (!record) return null;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (!RELATIONS.includes(k)) {
      out[k] = v;
      continue;
    }
    const inc = include && include[k];
    if (!inc) continue;
    if (v == null || inc === true || !inc.select) {
      out[k] = v;
      continue;
    }
    out[k] = Object.fromEntries(Object.keys(inc.select).filter((f) => inc.select[f]).map((f) => [f, v[f]]));
  }
  return out;
}

// Classifies the raw SQL issued by selectRaportTypesByCodeOrFallback
// (raportController.js:227) so a test can answer each lookup stage.
function classifyRaportTypeSql(sqlObj) {
  const sql = sqlObj.sql;
  if (sql.includes('rt."link" ILIKE') && sql.includes('rt."name" ILIKE')) return { stage: "name", value: sqlObj.values[0] };
  if (sql.includes('rt."code" ILIKE')) return { stage: "code", value: sqlObj.values[0] };
  if (sql.includes('rt."link" ILIKE')) return { stage: "link", value: sqlObj.values[0] };
  return { stage: "all", value: undefined };
}

// Wires the fake prisma for one scenario.
//   registration: record or null; relative: record or null
//   signers: rows returned by signList.findMany / looked up by signList.findUnique
//   raportTypes: rows for every raw query, or a function ({stage,value}) => rows
function wire(prisma, { registration = makeRegistration(), relative = null, signers = [SIGNERS[0]], raportTypes = [makeRaportType()] } = {}) {
  prisma.reset();
  prisma.when("registration.findUnique", (args) => (registration && args.where.id === registration.id ? project(registration, args.include) : null));
  prisma.when("relatives.findUnique", (args) => (relative && args.where.id === relative.id ? project(relative, args.include) : null));
  prisma.when("signList.findMany", (args) => {
    const ids = args.where.id.in;
    return signers.filter((s) => ids.includes(s.id));
  });
  prisma.when("signList.findUnique", (args) => signers.find((s) => s.id === args.where.id) || null);
  prisma.when("$queryRaw", ([sqlObj]) => {
    const q = classifyRaportTypeSql(sqlObj);
    return typeof raportTypes === "function" ? raportTypes(q) : raportTypes;
  });
  prisma.when("raport.create", (args) => ({ id: "raport-0001", ...args.data }));
  prisma.when("raportLink.create", (args) => ({ id: "raport-link-0001", ...args.data }));
  return prisma;
}

// ------------------------------------------------------------------ normalizing
function deepPrune(v) {
  if (Array.isArray(v)) return v.map(deepPrune);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = deepPrune(x);
    return o;
  }
  return v;
}

function normRun(r) {
  return deepPrune({
    text: r.text,
    font: r.font,
    size: r.size,
    bold: r.bold,
    italic: r.italic,
    underline: r.underline,
    caps: r.caps,
    color: r.color,
    breaks: r.breaks && r.breaks.length ? r.breaks : undefined,
    tabs: r.tabs || undefined,
  });
}

function normPara(p) {
  return deepPrune({
    p: true,
    text: p.text,
    alignment: p.alignment,
    spacing: p.spacing,
    indent: p.indent,
    borders: p.borders,
    shading: p.shading,
    keepNext: p.keepNext,
    pageBreakBefore: p.pageBreakBefore,
    tabs: p.tabs,
    runs: p.runs.map(normRun),
  });
}

function normTable(t) {
  return deepPrune({
    t: true,
    width: t.width,
    layout: t.layout,
    alignment: t.alignment,
    indent: t.indent,
    borders: t.borders,
    cellMargins: t.cellMargins,
    grid: t.grid,
    rows: t.rows.map((r) => ({
      height: r.height,
      isHeader: r.isHeader,
      cells: r.cells.map((c) => ({
        width: c.width,
        gridSpan: c.gridSpan,
        vMerge: c.vMerge,
        verticalAlign: c.verticalAlign,
        borders: c.borders,
        margins: c.margins,
        shading: c.shading,
        paragraphs: c.paragraphs.map(normPara),
        tables: c.tables.length ? c.tables.map(normTable) : undefined,
      })),
    })),
  });
}

function norm(block) {
  if (block.type === "paragraph") return normPara(block.ref);
  if (block.type === "table") return normTable(block.ref);
  return block.p !== undefined || block.runs ? normPara(block) : normTable(block);
}

// Paragraphs / tables of section `i` (blocks carry no section index for
// paragraphs that end a section, so split on endsSection markers).
function blocksBySection(doc) {
  const out = [[]];
  for (const b of doc.blocks) {
    out[out.length - 1].push(b);
    if (b.type === "paragraph" && b.ref.endsSection) out.push([]);
  }
  if (!out[out.length - 1].length) out.pop();
  return out;
}

// ------------------------------------------------------------------ spec builders
// Raw Word values as written by docx@9 for the literals in raportController.js.
const U = (n) => "_".repeat(n);
const TNR = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "Times New Roman" };
const BR = ["textWrapping"];
const NONE = { val: "none", size: 0, color: "FFFFFF" }; // { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const NO_BORDERS = { top: NONE, left: NONE, bottom: NONE, right: NONE, insideH: NONE, insideV: NONE };
// docx default borders for a Table created without `borders` (the nested index box).
const SINGLE_AUTO = { val: "single", size: 4, color: "auto" };
const DEFAULT_BORDERS = { top: SINGLE_AUTO, left: SINGLE_AUTO, bottom: SINGLE_AUTO, right: SINGLE_AUTO, insideH: SINGLE_AUTO, insideV: SINGLE_AUTO };
// WidthType.PERCENTAGE with `size: N` is written verbatim as w:w="N%" (so 100 * 50 -> "5000%").
const pct = (n) => ({ size: `${n}%`, type: "pct" });

const R = (text, props = {}) => deepPrune({ text, ...props });
const P = (props, runs = []) => deepPrune({ p: true, text: runs.map((r) => r.text).join(""), ...props, runs });
const C = (props, paragraphs, tables) => deepPrune({ gridSpan: 1, ...props, paragraphs, tables });
const ROW = (cells, props = {}) => deepPrune({ isHeader: false, ...props, cells });
// Every top-level table here: width 100 * 50 PERCENTAGE, AlignmentType.CENTER, BorderStyle.NONE all round.
const T = (grid, rows, props = {}) => deepPrune({ t: true, width: pct(5000), alignment: "center", borders: NO_BORDERS, grid, ...props, rows });

// "_".repeat(137) at size 1, bold, white: the invisible separator after every field table.
const spacer = () => P({ spacing: { before: 0, after: 0 } }, [R(U(137), { size: 1, bold: true, color: "ffffff" })]);
// Paragraph with a bottom border (border.bottom {color, space:1, size:40}; `value:"dash"` is not a docx key, so no w:val).
const rule = (n, { color = "000000", alignment = "center" } = {}) =>
  P({ alignment, spacing: { before: 0, after: 0 }, borders: { bottom: { size: 40, space: 1, color } } }, [R(U(n), { size: 12, bold: true })]);
// new TextRun({ text: "", size: 1, bold: true, break: 2, color: "ffffff" })
const gap2 = () => P({}, [R("\n\n", { size: 1, bold: true, color: "ffffff", breaks: ["textWrapping", "textWrapping"] })]);
// new TableRow({ children: [new TableCell({ children: [] })] }) -> docx adds one empty paragraph.
const emptyRow = () => ROW([C({}, [P({})])]);

// A field value cell: bold value paragraph (spacing before 276) + the underline rule.
const valueCell = (width, value, ruleLen, { size = 24, alignment = "center", vAlign, underline } = {}) =>
  C({ width: pct(width), verticalAlign: vAlign }, [
    P({ alignment, spacing: { before: 276, after: 0 } }, [R(value, { size, bold: true, underline })]),
    rule(ruleLen),
  ]);
const labelCell = (width, runs, { alignment = "left" } = {}) => C({ width: pct(width), verticalAlign: "center" }, [P({ alignment }, runs)]);

// Signer table (tableRows + dateRow) shared by all three builders.
const signerRow = (s) =>
  ROW([
    C({ width: pct(1750), verticalAlign: "center" }, [
      P({ alignment: "center" }, [R(s.position, { size: 24, bold: false, underline: "single" }), R("\nЛавозими (Должность)", { font: TNR, size: 24, breaks: BR })]),
    ]),
    C({ width: pct(1750), verticalAlign: "center" }, [
      P({ alignment: "center" }, [R(U(20), { size: 24, bold: false }), R("\nИмзо (подпись)", { font: TNR, size: 24, breaks: BR })]),
    ]),
    C({ width: pct(1500), verticalAlign: "center" }, [
      P({ alignment: "center" }, [R(s.name, { size: 24, bold: false, underline: "single" }), R("\nНасаби (Фамилия)", { font: TNR, size: 24, breaks: BR })]),
    ]),
  ]);
const blankSignerRow = () =>
  ROW([
    C({ width: pct(1750), verticalAlign: "center" }, [P({ alignment: "center" }, [R(U(20), { size: 24, bold: false }), R("\nЛавозими (Должность)", { font: TNR, size: 24, breaks: BR })])]),
    C({ width: pct(1750), verticalAlign: "center" }, [P({ alignment: "center" }, [R(U(20), { size: 24, bold: false }), R("\nИмзо (подпись)", { font: TNR, size: 24, breaks: BR })])]),
    C({ width: pct(1500), verticalAlign: "center" }, [P({ alignment: "center" }, [R(U(20), { size: 24, bold: false }), R("\nНасаби (Фамилия)", { font: TNR, size: 24, breaks: BR })])]),
  ]);
const dateRow = (date) =>
  ROW([
    C({ width: pct(1750), verticalAlign: "center" }, [
      P({ alignment: "center", spacing: { before: 0, after: 0 } }, [R(`\n${date}`, { size: 24, bold: false, breaks: BR })]),
      rule(31),
    ]),
    C({ width: pct(3250), gridSpan: 2, verticalAlign: "center" }, [P({ alignment: "center" }, [R("", { size: 24, bold: false })])]),
  ]);
// signers: [{name, position}] as built by the handlers' signListData.
const signerTable = (signers, date) => T([100, 100, 100], [...(signers.length ? signers.map(signerRow) : [blankSignerRow()]), dateRow(date)]);

// Executor (Бажарувчи / Телефон) and Ответственный / К делу № tables.
const executorTable = (name, phone) =>
  T([100, 100, 100, 100], [
    ROW([
      labelCell(1250, [R("Бажарувчи", { size: 24, bold: false }), R("\n(Исполнитель)", { font: TNR, size: 24, breaks: BR })]),
      valueCell(1250, name, 37),
      labelCell(1250, [R("Телефон", { size: 24, bold: false })], { alignment: "center" }),
      valueCell(1250, phone, 44),
    ]),
  ]);
const initiatorTable = (initiator, regNumber) =>
  T([100, 100, 100, 100], [
    ROW([
      labelCell(1250, [R("Ответственный", { size: 24, bold: false })]),
      valueCell(1250, initiator, 44),
      labelCell(1250, [R("К делу №", { size: 24, bold: false })], { alignment: "center" }),
      valueCell(1250, regNumber, 44),
    ]),
  ]);
// requested_organization block printed above the signers.
const requestedOrgBlock = (org) => [
  P({ alignment: "center", spacing: { before: 276, after: 0 } }, [R(org, { size: 24, bold: true })]),
  rule(160),
  P({ alignment: "center", spacing: { after: 0 } }, [R("Идора ва бўлинма номи  (Наименование органа и подразделения)", { size: 24, bold: false, color: "0f0f0f" })]),
  gap2(),
];
// Tail shared by all three documents: requested org, signers, executor, initiator.
const tailBlocks = ({ requestedOrg, signers, date, executor, phone, initiator, regNumber }) => [
  ...requestedOrgBlock(requestedOrg),
  signerTable(signers, date),
  spacer(),
  gap2(),
  executorTable(executor, phone),
  spacer(),
  initiatorTable(initiator, regNumber),
  spacer(),
];

// Compares actual doc blocks to a spec, one assertion per block with a label.
function assertBlocks(actualBlocks, spec, label = "block") {
  const actual = actualBlocks.map(norm);
  for (let i = 0; i < Math.max(actual.length, spec.length); i += 1) {
    assert.deepEqual(actual[i], spec[i], `${label} #${i} differs`);
  }
}

// A4 portrait with the margins every builder sets:
// top/bottom (1440 * 2) / 2.54 -> 1133, right (1440 * 1.5) / 2.54 -> 850, left (1440 * 2.5) / 2.54 -> 1417.
const PAGE = { width: 11906, height: 16838, orientation: "portrait" };
const MARGINS = { top: 1133, right: 850, bottom: 1133, left: 1417, header: 708, footer: 708, gutter: 0 };

const UUID_DOCX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.docx$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const linkRe = (serverUrl) => new RegExp(`^${escapeRe(serverUrl)}/api/v1/download/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.docx$`);

module.exports = {
  BACKEND,
  setup,
  run,
  wire,
  project,
  classifyRaportTypeSql,
  makeRegistration,
  makeRelative,
  makeRaportType,
  SIGNERS,
  REG_ID,
  REL_ID,
  norm,
  normPara,
  normTable,
  deepPrune,
  blocksBySection,
  assertBlocks,
  // spec builders
  U,
  TNR,
  BR,
  NONE,
  NO_BORDERS,
  DEFAULT_BORDERS,
  pct,
  R,
  P,
  C,
  ROW,
  T,
  spacer,
  rule,
  gap2,
  emptyRow,
  valueCell,
  labelCell,
  signerRow,
  blankSignerRow,
  dateRow,
  signerTable,
  executorTable,
  initiatorTable,
  requestedOrgBlock,
  tailBlocks,
  PAGE,
  MARGINS,
  UUID_DOCX,
  linkRe,
};
