// POST /registerFour/exportSverka -> registerFourController.exportSverka
// Characterization tests: response contract, prisma queries + raport/raportLink
// writes, and the exact "Сверка" sheet layout with and without the
// "Компрматериалы" column (komprMaterials === true).
process.env.TZ = "Asia/Tashkent"; // makes toLocale*String output deterministic

const { test, describe, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { installFakePrisma } = require("../helpers/fakePrisma");
const prisma = installFakePrisma();
const { captureGeneratedFiles } = require("../helpers/captureFiles");
const { SERVER_URL } = require("../../api/helpers/constants");
const ctrl = require("../../api/controllers/registerFourController");
const S = require("./_support");

const CALLER = "superadmin-0001";
const EXECUTOR = "admin-executor-42";
const NOW = "2026-01-15T09:00:00Z";
const STAMP = "14:00  15/01/2026"; // 09:00Z in Asia/Tashkent (UTC+5)

const noon = (d) => new Date(`${d}T12:00:00Z`);

// temporaryData rows, already in prisma's `order asc` order
const TEMP = [
  // registration ДОПУСК + registration_four ОТКАЗ, flagged, duplicate notes (trim-dedup)
  { id: "t1", order: 1, lastName: "Иванов", firstName: "Иван", fatherName: "Иванович", birthDate: noon("1980-05-05"), workplace: "АО «Узбекнефтегаз»", position: "инженер", registration: "reg-1", registration_four: "r4-1", kompromat_status: true },
  // "Снят" status + registration_four without status, flagged, two distinct notes
  { id: "t2", order: 2, lastName: "Каримова", firstName: "Дилноза", fatherName: "Рустамовна", birthYear: 1975, workplace: "ТашГТУ", registration: "reg-2", registration_four: "r4-2", kompromat_status: true },
  // no registration; registration_four id that does not resolve; not flagged
  { id: "t3", order: 3, lastName: "Петров", firstName: "Сергей", fatherName: "Николаевич", birthYear: 1952, position: "пенсионер", registration: null, registration_four: "r4-missing", kompromat_status: false },
  // registration with notes but NOT flagged -> notes hidden; no registration_four
  { id: "t4", order: 4, lastName: "Юсупов", firstName: "Бахтиёр", fatherName: "Алимович", birthYear: 1990, registration: "reg-4", registration_four: null, kompromat_status: false },
  // order 0 -> falls back to the row index (i + 1)
  { id: "t5", order: 0, lastName: "Рахимова", firstName: "Нигора", fatherName: null, birthYear: null, registration: "reg-5", registration_four: null, kompromat_status: true },
];
const REGS = {
  "reg-1": { accessStatus: "ДОПУСК", expired: noon("2027-03-01"), regDate: noon("2024-01-10"), notes: "Судимость 2010 г." },
  "r4-1": { accessStatus: "ОТКАЗ", expired: null, regDate: noon("2024-06-10"), notes: "  Судимость 2010 г.  " },
  "reg-2": { accessStatus: "Снят с учета", expired: noon("2025-12-31"), regDate: noon("2020-02-02"), notes: "Связь с ОПГ" },
  "r4-2": { accessStatus: null, expired: null, regDate: null, notes: "Долги по кредиту" },
  "reg-4": { accessStatus: "ПРОВЕРКА", expired: null, regDate: noon("2023-02-15"), notes: "Скрытая заметка" },
  "reg-5": { accessStatus: "ДОПУСК", expired: null, regDate: null, notes: "   " },
};

// Expected A..H for TEMP (identical with and without Компрматериалы).
const ROWS_AH = [
  [1, "Иванов", "Иван", "Иванович", 1980, "АО «Узбекнефтегаз», инженер", "ДОПУСК до 01.03.2027", "ОТКАЗ от 10.06.2024"],
  [2, "Каримова", "Дилноза", "Рустамовна", 1975, "ТашГТУ", "Снят с учета до 31.12.2025", "Найден"],
  // NOTE: an unresolvable registration_four id prints "Найден" (found), not "Не найден".
  [3, "Петров", "Сергей", "Николаевич", 1952, "пенсионер", "Не найден", "Найден"],
  [4, "Юсупов", "Бахтиёр", "Алимович", 1990, "", "ПРОВЕРКА от 15.02.2023", "Не найден"],
  // NOTE: `data.order || i + 1` turns order 0 into the row index (5).
  [5, "Рахимова", "Нигора", "", "", "", "ДОПУСК до ", "Не найден"],
];
// Column I with komprMaterials: trimmed, de-duplicated notes joined by "; ", only when kompromat_status.
const KOMPR = ["Судимость 2010 г.", "Связь с ОПГ; Долги по кредиту", "", "", ""];

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

function seed(rows = TEMP) {
  prisma.when("temporaryData.findMany", rows);
  prisma.when("registration.findUnique", (args) => REGS[args.where.id] ?? null);
  prisma.when("raport.create", (args) => ({ id: "raport-uuid-1", ...args.data }));
}

async function exportOk(body, rows) {
  prisma.reset();
  cap.clear();
  seed(rows);
  const res = await S.call(ctrl.exportSverka, { body, userId: CALLER });
  assert.equal(res.statusCode, 200);
  assert.equal(cap.files.length, 1);
  const book = await S.inspectXlsx(cap.last().buffer);
  return { res, book, s: book.sheets[0] };
}

describe("response contract and DB writes", () => {
  test("200 JSON with a download link; file is a uuid .xlsx in ./uploads", async () => {
    const { res } = await exportOk({ executorId: EXECUTOR, komprMaterials: true });
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

  test("queries temporaryData by the body executorId (not req.userId), ordered by order asc", async () => {
    await exportOk({ executorId: EXECUTOR, komprMaterials: false, regNumber: "ignored", status: "ignored" });
    assert.deepEqual(prisma.calls("temporaryData.findMany"), [
      { where: { executorId: { equals: EXECUTOR } }, orderBy: { order: "asc" } },
    ]);
  });

  test("looks up registration and registration_four ids (both via registration.findUnique)", async () => {
    await exportOk({ executorId: EXECUTOR });
    const calls = prisma.calls("registration.findUnique");
    assert.deepEqual(
      calls.map((a) => a.where.id),
      ["reg-1", "r4-1", "reg-2", "r4-2", "r4-missing", "reg-4", "reg-5"] // null ids skipped
    );
    for (const a of calls) assert.deepEqual(a.select, { accessStatus: true, expired: true, regDate: true, notes: true });
  });

  test("creates a raport {name:'sverka', executorId, link} and a raportLink {raportId, display:true}", async () => {
    const { res } = await exportOk({ executorId: EXECUTOR, komprMaterials: true });
    // NOTE: the code comment says the record is tied to "the admin who generated it",
    // but it uses the body executorId, not req.userId.
    assert.deepEqual(prisma.calls("raport.create"), [{ data: { name: "sverka", executorId: EXECUTOR, link: res.body.link } }]);
    assert.deepEqual(prisma.calls("raportLink.create"), [{ data: { raportId: "raport-uuid-1", display: true } }]);
    // order: file written, then raport, then raportLink
    const keys = prisma.log.map((e) => e.key);
    assert.ok(keys.indexOf("raport.create") < keys.indexOf("raportLink.create"));
    assert.equal(keys.filter((k) => /\.(update|upsert|delete)/.test(k)).length, 0);
  });

  for (const [label, body] of [
    ["missing executorId", { komprMaterials: true }],
    ["empty executorId", { executorId: "" }],
    ["null executorId", { executorId: null }],
  ]) {
    test(`400 "Ids is required" for ${label}, no DB call, no file`, async () => {
      const res = await S.call(ctrl.exportSverka, { body, userId: CALLER });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "Ids is required" });
      assert.equal(prisma.log.length, 0);
      assert.equal(cap.files.length, 0);
    });
  }

  test('404 "No data found" when the executor has no temporaryData; nothing written', async () => {
    prisma.when("temporaryData.findMany", []);
    const res = await S.call(ctrl.exportSverka, { body: { executorId: EXECUTOR }, userId: CALLER });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found" });
    assert.equal(prisma.calls("raport.create").length, 0);
    assert.equal(prisma.calls("raportLink.create").length, 0);
    assert.equal(cap.files.length, 0);
  });

  test("500 with the error message when temporaryData.findMany throws", async () => {
    prisma.when("temporaryData.findMany", () => {
      throw new Error("db connection lost");
    });
    const res = await S.quiet(() => S.call(ctrl.exportSverka, { body: { executorId: EXECUTOR }, userId: CALLER }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "db connection lost" });
    assert.equal(cap.files.length, 0);
  });

  test("500 when raport.create throws — the xlsx was already written (orphan file)", async () => {
    seed();
    prisma.when("raport.create", () => {
      throw new Error("unique constraint");
    });
    const res = await S.quiet(() => S.call(ctrl.exportSverka, { body: { executorId: EXECUTOR }, userId: CALLER }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "unique constraint" });
    // NOTE: file is written before the DB insert, so a failed insert leaves an unreferenced upload.
    assert.equal(cap.files.length, 1);
    assert.equal(prisma.calls("raportLink.create").length, 0);
  });

  test('registration lookups that throw are caught per column: "Ошибка" in G / H', async () => {
    prisma.when("temporaryData.findMany", [TEMP[0]]);
    prisma.when("registration.findUnique", () => {
      throw new Error("timeout");
    });
    const res = await S.quiet(() => S.call(ctrl.exportSverka, { body: { executorId: EXECUTOR, komprMaterials: true }, userId: CALLER }));
    assert.equal(res.statusCode, 200);
    const s = (await S.inspectXlsx(cap.last().buffer)).sheets[0];
    S.assertSverkaDataRow(assert, s, 6, [1, "Иванов", "Иван", "Иванович", 1980, "АО «Узбекнефтегаз», инженер", "Ошибка", "Ошибка", ""]);
  });
});

describe('komprMaterials: true — sheet "Сверка" with column I', () => {
  let s;
  let book;
  before(async () => {
    ({ s, book } = await exportOk({ executorId: EXECUTOR, komprMaterials: true }));
  });

  test("one landscape sheet, default margins, no paper size / fit-to / frozen panes / filter / images", () => {
    assert.deepEqual(book.sheetNames, ["Сверка"]);
    assert.deepEqual(s.pageSetup, S.defaultPageSetup("landscape"));
    assert.deepEqual(s.pageSetup.margins, { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 });
    assert.equal(s.pageSetup.paperSize, undefined);
    assert.equal(s.views, null);
    assert.equal(s.autoFilter, undefined);
    assert.equal(s.headerFooter, null);
    assert.deepEqual(s.images, []);
    assert.deepEqual(book.media, []);
  });

  test("column widths A..I", () => {
    // registerFourController.js:2497-2507 (G 35, H 30, I 40 — wider than exportSverkaMain)
    assert.deepEqual(
      s.columns.map((c) => [c.letter, c.width]),
      [
        ["A", 8],
        ["B", 15],
        ["C", 15],
        ["D", 15],
        ["E", 8],
        ["F", 25],
        ["G", 35],
        ["H", 30],
        ["I", 40],
      ]
    );
    assert.equal(s.columnCount, 9);
  });

  test("merges: title spans A1:I1 and I3:I5 is added; G2:H2 is not extended", () => {
    assert.deepEqual(s.merges, ["A1:I1", "G2:H2", "G3:H3", "A3:A5", "B3:B5", "C3:C5", "D3:D5", "E3:E5", "F3:F5", "G4:H4", "I3:I5"]);
  });

  test("header rows 1-5 incl. Компрматериалы (bold 11, centre, wrapText, thin box)", () => {
    S.assertSverkaHeader(assert, s, { kompr: true, stamp: STAMP });
    assert.equal(s.cell("G2").value, S.sverkaStamp(new Date(NOW)));
  });

  test("data rows: A..H statuses and I = de-duplicated notes of flagged rows only", () => {
    assert.equal(s.rowCount, 5 + TEMP.length);
    ROWS_AH.forEach((ah, i) => S.assertSverkaDataRow(assert, s, 6 + i, [...ah, KOMPR[i]]));
    assert.equal(s.rows[6 + TEMP.length], undefined);
  });
});

describe('komprMaterials: false — sheet "Сверка" without column I', () => {
  let s;
  before(async () => {
    ({ s } = await exportOk({ executorId: EXECUTOR, komprMaterials: false }));
  });

  test("page setup identical (landscape, defaults)", () => {
    assert.deepEqual(s.pageSetup, S.defaultPageSetup("landscape"));
    assert.equal(s.views, null);
  });

  test("column widths A..H only", () => {
    assert.deepEqual(s.columns.map((c) => c.width), [8, 15, 15, 15, 8, 25, 35, 30]);
    assert.equal(s.columnCount, 8);
  });

  test("merges: title A1:H1, no I3:I5", () => {
    assert.deepEqual(s.merges, ["A1:H1", "G2:H2", "G3:H3", "A3:A5", "B3:B5", "C3:C5", "D3:D5", "E3:E5", "F3:F5", "G4:H4"]);
  });

  test("header rows 1-5 without Компрматериалы; I column untouched", () => {
    S.assertSverkaHeader(assert, s, { kompr: false, stamp: STAMP });
  });

  test("data rows A..H identical to the kompr variant; nothing in I", () => {
    assert.equal(s.rowCount, 5 + TEMP.length);
    ROWS_AH.forEach((ah, i) => S.assertSverkaDataRow(assert, s, 6 + i, ah));
  });
});

describe("komprMaterials strictness", () => {
  for (const [label, val] of [
    ["omitted", undefined],
    ['string "true"', "true"],
    ["1", 1],
  ]) {
    test(`komprMaterials ${label} -> no Компрматериалы column (=== true only)`, async () => {
      const body = { executorId: EXECUTOR };
      if (val !== undefined) body.komprMaterials = val;
      const { s } = await exportOk(body);
      assert.equal(s.columnCount, 8);
      assert.ok(!s.merges.includes("I3:I5"));
      assert.equal(s.cell("I3").value, null);
      assert.equal(s.cell("I6").value, null);
    });
  }

  test("single row -> exactly one data row, raport still created", async () => {
    const { s, res } = await exportOk({ executorId: EXECUTOR, komprMaterials: true }, [TEMP[1]]);
    assert.equal(s.rowCount, 6);
    S.assertSverkaDataRow(assert, s, 6, [...ROWS_AH[1], KOMPR[1]]);
    assert.equal(prisma.calls("raport.create")[0].data.link, res.body.link);
  });
});
