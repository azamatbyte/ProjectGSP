// Characterization tests for POST /api/v1/register/globalSearchExport
// (registerController.globalSearchExport, registerController.js:3160-3448).
// FILE endpoint: ExcelJS workbook built in memory, workbook.xlsx.writeBuffer(),
// res.status(200).send(Buffer). Nothing goes to disk, no DB writes.
// Rows come from prisma.$queryRawUnsafe(buildSearchExportQuery(...))
// (api/helpers/globalSearchQueryBuilder.js:500).
const test = require("node:test");
const { describe, before, after, beforeEach, mock } = test;
const assert = require("node:assert/strict");

const { installFakePrisma } = require("../helpers/fakePrisma");
const { captureGeneratedFiles } = require("../helpers/captureFiles");
const { mockRes } = require("../helpers/http");
const { inspectXlsx } = require("../helpers/xlsxInspector");
const S = require("./_support");

const prisma = installFakePrisma();
const ctrl = require("../../api/controllers/registerController");

const NOW = new Date("2026-01-15T09:00:00Z"); // = 2026-01-15 14:00:00 in Asia/Tashkent (UTC+5)
const TS = "2026-01-15_14-00-00"; // getTashkentTimestamp(): sv-SE format, " "->"_", ":"->"-" (registerController.js:156-169)
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; // registerController.js:3430
const TITLE = "Выгрузка глобального поиска"; // registerController.js:3314

// registerController.js:3321-3344
const HEADERS = [
  "№",
  "Рег номер",
  "Ф",
  "Даты СП",
  "Степень родства",
  "Ф.И.О.",
  "Дата рождения",
  "Дата регистрации",
  "Дата завершения СП",
  "Состояние СП",
  "Статус СП",
  "Срок действия допуска",
  "ПИНФЛ",
  "Паспорт",
  "Номер заключения",
  "Место рождения",
  "Место работы",
  "Компрматериалы",
  "Место прописки/жительства",
  "Инициатор",
  "Исполнитель",
  "Обновлено",
];
const COLS = "ABCDEFGHIJKLMNOPQRSTUV".split(""); // A1:V1 merge = 22 columns

const THIN = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; // :3412-3417
const NO_FILL = { type: "pattern", pattern: "none" }; // no fill set anywhere: ExcelJS default
const DEFAULT_FONT = { name: "Calibri", size: 11, color: { theme: 1 }, family: 2, scheme: "minor" }; // ExcelJS default style

// Expected data rows (rows 5..8) for S.exportRows(), mapped as registerController.js:3348-3391.
const EXPECTED_ROWS = [
  [
    1,
    "1708-19",
    "Ф-4",
    "01.02.2019",
    "", // relationdegree null -> ""
    "Каримов Шерзод Алишерович",
    "12.03.1985", // birth_date -> formatExportDate (ru-RU dd.mm.yyyy)
    "01.02.2019",
    "02.03.2019", // NOTE: 2019-03-01T21:30Z rendered in Asia/Tashkent -> next day
    "ЗАВЕРШЕНО", // complete_status !== "WAITING"
    "ДОПУСК",
    "01.02.2024",
    "31203851234567",
    "AA1234567",
    "З-15",
    "г. Ташкент",
    "АО Узбекнефтегаз инженер", // workplace + " " + positionv1
    S.LONG_NOTES,
    "г. Ташкент, Юнусабадский р-н",
    "Иванов Пётр Сергеевич",
    "Алиқулов Азамат", // father_name null dropped
    "10.01.2026, 17:34:56", // updatedat withTime, +5h
  ],
  [
    2,
    "1708-19",
    "Ф-4",
    "01.02.2019",
    "Отец",
    "Каримов Алишер Рустамович",
    1958, // NOTE: birth_date null -> raw birth_year, stored as a NUMBER cell (other dates are text)
    "01.02.2019",
    "02.03.2019",
    "ЗАВЕРШЕНО",
    "ДОПУСК",
    "01.02.2024",
    "",
    "AA1234567",
    "З-15",
    "Самаркандская обл.",
    "Пенсионер", // trimmed, null position dropped
    "",
    "г. Ташкент, Юнусабадский р-н",
    "Иванов Пётр Сергеевич",
    "Алиқулов Азамат",
    "12.01.2026, 01:00:00",
  ],
  [
    3,
    "1708-19",
    "Ф-4",
    "01.02.2019",
    "Мать",
    "Каримова Дилноза Ахмедовна",
    "", // no birth_date, no birth_year
    "01.02.2019",
    "02.03.2019",
    "ЗАВЕРШЕНО",
    "ДОПУСК",
    "01.02.2024",
    "41505601234567",
    "AA1234567",
    "З-15",
    "",
    "учитель", // null workplace dropped
    "",
    "",
    "Иванов Пётр Сергеевич",
    "Алиқулов Азамат",
    "", // updatedat null
  ],
  [
    4,
    "2045-24",
    "Ф-1",
    "",
    "",
    "Юсупова Малика Рашидовна",
    "04.07.1990", // string birth_date accepted
    "21.05.2024", // 2024-05-20T20:15Z -> next day in Tashkent
    "",
    "ОЖИДАНИЕ", // complete_status === "WAITING" (registerController.js:193)
    "",
    "",
    "40407901234567",
    "",
    "",
    "г. Бухара",
    "ООО Бухоро Савдо бухгалтер",
    "нет",
    "г. Бухара",
    "", // no initiator
    "", // no executor
    "15.01.2026, 04:59:59",
  ],
];

let cap;
before(() => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  cap = captureGeneratedFiles();
});
after(() => {
  cap.restore();
  mock.timers.reset();
});
beforeEach(() => {
  prisma.reset();
  prisma.when("admin.findUnique", S.EXECUTOR);
  prisma.when("$queryRawUnsafe", S.exportRows());
});

async function exportBook(body = { regNumber: "1708-19", regNumberStatus: false }) {
  const res = await S.callExport(ctrl, body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const book = await inspectXlsx(res.body);
  return { res, book, s: book.sheet("Поиск") };
}

async function queryFor(body) {
  await S.callExport(ctrl, body);
  const calls = prisma.calls("$queryRawUnsafe");
  assert.equal(calls.length, 1);
  return calls[0][0];
}
const squash = (q) => q.replace(/\s+/g, " ");

// ---------------------------------------------------------------- A. response
describe("response contract (FILE)", () => {
  test("200 with xlsx Content-Type, attachment Content-Disposition and an xlsx Buffer body", async () => {
    const res = await S.callExport(ctrl, { regNumber: "1708-19", regNumberStatus: false });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.headers).sort(), ["content-disposition", "content-type"]);
    assert.equal(res.headers["content-type"], XLSX_MIME);
    // registerController.js:3423-3425 + :3434
    assert.equal(res.headers["content-disposition"], `attachment; filename="global_search_export_${TS}_Admin_Super.xlsx"`);
    assert.match(
      res.headers["content-disposition"],
      /^attachment; filename="global_search_export_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[^"\s]+\.xlsx"$/
    );
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.subarray(0, 4).toString("hex"), "504b0304"); // PK\x03\x04
    assert.ok(res.body.length > 5000);
    assert.equal(res.downloaded, null);
    assert.equal(res.sentFile, null);
    assert.equal(cap.files.length, 0, "nothing written to uploads/");
  });

  test("reads the executor, then runs exactly one raw query; no DB writes", async () => {
    await S.callExport(ctrl, { regNumber: "1708-19" }, { userId: "admin-777" });
    assert.deepEqual(
      prisma.log.map((e) => e.key),
      ["admin.findUnique", "$queryRawUnsafe"]
    );
    // registerController.js:3271-3279
    assert.deepEqual(prisma.calls("admin.findUnique")[0], {
      where: { id: "admin-777" },
      select: { username: true, first_name: true, last_name: true, father_name: true },
    });
    const [args] = prisma.calls("$queryRawUnsafe");
    assert.equal(args.length, 1, "query string only, no bound parameters");
    assert.equal(typeof args[0], "string");
    assert.doesNotMatch(args[0], /LIMIT|OFFSET/, "export query is unpaginated");
  });

  test("workbook metadata: creator = executor full name, created = now", async () => {
    const { book } = await exportBook();
    assert.equal(book.raw.creator, "Admin Super"); // :3306
    assert.equal(book.raw.created.toISOString(), NOW.toISOString()); // :3307
  });

  test("401 when the executor is not found, query never runs", async () => {
    prisma.when("admin.findUnique", null);
    const res = await S.callExport(ctrl, { regNumber: "1708-19" });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { code: 401, message: "Executor not found" });
    assert.equal(prisma.calls("$queryRawUnsafe").length, 0);
    assert.deepEqual(res.headers, {});
  });

  test('404 "No data found for export" when the query returns no rows', async () => {
    prisma.when("$queryRawUnsafe", []);
    const res = await S.callExport(ctrl, { regNumber: "0000-00" });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found for export" });
    assert.deepEqual(res.headers, {});
  });

  test("500 when the raw query throws", async () => {
    prisma.when("$queryRawUnsafe", () => {
      throw new Error('relation "Registration" does not exist');
    });
    const res = await S.callExport(ctrl, { regNumber: "1708-19" });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      code: 500,
      message: "Internal server error",
      error: 'relation "Registration" does not exist',
    });
  });

  test("500 when the executor lookup throws", async () => {
    prisma.when("admin.findUnique", () => {
      throw new Error("Can't reach database server");
    });
    const res = await S.callExport(ctrl, {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "Can't reach database server" });
    assert.equal(prisma.calls("$queryRawUnsafe").length, 0);
  });

  test("missing body is treated as {} (exports everything, no WHERE)", async () => {
    const res = mockRes();
    await ctrl.globalSearchExport({ body: undefined, userId: "admin-super-id" }, res);
    await res.done;
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(prisma.calls("$queryRawUnsafe")[0][0], /WHERE/);
  });

  describe("filename from the executor name (registerController.js:3298-3302, 3423-3425)", () => {
    const cases = [
      [{ username: "superadmin", last_name: "Admin", first_name: "Super", father_name: null }, "Admin_Super", "Admin Super"],
      [{ username: "x", last_name: " Aliqulov ", first_name: "Azamat", father_name: "Bahodirovich" }, "Aliqulov_Azamat_Bahodirovich", "Aliqulov Azamat Bahodirovich"],
      [{ username: "operator1", last_name: null, first_name: "", father_name: null }, "operator1", "operator1"], // falls back to username
      [{ username: "a", last_name: 'Smith/Jones:"Q"', first_name: "J*", father_name: null }, "Smith_Jones_Q_J", 'Smith/Jones:"Q" J*'], // <>:"/\|?* -> space -> "_"
      [{ username: "???", last_name: null, first_name: null, father_name: null }, "superAdmin", "???"], // sanitizes to "" -> "superAdmin"
    ];
    for (const [executor, part, b2] of cases) {
      test(`${JSON.stringify(executor)} -> ${part}`, async () => {
        prisma.when("admin.findUnique", executor);
        const { res, s } = await exportBook({});
        assert.equal(res.headers["content-disposition"], `attachment; filename="global_search_export_${TS}_${part}.xlsx"`);
        assert.equal(s.cell("B2").value, b2);
      });
    }
  });

  test("NOTE bug: a Cyrillic executor name makes Node reject Content-Disposition -> 500", async () => {
    // NOTE: the filename is put raw into the header (no RFC 5987 filename*=UTF-8''),
    // Node's ServerResponse.setHeader throws ERR_INVALID_CHAR for chars > U+00FF,
    // so any executor with a Cyrillic / Uzbek (ʻ) name cannot export.
    prisma.when("admin.findUnique", S.CYRILLIC_EXECUTOR);
    const res = await S.callExport(ctrl, { regNumber: "1708-19" });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      code: 500,
      message: "Internal server error",
      error: 'Invalid character in header content ["Content-Disposition"]',
    });
    // NOTE: Content-Type was already set to xlsx before the throw and stays on the JSON error.
    assert.equal(res.headers["content-type"], XLSX_MIME);
    assert.equal(res.headers["content-disposition"], undefined);

    // Without header validation the intended filename would be:
    const loose = await S.callExport(ctrl, { regNumber: "1708-19" }, { res: mockRes() });
    assert.equal(
      loose.headers["content-disposition"],
      `attachment; filename="global_search_export_${TS}_Алиқулов_Азамат_Баходирович.xlsx"`
    );
  });

  test("real Express over a named pipe: 200 xlsx for a Latin executor, 500 JSON for a Cyrillic one", async () => {
    const ok = await S.postViaPipe(ctrl.globalSearchExport, { regNumber: "1708-19", regNumberStatus: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["content-type"], XLSX_MIME);
    assert.equal(ok.headers["content-disposition"], `attachment; filename="global_search_export_${TS}_Admin_Super.xlsx"`);
    assert.equal(Number(ok.headers["content-length"]), ok.body.length);
    assert.equal(ok.body.subarray(0, 4).toString("hex"), "504b0304");
    const book = await inspectXlsx(ok.body);
    assert.deepEqual(book.sheetNames, ["Поиск"]);

    prisma.when("admin.findUnique", S.CYRILLIC_EXECUTOR);
    const bad = await S.postViaPipe(ctrl.globalSearchExport, { regNumber: "1708-19" });
    assert.equal(bad.status, 500);
    // NOTE: express res.json keeps the earlier xlsx Content-Type and just appends a charset.
    assert.equal(bad.headers["content-type"], `${XLSX_MIME}; charset=utf-8`);
    assert.equal(bad.headers["content-disposition"], undefined);
    assert.deepEqual(JSON.parse(bad.body.toString("utf8")), {
      code: 500,
      message: "Internal server error",
      error: 'Invalid character in header content ["Content-Disposition"]',
    });
  });
});

// ---------------------------------------------------------- filter variants
describe("filters change the SQL (buildSearchExportQuery)", () => {
  test("no filters: both UNION branches unfiltered, default ORDER BY", async () => {
    const q = await queryFor({});
    assert.doesNotMatch(q, /WHERE/);
    assert.match(q, /FROM "Registration" r\s+LEFT JOIN "Initiator" ini ON r\."or_tab" = ini\."id"\s+LEFT JOIN "Admin" adm ON r\."executorId" = adm\."id"\s+UNION ALL/);
    assert.match(q, /INNER JOIN "Registration" regg ON rel\."registrationId" = regg\."id"\s+\) combined_results\s+ORDER BY model_name, createdAt DESC\s+;/);
  });

  test("regNumber is an exact lower(trim()) match on both branches (registration's number for relatives)", async () => {
    const q = await queryFor({ regNumber: "  1708-19 ", regNumberStatus: false });
    assert.equal(squash(q).match(/WHERE/g).length, 2);
    assert.ok(q.includes(`WHERE lower(trim(coalesce(r."regNumber", ''))) = lower(trim('1708-19'))`));
    assert.ok(q.includes(`WHERE lower(trim(coalesce(regg."regNumber", ''))) = lower(trim('1708-19'))`));
    assert.doesNotMatch(q, /regNumber"\s+I?LIKE/, "no substring match on regNumber");
  });

  test("regNumberStatus=true excludes the exact match", async () => {
    const q = await queryFor({ regNumber: "1708-19", regNumberStatus: true });
    assert.ok(q.includes(`WHERE NOT (lower(trim(coalesce(r."regNumber", ''))) = lower(trim('1708-19')))`));
    assert.ok(q.includes(`WHERE NOT (lower(trim(coalesce(regg."regNumber", ''))) = lower(trim('1708-19')))`));
  });

  test("regNumber quotes are escaped; whitespace-only regNumber adds no filter", async () => {
    let q = await queryFor({ regNumber: "17'08" });
    assert.ok(q.includes(`lower(trim(coalesce(r."regNumber", ''))) = lower(trim('17''08'))`));
    prisma.reset();
    prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows());
    q = await queryFor({ regNumber: "   " });
    assert.doesNotMatch(q, /WHERE/);
  });

  test("other code fields (form_reg) are substring ILIKE, unlike regNumber", async () => {
    const q = await queryFor({ form_reg: "Ф-4", form_regStatus: false });
    assert.ok(q.includes(`WHERE r."form_reg" ILIKE '%Ф-4%'`));
    assert.ok(q.includes(`WHERE regg."form_reg" ILIKE '%Ф-4%'`));
  });

  test("name filters: lower(trim()) LIKE on the person's own table, * becomes %, AND-joined", async () => {
    const q = await queryFor({ lastName: " Каримов ", firstName: "Ш*д", fatherName: "Алишерович" });
    const reg =
      `WHERE lower(trim(coalesce(r."firstName", ''))) LIKE '%' || lower(trim('Ш%д')) || '%'` +
      ` AND lower(trim(coalesce(r."lastName", ''))) LIKE '%' || lower(trim('Каримов')) || '%'` +
      ` AND lower(trim(coalesce(r."fatherName", ''))) LIKE '%' || lower(trim('Алишерович')) || '%'`;
    assert.ok(q.includes(reg), q);
    assert.ok(q.includes(reg.replace(/r\./g, "rel.")));
  });

  test("name filter with Status=true is negated", async () => {
    const q = await queryFor({ lastName: "Каримов", lastNameStatus: true });
    assert.ok(q.includes(`WHERE NOT (lower(trim(coalesce(r."lastName", ''))) LIKE '%' || lower(trim('Каримов')) || '%')`));
    assert.ok(q.includes(`WHERE NOT (lower(trim(coalesce(rel."lastName", ''))) LIKE '%' || lower(trim('Каримов')) || '%')`));
  });

  test("register date range: BETWEEN / >= / <= / excluded, always on the registration row", async () => {
    const variants = [
      [{ register_date_start: "2019-01-01", register_date_end: "2019-12-31" }, (a) => `${a}."regDate" BETWEEN '2019-01-01' AND '2019-12-31'`],
      [{ register_date_start: "2019-01-01" }, (a) => `${a}."regDate" >= '2019-01-01'`],
      [{ register_date_end: "2019-12-31" }, (a) => `${a}."regDate" <= '2019-12-31'`],
      [{ register_date_start: "2019-01-01", register_date_startStatus: true }, (a) => `${a}."regDate" < '2019-01-01'`],
      [{ register_date_end: "2019-12-31", register_date_startStatus: true }, (a) => `${a}."regDate" > '2019-12-31'`],
      [
        { register_date_start: "2019-01-01", register_date_end: "2019-12-31", register_date_startStatus: true },
        (a) => `(${a}."regDate" < '2019-01-01' OR ${a}."regDate" > '2019-12-31')`,
      ],
    ];
    for (const [body, frag] of variants) {
      prisma.reset();
      prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows());
      const q = await queryFor(body);
      assert.ok(q.includes(`WHERE ${frag("r")}`), `${JSON.stringify(body)}\n${q}`);
      assert.ok(q.includes(`WHERE ${frag("regg")}`));
    }
  });

  test("register end date range filters regEndDate", async () => {
    const q = await queryFor({ register_end_date_start: "2020-01-01", register_end_date_end: "2020-06-30" });
    assert.ok(q.includes(`WHERE r."regEndDate" BETWEEN '2020-01-01' AND '2020-06-30'`));
    assert.ok(q.includes(`WHERE regg."regEndDate" BETWEEN '2020-01-01' AND '2020-06-30'`));
  });

  test("birth date range falls back to birthYear; Status=true negates it", async () => {
    let q = await queryFor({ birth_date_start: "1980-01-01", birth_date_end: "1989-12-31" });
    assert.ok(
      q.includes(
        `WHERE ((r."birthDate" IS NOT NULL AND r."birthDate" BETWEEN '1980-01-01' AND '1989-12-31') OR (r."birthYear" IS NOT NULL AND r."birthYear" BETWEEN 1980 AND 1989))`
      )
    );
    assert.ok(q.includes(`(rel."birthYear" IS NOT NULL AND rel."birthYear" BETWEEN 1980 AND 1989)`));
    prisma.reset();
    prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows());
    q = await queryFor({ birth_date_start: "1980-01-01", birth_dateStatus: true });
    assert.ok(q.includes(`WHERE NOT ((r."birthDate" IS NOT NULL AND r."birthDate" >= '1980-01-01'))`));
  });

  test("sorting: sortField/sortOrder, sortFields[], unknown fields fall back to the default", async () => {
    const variants = [
      [{ sortField: "full_name", sortOrder: "desc" }, "ORDER BY LOWER(full_name) DESC NULLS FIRST"],
      [{ sortField: "reg_date" }, "ORDER BY reg_date ASC NULLS LAST"],
      [
        { sortFields: [{ field: "reg_number", order: "ASC" }, { field: "birth_date", order: "DESC" }, { field: "bogus" }] },
        "ORDER BY LOWER(reg_number) ASC NULLS LAST, COALESCE(birth_date, CASE WHEN birth_year BETWEEN 1 AND 9999 THEN make_timestamp(birth_year, 12, 31, 23, 59, 59) END) DESC NULLS LAST",
      ],
      [{ sortField: "id; DROP TABLE x" }, "ORDER BY model_name, createdAt DESC"],
      [{ sortFields: [] , sortField: "pinfl", sortOrder: "sideways" }, "ORDER BY LOWER(pinfl) ASC NULLS LAST"],
    ];
    for (const [body, orderBy] of variants) {
      prisma.reset();
      prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows());
      const q = await queryFor(body);
      assert.ok(squash(q).includes(`) combined_results ${orderBy} ;`), `${JSON.stringify(body)}\n${squash(q).slice(-300)}`);
    }
  });

  test("the sheet's columns never depend on the filter", async () => {
    for (const body of [{}, { regNumber: "1708-19", regNumberStatus: true }, { lastName: "Каримов", register_date_start: "2019-01-01" }]) {
      prisma.reset();
      prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows().slice(0, 1));
      const { s } = await exportBook(body);
      assert.deepEqual(s.rows[4].values, HEADERS);
      assert.equal(s.columnCount, 22);
    }
  });
});

// ------------------------------------------------------- G. the "Поиск" sheet
describe('sheet "Поиск" layout', () => {
  let s;
  let book;
  before(async () => {
    prisma.reset();
    prisma.when("admin.findUnique", S.EXECUTOR).when("$queryRawUnsafe", S.exportRows());
    ({ s, book } = await exportBook());
  });

  test("one visible sheet, no images, no autofilter, no header/footer", () => {
    assert.deepEqual(book.sheetNames, ["Поиск"]); // :3309
    assert.equal(s.state, "visible");
    assert.deepEqual(s.images, []);
    assert.deepEqual(book.media, []);
    assert.equal(s.autoFilter, undefined);
    assert.equal(s.headerFooter, null);
  });

  test("page setup: ExcelJS defaults (the code sets none)", () => {
    // NOTE: no pageSetup in registerController.js — 22 columns of width >= 29 print on
    // default portrait paper without fit-to-page.
    assert.deepEqual(s.pageSetup.margins, { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 });
    assert.equal(s.pageSetup.orientation, "portrait");
    assert.equal(s.pageSetup.paperSize, undefined);
    assert.equal(s.pageSetup.fitToPage, false);
    assert.equal(s.pageSetup.fitToWidth, 1);
    assert.equal(s.pageSetup.fitToHeight, 1);
    assert.equal(s.pageSetup.scale, 100);
    assert.equal(s.pageSetup.printArea, undefined);
    assert.equal(s.pageSetup.printTitlesRow, undefined);
  });

  test("frozen panes below the 4 header rows", () => {
    // :3310 views: [{ state: "frozen", ySplit: 4 }]
    assert.equal(s.views.length, 1);
    assert.equal(s.views[0].state, "frozen");
    assert.equal(s.views[0].ySplit, 4);
    assert.equal(s.views[0].xSplit, 0);
    assert.equal(s.views[0].topLeftCell, "A5");
  });

  test("merges: only the title A1:V1", () => {
    assert.deepEqual(s.merges, ["A1:V1"]); // :3313
  });

  test("column widths from autoFitWorksheetColumns(ws, 12): max(len+2), capped at 40", () => {
    // registerController.js:196-213. NOTE: the merged title (27 chars) is read back
    // through every merged slave B1..V1, so every column is at least 27+2 = 29 and
    // the minimum of 12 never applies.
    const expected = COLS.map(() => 29);
    expected[COLS.indexOf("R")] = 40; // notes: 61 chars + 2 -> capped at 40
    expected[COLS.indexOf("S")] = 30; // "г. Ташкент, Юнусабадский р-н" = 28 + 2
    assert.deepEqual(
      s.columns.map((c) => c.width),
      expected
    );
    assert.equal(s.columns.length, 22);
    assert.ok(s.columns.every((c) => !c.hidden));
  });

  test("row heights: none set (default 15)", () => {
    assert.equal(s.properties.defaultRowHeight, 15);
    for (let n = 1; n <= 8; n += 1) assert.equal(s.rows[n].height, undefined, `row ${n}`);
  });

  test("row 1: title merged across A1:V1, bold 14, bordered on every merged cell", () => {
    for (const col of COLS) {
      const c = s.cell(`${col}1`);
      assert.equal(c.value, TITLE, col);
      assert.deepEqual(c.font, { bold: true, size: 14 }, col); // :3393
      assert.deepEqual(c.alignment, { vertical: "middle", wrapText: true }, col); // :3405-3411
      assert.deepEqual(c.border, THIN, col);
      assert.deepEqual(c.fill, NO_FILL, col);
      assert.equal(c.numFmt, undefined, col);
      assert.equal(c.isMerged, true, col);
      assert.equal(c.master, "A1", col);
    }
  });

  test("rows 2-3: executor and Tashkent timestamp in A/B, bold, bordered", () => {
    const expect = {
      A2: "Исполнитель:", // :3315
      B2: "Admin Super", // :3316 last first father
      A3: "Дата выгрузки:", // :3317
      B3: "2026-01-15 14-00-00", // :3318 NOTE: only "_" is replaced, so the time keeps "-" (14-00-00)
    };
    for (const [addr, value] of Object.entries(expect)) {
      const c = s.cell(addr);
      assert.equal(c.value, value, addr);
      assert.equal(c.type, 3, `${addr} is a string`);
      assert.deepEqual(c.font, { bold: true }, addr); // :3394-3395
      assert.deepEqual(c.alignment, { vertical: "middle", wrapText: true }, addr);
      assert.deepEqual(c.border, THIN, addr);
      assert.deepEqual(c.fill, NO_FILL, addr);
      assert.equal(c.numFmt, undefined, addr);
      assert.equal(c.isMerged, false, addr);
    }
    for (const addr of ["C2", "V2", "C3", "V3"]) {
      const c = s.cell(addr);
      assert.equal(c.value, null, addr);
      assert.deepEqual(c.border, {}, `${addr} has no border`);
    }
  });

  test("row 4: the 22 headers, bold, centered/middle/wrap, thin borders", () => {
    assert.deepEqual(s.rows[4].values, HEADERS);
    COLS.forEach((col, i) => {
      const c = s.cell(`${col}4`);
      assert.equal(c.value, HEADERS[i], col);
      assert.deepEqual(c.font, { bold: true }, col); // :3396
      assert.deepEqual(c.alignment, { horizontal: "center", vertical: "middle", wrapText: true }, col); // :3397-3401, 3408-3410
      assert.deepEqual(c.border, THIN, col);
      assert.deepEqual(c.fill, NO_FILL, col);
      assert.equal(c.numFmt, undefined, col);
    });
  });

  test("data rows 5..8: values from the fixtures, one row per registration/relative", () => {
    assert.equal(s.rowCount, 4 + EXPECTED_ROWS.length);
    assert.equal(s.actualRowCount, 8);
    EXPECTED_ROWS.forEach((vals, i) => assert.deepEqual(s.rows[5 + i].values, vals, `row ${5 + i}`));
    assert.equal(s.cell("A9").value, null);
  });

  test("data cells: default Calibri 11, middle/wrap (no horizontal), thin borders, no fill", () => {
    for (let n = 5; n <= 8; n += 1) {
      const cells = s.row(n);
      assert.equal(cells.length, 22, `row ${n}`);
      for (const c of cells) {
        assert.deepEqual(c.font, DEFAULT_FONT, c.address);
        assert.deepEqual(c.alignment, { vertical: "middle", wrapText: true }, c.address);
        assert.deepEqual(c.border, THIN, c.address);
        assert.deepEqual(c.fill, NO_FILL, c.address);
      }
    }
  });

  test("number/date formats: no numFmt anywhere; № is numeric, dates are text", () => {
    for (let n = 1; n <= 8; n += 1) for (const c of s.row(n)) assert.equal(c.numFmt, undefined, c.address);
    for (let n = 5; n <= 8; n += 1) {
      assert.equal(s.cell(`A${n}`).type, 2, `A${n} number`);
      assert.equal(s.cell(`A${n}`).value, n - 4);
    }
    // NOTE: dates are pre-formatted strings (ru-RU, Asia/Tashkent), not Excel dates.
    for (const addr of ["G5", "H5", "I5", "L5", "V5"]) assert.equal(s.cell(addr).type, 3, addr);
    assert.match(s.cell("H5").value, /^\d{2}\.\d{2}\.\d{4}$/);
    assert.match(s.cell("V5").value, /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/);
    // NOTE: birth_year fallback is a raw number cell.
    assert.equal(s.cell("G6").type, 2);
    assert.equal(s.cell("G6").value, 1958);
  });
});

describe("row count follows the data", () => {
  for (const n of [1, 13]) {
    test(`${n} row(s) -> ${4 + n} sheet rows`, async () => {
      const base = S.exportRows()[1];
      prisma.when(
        "$queryRawUnsafe",
        Array.from({ length: n }, (_, i) => ({ ...base, full_name: `Каримов Родственник ${i + 1}`, relationdegree: "Брат" }))
      );
      const { s } = await exportBook();
      assert.equal(s.rowCount, 4 + n);
      for (let i = 0; i < n; i += 1) {
        assert.equal(s.cell(`A${5 + i}`).value, i + 1);
        assert.equal(s.cell(`F${5 + i}`).value, `Каримов Родственник ${i + 1}`);
        assert.deepEqual(s.cell(`V${5 + i}`).border, THIN);
      }
      assert.equal(s.cell(`A${5 + n}`).value, null);
      assert.equal(s.views[0].ySplit, 4);
      assert.deepEqual(s.merges, ["A1:V1"]);
    });
  }

  test("short data only: every column width is the title-driven 29", async () => {
    prisma.when("$queryRawUnsafe", [{ reg_number: "1-1", full_name: "Ли Ен", complete_status: "WAITING" }]);
    const { s } = await exportBook();
    assert.deepEqual(
      s.columns.map((c) => c.width),
      COLS.map(() => 29)
    );
    assert.deepEqual(s.rows[5].values, [1, "1-1", "", "", "", "Ли Ен", "", "", "", "ОЖИДАНИЕ", "", "", "", "", "", "", "", "", "", "", "", ""]);
  });
});
