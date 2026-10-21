// POST /registerFour/exportMainSverka -> registerFourController.exportSverkaMain
// Characterization tests: response contract, prisma queries, and the exact
// "Сверка" sheet layout (landscape, 5 header rows, bordered data rows).
process.env.TZ = "Asia/Tashkent"; // makes toLocale*String output deterministic

const { test, describe, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { installFakePrisma } = require("../helpers/fakePrisma");
const prisma = installFakePrisma();
const { captureGeneratedFiles } = require("../helpers/captureFiles");
const { SERVER_URL, MODEL_TYPE } = require("../../api/helpers/constants");
const ctrl = require("../../api/controllers/registerFourController");
const S = require("./_support");

const CALLER = "admin-7f3c";
const NOW = "2026-01-15T09:00:00Z";
const STAMP = "14:00  15/01/2026"; // 09:00Z in Asia/Tashkent (UTC+5), "HH:MM  DD/MM/YYYY"

const noon = (d) => new Date(`${d}T12:00:00Z`);

// session rows (the session model carries the person fields itself)
const SESSIONS = [
  { id: "s1", registrationId: "reg-a", lastName: "Иванов", firstName: "Иван", fatherName: "Иванович", birthDate: noon("1980-05-05"), workplace: "АО «Узбекнефтегаз»", position: "инженер" },
  { id: "s2", registrationId: "reg-b", lastName: "Каримова", firstName: "Дилноза", fatherName: "Рустамовна", birthDate: null, birthYear: 1975, workplace: "ТашГТУ" },
  { id: "s3", registrationId: "reg-c", lastName: "Петров", firstName: "Сергей", fatherName: "Николаевич", birthYear: 1952, position: "пенсионер" },
  { id: "s4", registrationId: "reg-d", lastName: "Юсупов", firstName: "Бахтиёр", fatherName: "Алимович", birthYear: 1990 },
  { id: "s5", registrationId: "reg-e", lastName: "Рахимова", firstName: "Нигора", fatherName: "", birthYear: null },
  { id: "s6", registrationId: "reg-missing", lastName: "Ким", firstName: "Виктор", fatherName: "Олегович", birthYear: 1969 },
  { id: "s7", registrationId: "reg-g", lastName: "Абдуллаев", firstName: "Тимур", fatherName: "Шухратович", birthYear: 1985 },
];
const REGS = {
  // model registration -> column G
  "reg-a": { accessStatus: "ДОПУСК", expired: noon("2027-03-01"), regDate: noon("2024-01-10"), model: MODEL_TYPE.REGISTRATION },
  "reg-b": { accessStatus: "ОТКАЗ", expired: null, regDate: noon("2024-06-10"), model: MODEL_TYPE.REGISTRATION },
  // model registration4 -> column H
  "reg-c": { accessStatus: "Снят с учета", expired: noon("2025-12-31"), regDate: noon("2020-02-02"), model: MODEL_TYPE.REGISTRATION_FOUR },
  "reg-d": { accessStatus: "ПРОВЕРКА", expired: null, regDate: noon("2023-02-15"), model: MODEL_TYPE.REGISTRATION_FOUR },
  "reg-e": { accessStatus: null, expired: null, regDate: null, model: MODEL_TYPE.REGISTRATION_FOUR },
  // ДОПУСК without an expiry date
  "reg-g": { accessStatus: "ДОПУСК", expired: null, regDate: noon("2022-08-08"), model: MODEL_TYPE.REGISTRATION },
};

let cap;
before(() => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  cap = captureGeneratedFiles();
});
after(() => {
  cap.restore();
  mock.timers.reset();
});
beforeEach(() => {
  prisma.reset();
  cap.clear();
});

function seed(sessions = SESSIONS) {
  prisma.when("session.findMany", sessions);
  prisma.when("registration.findUnique", (args) => REGS[args.where.id] ?? null);
}

async function exportOk(type = "SESSION", sessions) {
  prisma.reset();
  cap.clear();
  seed(sessions);
  const res = await S.call(ctrl.exportSverkaMain, { body: { type }, userId: CALLER });
  assert.equal(res.statusCode, 200);
  assert.equal(cap.files.length, 1);
  const book = await S.inspectXlsx(cap.last().buffer);
  return { res, book, s: book.sheets[0] };
}

describe("response contract", () => {
  test("200 JSON with a download link; file is a uuid .xlsx in ./uploads", async () => {
    const { res } = await exportOk();
    assert.deepEqual(Object.keys(res.body).sort(), ["code", "link", "message"]);
    assert.equal(res.body.code, 200);
    assert.equal(res.body.message, "Excel file exported successfully");
    assert.match(res.body.link, S.linkRegex(SERVER_URL));
    const f = cap.last();
    assert.match(f.path, S.UPLOAD_PATH_RE);
    assert.equal(res.body.link.split("/").pop(), f.path.split("/").pop());
    assert.equal(f.buffer.slice(0, 4).toString("hex"), "504b0304");
    assert.equal(res.downloaded, null);
    assert.equal(res.headers["content-disposition"], undefined);
  });

  test("queries the caller's sessions (adminId = req.userId) and one registration per row", async () => {
    await exportOk("RESERVE");
    assert.deepEqual(prisma.calls("session.findMany"), [{ where: { type: "RESERVE", adminId: CALLER } }]);
    const regCalls = prisma.calls("registration.findUnique");
    assert.equal(regCalls.length, SESSIONS.length);
    assert.deepEqual(
      regCalls.map((a) => a.where.id),
      SESSIONS.map((x) => x.registrationId)
    );
    for (const a of regCalls) {
      assert.deepEqual(a.select, { accessStatus: true, expired: true, regDate: true, model: true });
    }
    const writes = prisma.log.filter((e) => /\.(create|update|upsert|delete)/.test(e.key));
    assert.deepEqual(writes, []); // read-only
  });

  for (const type of ["SESSION", "RESERVE", "RAPORT"]) {
    test(`type ${type}: accepted, same sheet layout and data rows`, async () => {
      const { res, s } = await exportOk(type);
      assert.equal(prisma.calls("session.findMany")[0].where.type, type);
      assert.match(res.body.link, S.linkRegex(SERVER_URL));
      assert.equal(s.name, "Сверка");
      assert.equal(s.pageSetup.orientation, "landscape");
      assert.equal(s.rowCount, 5 + SESSIONS.length);
      assert.deepEqual(s.merges.slice().sort(), ["A1:H1", "A3:A5", "B3:B5", "C3:C5", "D3:D5", "E3:E5", "F3:F5", "G2:H2", "G3:H3", "G4:H4"]);
    });
  }

  for (const [label, body] of [
    ["missing type", {}],
    ["lowercase type", { type: "session" }],
    ["unknown type", { type: "ARCHIVE" }],
    ["empty type", { type: "" }],
  ]) {
    test(`400 "Invalid session type" for ${label}, no DB call, no file`, async () => {
      const res = await S.call(ctrl.exportSverkaMain, { body, userId: CALLER });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "Invalid session type" });
      assert.equal(prisma.log.length, 0);
      assert.equal(cap.files.length, 0);
    });
  }

  test('404 "No data found" when the caller has no sessions of that type', async () => {
    prisma.when("session.findMany", []);
    const res = await S.call(ctrl.exportSverkaMain, { body: { type: "SESSION" }, userId: CALLER });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found" });
    assert.equal(prisma.calls("registration.findUnique").length, 0);
    assert.equal(cap.files.length, 0);
  });

  test("500 with the error message when session.findMany throws", async () => {
    prisma.when("session.findMany", () => {
      throw new Error("db connection lost");
    });
    const res = await S.quiet(() => S.call(ctrl.exportSverkaMain, { body: { type: "SESSION" }, userId: CALLER }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "db connection lost" });
    assert.equal(cap.files.length, 0);
  });

  test('registration.findUnique throwing is caught per row: H = "Ошибка", export still 200', async () => {
    prisma.when("session.findMany", SESSIONS.slice(0, 2));
    prisma.when("registration.findUnique", (args) => {
      if (args.where.id === "reg-a") throw new Error("timeout");
      return REGS[args.where.id];
    });
    const res = await S.quiet(() => S.call(ctrl.exportSverkaMain, { body: { type: "SESSION" }, userId: CALLER }));
    assert.equal(res.statusCode, 200);
    const s = (await S.inspectXlsx(cap.last().buffer)).sheets[0];
    // NOTE: the error always lands in H, even for model "registration" rows whose status normally goes to G.
    S.assertSverkaDataRow(assert, s, 6, [1, "Иванов", "Иван", "Иванович", 1980, "АО «Узбекнефтегаз», инженер", "", "Ошибка"]);
    S.assertSverkaDataRow(assert, s, 7, [2, "Каримова", "Дилноза", "Рустамовна", 1975, "ТашГТУ", "ОТКАЗ от 10.06.2024", ""]);
  });
});

describe('sheet "Сверка" layout', () => {
  let s;
  let book;
  before(async () => {
    ({ s, book } = await exportOk());
  });

  test("one landscape sheet with default margins, no paper size / fit-to / frozen panes / filter / images", () => {
    assert.deepEqual(book.sheetNames, ["Сверка"]);
    assert.deepEqual(s.pageSetup, S.defaultPageSetup("landscape")); // { pageSetup: { orientation: "landscape" } }
    assert.deepEqual(s.pageSetup.margins, { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 });
    assert.equal(s.pageSetup.paperSize, undefined);
    assert.equal(s.pageSetup.fitToPage, false);
    assert.equal(s.views, null);
    assert.equal(s.autoFilter, undefined);
    assert.equal(s.headerFooter, null);
    assert.deepEqual(s.images, []);
    assert.deepEqual(book.media, []);
  });

  test("column widths A..H", () => {
    // registerFourController.js:2092-2101 — №, Фам, Имя, Отч, Г.р., Место работы, Р/О, Р/О(У)
    assert.deepEqual(
      s.columns.map((c) => [c.letter, c.width]),
      [
        ["A", 8],
        ["B", 15],
        ["C", 15],
        ["D", 15],
        ["E", 8],
        ["F", 25],
        ["G", 25],
        ["H", 25],
      ]
    );
    assert.equal(s.columnCount, 8);
  });

  test("merges", () => {
    assert.deepEqual(s.merges, ["A1:H1", "G2:H2", "G3:H3", "A3:A5", "B3:B5", "C3:C5", "D3:D5", "E3:E5", "F3:F5", "G4:H4"]);
  });

  test("header rows 1-5: every cell's value, font, alignment, border, fill, merge master", () => {
    S.assertSverkaHeader(assert, s, { kompr: false, stamp: STAMP });
    assert.equal(s.cell("G2").value, S.sverkaStamp(new Date(NOW)));
    assert.match(s.cell("G2").value, /^\d{2}:\d{2} {2}\d{2}\/\d{2}\/\d{4}$/);
  });

  test("data rows from row 6: values and status column per model/accessStatus", () => {
    assert.equal(s.rowCount, 5 + SESSIONS.length);
    const expected = [
      // workplace + position joined with ", "; birthDate -> year; registration model -> G
      [1, "Иванов", "Иван", "Иванович", 1980, "АО «Узбекнефтегаз», инженер", "ДОПУСК до 01.03.2027", ""],
      // workplace only; birthYear; non-ДОПУСК -> "<status> от <regDate>"
      [2, "Каримова", "Дилноза", "Рустамовна", 1975, "ТашГТУ", "ОТКАЗ от 10.06.2024", ""],
      // position only; registration4 + "снят" -> H "<status> до <expired>"
      [3, "Петров", "Сергей", "Николаевич", 1952, "пенсионер", "", "Снят с учета до 31.12.2025"],
      // registration4, other status -> H "<status> от <regDate>"
      [4, "Юсупов", "Бахтиёр", "Алимович", 1990, "", "", "ПРОВЕРКА от 15.02.2023"],
      // registration4 with no accessStatus -> H "Найден"; no year -> ""
      [5, "Рахимова", "Нигора", "", "", "", "", "Найден"],
      // NOTE: registration not found (findUnique -> null) is reported as "Найден" in G, same as a found record without status.
      [6, "Ким", "Виктор", "Олегович", 1969, "", "Найден", ""],
      // ДОПУСК with no expiry -> "ДОПУСК до " (trailing space, empty date)
      [7, "Абдуллаев", "Тимур", "Шухратович", 1985, "", "ДОПУСК до ", ""],
    ];
    expected.forEach((values, i) => S.assertSverkaDataRow(assert, s, 6 + i, values));
    assert.equal(s.rows[6 + SESSIONS.length], undefined); // no trailing rows
  });

  test("data cell types: № and year numeric, text otherwise", () => {
    assert.equal(typeof s.cell("A6").value, "number");
    assert.equal(typeof s.cell("E6").value, "number");
    assert.equal(typeof s.cell("G6").value, "string");
  });
});

describe("variants", () => {
  test("single session row -> exactly one data row (row 6)", async () => {
    const { s } = await exportOk("SESSION", [SESSIONS[0]]);
    assert.equal(s.rowCount, 6);
    S.assertSverkaDataRow(assert, s, 6, [1, "Иванов", "Иван", "Иванович", 1980, "АО «Узбекнефтегаз», инженер", "ДОПУСК до 01.03.2027", ""]);
    S.assertSverkaHeader(assert, s, { kompr: false, stamp: STAMP });
  });

  test("lowercase 'снят' in a registration-model status also uses the expiry date (G)", async () => {
    prisma.when("session.findMany", [{ registrationId: "x", lastName: "Тест" }]);
    prisma.when("registration.findUnique", { accessStatus: "снят по решению", expired: noon("2026-07-07"), regDate: noon("2020-01-01"), model: "registration" });
    const res = await S.call(ctrl.exportSverkaMain, { body: { type: "RAPORT" }, userId: CALLER });
    assert.equal(res.statusCode, 200);
    const s = (await S.inspectXlsx(cap.last().buffer)).sheets[0];
    S.assertSverkaDataRow(assert, s, 6, [1, "Тест", "", "", "", "", "снят по решению до 07.07.2026", ""]);
  });
});
