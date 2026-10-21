// Local fixtures and runners for the raport list / query document tests
// (generateMalumotnomaList, generateRelativeList, createQuerySgb, createQueryGsbp).
//
// Everything here is test-only: the fake Prisma from tests/helpers/fakePrisma.js
// is installed before the controller is required, and every write into
// Backend/uploads is captured in memory by tests/helpers/captureFiles.js.
const path = require("path");
const { mock } = require("node:test");
const { installFakePrisma } = require("../../helpers/fakePrisma");
const { captureGeneratedFiles } = require("../../helpers/captureFiles");
const { mockReq, mockRes } = require("../../helpers/http");
const { inspectDocx } = require("../../helpers/docxInspector");

const FROZEN_NOW = new Date("2026-01-15T09:00:00Z");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ADMIN_ID = "admin-0001";

// One prisma fake per test file (the controller module captures the singleton
// at require time, so it must be installed first).
const prisma = installFakePrisma();
const ctrl = require("../../../api/controllers/raportController");
const { SERVER_URL } = require("../../../api/helpers/constants");

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LINK_RE = new RegExp(`^${escapeRe(SERVER_URL)}/api/v1/download/(${UUID})\\.docx$`);

// ------------------------------------------------------------------ fixtures
const signers = {
  s1: {
    id: "sign-0001",
    lastName: "Каримов",
    firstName: "Бахтиёр",
    fatherName: "Рустамович",
    workplace: "Служба государственной безопасности",
    position: "Начальник управления",
    rank: "полковник",
  },
  s2: {
    id: "sign-0002",
    lastName: "Юсупова",
    firstName: "Дилноза",
    fatherName: "Анваровна",
    workplace: "Отдел кадров",
    position: "Заместитель начальника",
    rank: "подполковник",
  },
  s3: {
    id: "sign-0003",
    lastName: "Рахимов",
    firstName: "Шерзод",
    fatherName: "Абдуллаевич",
    workplace: "Секретариат",
    position: "Старший инспектор",
    rank: "майор",
  },
};

const admin = {
  id: ADMIN_ID,
  username: "operator1",
  first_name: "Тимур",
  last_name: "Назаров",
  father_name: "Ильхомович",
  rank: "капитан",
  workplace: "Отдел проверки",
  phone: "+998901234567",
};

const registration = (over = {}) => ({
  id: "reg-0001",
  regNumber: "1708-19",
  fullName: "Ашуров Тохир Тилаволдиевич",
  firstName: "Тохир",
  lastName: "Ашуров",
  fatherName: "Тилаволдиевич",
  birthDate: new Date("1985-03-12T00:00:00Z"),
  birthYear: 1985,
  birthPlace: "г. Ташкент",
  residence: "г. Ташкент, Юнусабадский р-н",
  workplace: "АО «Узбекнефтегаз»",
  position: "инженер",
  notes: "сведения из базы",
  model: "registration",
  or_tab: "init-1",
  executorId: ADMIN_ID,
  Initiator: { first_name: "Анвар", last_name: "Саидов", father_name: "Бахромович" },
  executor: { first_name: "Тимур", last_name: "Назаров", father_name: "Ильхомович", phone: "+998901234567" },
  ...over,
});

const relative = (over = {}) => ({
  id: "rel-0001",
  registrationId: "reg-0001",
  regNumber: "1708-19",
  relationDegree: "Отец",
  fullName: "Ашуров Тилаволди Каримович",
  firstName: "Тилаволди",
  lastName: "Ашуров",
  fatherName: "Каримович",
  birthDate: new Date("1958-07-01T00:00:00Z"),
  birthYear: 1958,
  birthPlace: "Ферганская обл.",
  residence: "г. Фергана",
  workplace: "пенсионер",
  position: "",
  notes: "",
  model: "relative",
  ...over,
});

// RaportTypes rows as returned by the raw SELECT (RAPORT_TYPE_SELECT).
const raportType = (over = {}) => ({
  id: "rt-1",
  name: "type1",
  code: "type1",
  organization: "МВД Республики Узбекистан",
  requested_organization: "СГБ Республики Узбекистан",
  rank: "генерал-майор",
  signed_fio: "Алимов А.А.",
  signed_position: "Начальник департамента",
  link: "type1",
  notes: "1. Насаби;Примечание по спискам",
  editable_word: "",
  data: {},
  ...over,
});

// ------------------------------------------------------------------ helpers
// Returns the values bound into a Prisma.sql template (e.g. ["%type9%"]).
const sqlValues = (args) => {
  const q = Array.isArray(args) ? args[0] : args;
  return (q && q.values) || [];
};

// Route $queryRaw by the ILIKE patterns it binds.
function routeRaportTypes(fn) {
  prisma.when("$queryRaw", (args) => fn(sqlValues(args), args));
}

// Runs one handler with frozen Date and in-memory file capture.
async function run(handler, body, { userId = ADMIN_ID } = {}) {
  const cap = captureGeneratedFiles();
  mock.timers.enable({ apis: ["Date"], now: FROZEN_NOW });
  const origLog = console.log;
  const origErr = console.error;
  const logged = [];
  console.log = (...a) => logged.push(a);
  console.error = (...a) => logged.push(a);
  try {
    const res = mockRes();
    await handler(mockReq({ body, userId }), res);
    await res.done;
    const files = cap.files.slice();
    const docx = files.find((f) => f.ext === ".docx");
    return {
      res,
      files,
      file: docx,
      doc: docx ? inspectDocx(docx.buffer) : null,
      logged,
    };
  } finally {
    console.log = origLog;
    console.error = origErr;
    mock.timers.reset();
    cap.restore();
  }
}

// Strip index/sectionIndex noise for compact deep-equality on runs.
const runShape = (r) => {
  const out = { text: r.text };
  for (const k of ["font", "size", "sizeCs", "bold", "italic", "underline", "caps", "color", "highlight"]) {
    if (r[k] !== undefined) out[k] = r[k];
  }
  out.breaks = r.breaks;
  out.tabs = r.tabs;
  return out;
};

const paraShape = (p) => {
  const out = { text: p.text };
  for (const k of ["alignment", "spacing", "indent", "borders", "keepNext", "pageBreakBefore", "tabs"]) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  out.runs = p.runs.map(runShape);
  return out;
};

const NONE_BORDER = { val: "none", size: 0, space: undefined, color: "FFFFFF" };
const NO_BORDERS = {
  top: NONE_BORDER,
  left: NONE_BORDER,
  bottom: NONE_BORDER,
  right: NONE_BORDER,
  insideH: NONE_BORDER,
  insideV: NONE_BORDER,
};

const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

module.exports = {
  prisma,
  ctrl,
  SERVER_URL,
  LINK_RE,
  UUID,
  ADMIN_ID,
  FROZEN_NOW,
  UPLOADS_DIR,
  signers,
  admin,
  registration,
  relative,
  raportType,
  sqlValues,
  routeRaportTypes,
  run,
  runShape,
  paraShape,
  NO_BORDERS,
  NONE_BORDER,
};
