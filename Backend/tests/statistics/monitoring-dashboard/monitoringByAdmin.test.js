// Characterization tests for POST /statistics/monitoringByAdmin
// (statisticsController.js:2777 monitoringByAdmin -> reportMonitoringByAdmin at :5885).
// "Мониторинг работы операторов": one landscape section, a 15-column table with
// one row per executor that has registrations in the year, plus a "ВСЕГО:" row.
const S = require("./_support"); // sets TZ first
const { test, describe, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { inspectDocx } = require("../../helpers/docxInspector");

const { prisma, ctrl, SERVER_URL } = S.loadController();
const LINK_RE = S.linkRe(SERVER_URL, "docx");

// --- fixtures -------------------------------------------------------------
const ADMINS = {
  "adm-1": { id: "adm-1", last_name: "Каримов", first_name: "Алишер", father_name: "Бахтиёрович", status: "active" },
  "adm-2": { id: "adm-2", last_name: "Юсупова", first_name: "Дилноза", father_name: null, status: "active" },
  "adm-3": { id: "adm-3", last_name: "Рахимов", first_name: "Тимур", father_name: "Олимович", status: "active" }, // no work this year
  // "adm-ghost" is returned by admin.findMany but admin.findUnique finds nothing
};
// month (1..12) -> count; `total` answers the whole-year all_count query
const COUNTS = {
  "adm-1": { total: 10, 1: 2, 3: 1, 12: 4 }, // months sum to 7; "Всего" comes from its own query
  "adm-2": { total: 8, 2: 5, 3: 3 },
  "adm-3": { total: 0 },
};

function countHandler(args) {
  const id = args.where.executor.is.id;
  const gte = new Date(args.where.regDate.gte);
  const lte = new Date(args.where.regDate.lte);
  const c = COUNTS[id] || {};
  if (gte.getMonth() === 0 && lte.getMonth() === 11) return c.total ?? 0; // whole-year query
  return c[gte.getMonth() + 1] ?? 0;
}

function configure() {
  prisma.reset();
  prisma.when("form.findUnique", (a) => (["Р", "О", "У"].includes(a.where.name) ? { id: `form-${a.where.name}`, name: a.where.name, status: true } : null));
  prisma.when("admin.findMany", [{ id: "adm-1" }, { id: "adm-2" }, { id: "adm-3" }, { id: "adm-ghost" }]);
  prisma.when("admin.findUnique", (a) => ADMINS[a.where.id] || null);
  prisma.when("registration.count", countHandler);
  prisma.when("raport.create", (a) => ({ id: "raport-mon-1", ...a.data }));
}

const BODY = { years: "2024", forms: ["Р", "О"], executors: ["all"] };

// Header row texts and pct widths, reportMonitoringByAdmin :5955-:6360
const HEADER = [
  ["№", 5],
  ["Исполнитель", 17],
  ["Всего", 6],
  ["Январь", 6],
  ["Февраль", 6],
  ["Март", 6],
  ["Апрель", 6],
  ["Май", 6],
  ["Июнь", 6],
  ["Июль", 6],
  ["Август", 6],
  ["Сентябрь", 6],
  ["Октябрь", 6],
  ["Ноябрь", 6],
  ["Декабрь", 6],
];
const WIDTHS = HEADER.map((h) => h[1]);
const asCells = (texts) => texts.map((text, i) => ({ text: String(text), widthPct: WIDTHS[i] }));

let cap;
before(() => {
  mock.timers.enable({ apis: ["Date"], now: S.FROZEN_NOW });
  cap = S.captureGeneratedFiles();
});
after(() => {
  cap.restore();
  mock.timers.reset();
});
const fresh = () => beforeEach(() => {
  configure();
  cap.clear();
});

describe("monitoringByAdmin — success (executors: ['all'], forms Р,О, year 2024)", () => {
  let res;
  let doc;
  before(async () => {
    configure();
    cap.clear();
    ({ result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY, userId: "admin-sa" })));
    doc = inspectDocx(cap.last().buffer);
  });

  test("A. responds 200 JSON with a LINK to uploads/<uuid>.docx", () => {
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body), ["code", "message", "link"]);
    assert.equal(res.body.code, 200);
    assert.equal(res.body.message, "Document generated and saved successfully");
    assert.match(res.body.link, LINK_RE);
    assert.equal(res.downloaded, null);
    assert.equal(res.sentFile, null);
  });

  test("A. writes exactly one .docx into Backend/uploads named like the link", () => {
    // captured by fs.writeFileSync(filePath, buffer) :3133
    assert.equal(cap.files.length, 1);
    const f = cap.files[0];
    assert.equal(f.ext, ".docx");
    assert.equal(f.buffer.slice(0, 4).toString("hex"), "504b0304");
    const uuid = res.body.link.match(LINK_RE)[1];
    assert.equal(f.path, require("path").join(S.UPLOADS_DIR, `${uuid}.docx`));
  });

  test("A. DB: one raport row (name/notes/executor/link) and NO raportLink", () => {
    const calls = prisma.calls("raport.create");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      data: {
        name: "Мониторинг по формам спецпроверок (за выбранный период времениу):", // :3100
        executorId: "admin-sa", // req.userId
        link: res.body.link,
        notes: "test",
      },
    });
    assert.equal(prisma.calls("raportLink.create").length, 0); // monitoringByAdmin never links
    assert.equal(prisma.calls("registration.update").length, 0); // the update block is commented out
  });

  test("A. DB reads: forms validated, active admins listed, 13 counts per found executor", () => {
    assert.deepEqual(prisma.calls("form.findUnique"), [{ where: { name: "Р" } }, { where: { name: "О" } }]);
    assert.deepEqual(prisma.calls("admin.findMany"), [{ where: { status: "active" }, select: { id: true } }]);
    assert.deepEqual(
      prisma.calls("admin.findUnique").map((a) => a.where.id),
      ["adm-1", "adm-2", "adm-3", "adm-ghost"]
    );
    // adm-ghost is skipped (continue) before any count; the other three get 1 yearly + 12 monthly counts
    const counts = prisma.calls("registration.count");
    assert.equal(counts.length, 3 * 13);
    assert.deepEqual([...new Set(counts.map((c) => c.where.executor.is.id))], ["adm-1", "adm-2", "adm-3"]);
  });

  test("A. count query shapes: whole-year window (local Tashkent midnight) and monthly windows", () => {
    const counts = prisma.calls("registration.count").filter((c) => c.where.executor.is.id === "adm-1");
    // all_count :2850 — new Date(`2024-01-01`).setHours(0,0,0,0) .. new Date(`2024-12-31`).setHours(23,59,59,999)
    assert.deepEqual(counts[0], {
      where: {
        form_reg: { in: ["Р", "О"] },
        regDate: { gte: "2023-12-31T19:00:00.000Z", lte: "2024-12-31T18:59:59.999Z" },
        executor: { is: { id: "adm-1" } },
      },
      orderBy: { createdAt: "desc" },
    });
    // january :2864 (also has orderBy)
    assert.deepEqual(counts[1], {
      where: {
        form_reg: { in: ["Р", "О"] },
        regDate: { gte: "2023-12-31T19:00:00.000Z", lte: "2024-01-31T18:59:59.999Z" },
        executor: { is: { id: "adm-1" } },
      },
      orderBy: { createdAt: "desc" },
    });
    // february :2881 — leap year, ends 29th
    assert.deepEqual(counts[2].where.regDate, { gte: "2024-01-31T19:00:00.000Z", lte: "2024-02-29T18:59:59.999Z" });
    assert.deepEqual(counts[2].orderBy, { createdAt: "desc" });
    // march..december :2898+ have no orderBy
    assert.deepEqual(counts[3], {
      where: {
        form_reg: { in: ["Р", "О"] },
        regDate: { gte: "2024-02-29T19:00:00.000Z", lte: "2024-03-31T18:59:59.999Z" },
        executor: { is: { id: "adm-1" } },
      },
    });
    assert.deepEqual(counts[12].where.regDate, { gte: "2024-11-30T19:00:00.000Z", lte: "2024-12-31T18:59:59.999Z" });
    for (let i = 3; i <= 12; i++) assert.equal(counts[i].orderBy, undefined);
  });

  test("B. exactly one landscape A4 section with 2cm/1.5cm/2cm/2.5cm margins", () => {
    assert.equal(doc.sections.length, 1);
    const sec = doc.sections[0];
    // size: { orientation: PageOrientation.LANDSCAPE } :5911 -> docx swaps A4 to 16838 x 11906
    assert.deepEqual(sec.page, { width: 16838, height: 11906, orientation: "landscape" });
    // :5906 top (1440*2)/2.54=1133.86, right (1440*1.5)/2.54=850.39, bottom 1133.86, left (1440*2.5)/2.54=1417.32 (truncated)
    assert.deepEqual(sec.margins, { top: 1133, right: 850, bottom: 1133, left: 1417, header: 708, footer: 708, gutter: 0 });
    assert.deepEqual(sec.headerRefs, []);
    assert.deepEqual(sec.footerRefs, []);
    assert.deepEqual(sec.headers, {});
    assert.deepEqual(sec.footers, {});
    assert.equal(sec.type, undefined);
    assert.equal(sec.columns === undefined || sec.columns.count === undefined, true);
  });

  test("B. no page breaks", () => {
    assert.equal(doc.pageBreakCount, 0);
    assert.equal(doc.allParagraphs.some((p) => p.hasPageBreak || p.pageBreakBefore), false);
  });

  test("C. style defaults are the docx library's (no custom styles from the code)", () => {
    assert.deepEqual(doc.styles.defaults, { run: {}, paragraph: {} });
    assert.equal(doc.settings.evenAndOddHeaders, false);
  });

  test("D. body block order: title, separator, table, white hairline, black line, date footer", () => {
    assert.deepEqual(
      doc.blocks.map((b) => b.type),
      ["paragraph", "paragraph", "table", "paragraph", "paragraph", "paragraph"]
    );
    assert.equal(doc.paragraphs.length, 5);
    assert.equal(doc.tables.length, 1);
  });

  test("D. title paragraph: forms + year, centered, 16pt bold", () => {
    // :3082 — note the missing space before "за" and the parentheses inside «»
    S.assertTitle(doc.paragraphs[0], "Мониторинг работы операторов, по формам «(Р, О)»за 2024 год");
  });

  test("D. separator, hairline, black line and date footer", () => {
    S.assertSeparator(doc.paragraphs[1]);
    S.assertWhiteHairline(doc.paragraphs[2]);
    S.assertBlackLine(doc.paragraphs[3]);
    S.assertDateFooter(doc.paragraphs[4]);
  });

  test("D. no explicit fonts anywhere; only sizes 1/12/22/24/32 half-points", () => {
    assert.deepEqual(doc.fontsUsed(), [undefined]);
    assert.deepEqual(doc.sizesUsed(), [1, 12, 22, 24, 32]);
  });

  test("E. table shell: 5000% pct width, centered, default single borders, 15-col grid", () => {
    S.assertTableShell(doc.tables[0], 15);
  });

  test("E. header row: 15 cells with exact titles and pct widths", () => {
    S.assertRow(doc.tables[0].rows[0], HEADER.map(([text, widthPct]) => ({ text, widthPct })));
  });

  test("E. data rows: one per executor with work (adm-3 has 0, ghost not found), then ВСЕГО", () => {
    const rows = doc.tables[0].rows;
    assert.equal(rows.length, 1 + 2 + 1);
    // `${index+1}`, name "last first father", all_count, Jan..Dec
    S.assertRow(rows[1], asCells([1, "Каримов Алишер Бахтиёрович", 10, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 4]));
    // father_name null -> "" -> trailing space kept in the name
    S.assertRow(rows[2], asCells([2, "Юсупова Дилноза ", 8, 0, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    // totals row :3043 — numbered like a data row
    S.assertRow(rows[3], asCells([3, "ВСЕГО:", 18, 2, 5, 4, 0, 0, 0, 0, 0, 0, 0, 0, 4]));
  });

  test("E. 'Всего' is the separate whole-year count, not the sum of the months", () => {
    const r = doc.tables[0].rows[1].cells.map((c) => Number(c.text));
    const monthsSum = r.slice(3).reduce((a, b) => a + b, 0);
    assert.equal(monthsSum, 7);
    assert.equal(r[2], 10); // NOTE: all_count and the 12 monthly counts are independent queries
  });
});

describe("monitoringByAdmin — variants", () => {
  fresh();
  test("F. explicit executor list: no admin.findMany, unknown ids skipped, one data row", async () => {
    const { result: res } = await S.quiet(() =>
      S.invoke(ctrl.monitoringByAdmin, { body: { years: "2024", forms: ["У"], executors: ["nobody", "adm-2"] } })
    );
    assert.equal(res.statusCode, 200);
    assert.match(res.body.link, LINK_RE);
    assert.equal(prisma.calls("admin.findMany").length, 0);
    assert.deepEqual(prisma.calls("admin.findUnique").map((a) => a.where.id), ["nobody", "adm-2"]);
    assert.deepEqual(prisma.calls("registration.count")[0].where.form_reg, { in: ["У"] });
    const doc = inspectDocx(cap.last().buffer);
    S.assertTitle(doc.paragraphs[0], "Мониторинг работы операторов, по формам «(У)»за 2024 год");
    const rows = doc.tables[0].rows;
    assert.equal(rows.length, 3);
    S.assertRow(rows[1], asCells([1, "Юсупова Дилноза ", 8, 0, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    S.assertRow(rows[2], asCells([2, "ВСЕГО:", 8, 0, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    // layout identical to the 'all' variant
    assert.equal(doc.sections.length, 1);
    assert.deepEqual(doc.sections[0].page, { width: 16838, height: 11906, orientation: "landscape" });
    assert.deepEqual(doc.sections[0].margins, { top: 1133, right: 850, bottom: 1133, left: 1417, header: 708, footer: 708, gutter: 0 });
    S.assertTableShell(doc.tables[0], 15);
    S.assertDateFooter(doc.paragraphs[4]);
  });

  test("F. numeric `years` is accepted (parseInt) and gives the same windows", async () => {
    const { result: res } = await S.quiet(() =>
      S.invoke(ctrl.monitoringByAdmin, { body: { years: 2025, forms: ["Р"], executors: ["adm-1"] } })
    );
    assert.equal(res.statusCode, 200);
    const first = prisma.calls("registration.count")[0];
    assert.deepEqual(first.where.regDate, { gte: "2024-12-31T19:00:00.000Z", lte: "2025-12-31T18:59:59.999Z" });
    const doc = inspectDocx(cap.last().buffer);
    S.assertTitle(doc.paragraphs[0], "Мониторинг работы операторов, по формам «(Р)»за 2025 год");
    assert.equal(doc.tables[0].rows.length, 3);
  });

  test("F. many executors: row count follows the input (5 workers -> 5 rows + ВСЕГО)", async () => {
    const ids = ["w1", "w2", "w3", "w4", "w5"];
    prisma.when("admin.findMany", ids.map((id) => ({ id })));
    prisma.when("admin.findUnique", (a) => ({ id: a.where.id, last_name: `Оператор-${a.where.id}`, first_name: "Имя", father_name: "Отчество" }));
    prisma.when("registration.count", () => 1);
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
    assert.equal(res.statusCode, 200);
    const rows = inspectDocx(cap.last().buffer).tables[0].rows;
    assert.equal(rows.length, 1 + 5 + 1);
    ids.forEach((id, i) => S.assertRow(rows[i + 1], asCells([i + 1, `Оператор-${id} Имя Отчество`, ...Array(13).fill(1)])));
    S.assertRow(rows[6], asCells([6, "ВСЕГО:", ...Array(13).fill(5)]));
  });
});

describe("monitoringByAdmin — validation and error paths", () => {
  fresh();
  const noSideEffects = () => {
    assert.equal(prisma.calls("raport.create").length, 0);
    assert.equal(prisma.calls("raportLink.create").length, 0);
    assert.equal(cap.files.length, 0);
  };

  test("400 when years is an empty string", async () => {
    const res = await S.invoke(ctrl.monitoringByAdmin, { body: { ...BODY, years: "" } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { code: 400, message: "Years and forms are required" });
    noSideEffects();
  });

  test("400 when forms is an empty array", async () => {
    const res = await S.invoke(ctrl.monitoringByAdmin, { body: { ...BODY, forms: [] } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { code: 400, message: "Years and forms are required" });
    noSideEffects();
  });

  test("500 (not 400) when years is missing — `years.length` runs before `!years`", async () => {
    // NOTE: the `!years || !forms` guards come after `.length`, so a missing field is a TypeError
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: { forms: ["Р"], executors: ["all"] } }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      code: 500,
      message: "Internal server error",
      error: "Cannot read properties of undefined (reading 'length')",
    });
    noSideEffects();
  });

  test("500 'Invalid form' when a form name is unknown", async () => {
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: { ...BODY, forms: ["Р", "Ж"] } }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "Invalid form" });
    noSideEffects();
  });

  test("500 when executors is missing (executors.includes on undefined)", async () => {
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: { years: "2024", forms: ["Р"] } }));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Internal server error");
    assert.equal(res.body.error, "Cannot read properties of undefined (reading 'includes')");
    noSideEffects();
  });

  test("404 when no executor has any registration in the year", async () => {
    prisma.when("registration.count", 0);
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found for the specified criteria" });
    noSideEffects();
  });

  test("404 when no active admins exist", async () => {
    prisma.when("admin.findMany", []);
    const res = await S.invoke(ctrl.monitoringByAdmin, { body: BODY });
    assert.equal(res.statusCode, 404);
    assert.equal(prisma.calls("registration.count").length, 0);
    noSideEffects();
  });

  test("a prisma throw inside the per-executor loop is swallowed and yields 404", async () => {
    // NOTE: the inner try/catch only console.logs, so a DB outage looks like "no data"
    prisma.when("registration.count", () => {
      throw new Error("db down");
    });
    const { result: res, logged } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, "No data found for the specified criteria");
    assert.ok(logged.some((a) => a[0] instanceof Error && a[0].message === "db down"));
    noSideEffects();
  });

  test("500 when prisma throws outside the loop (form lookup)", async () => {
    prisma.when("form.findUnique", () => {
      throw new Error("connection refused");
    });
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "connection refused" });
    noSideEffects();
  });

  test("500 when raport.create throws: the file is not written (create runs before writeFileSync)", async () => {
    prisma.when("raport.create", () => {
      throw new Error("insert failed");
    });
    const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "insert failed" });
    assert.equal(cap.files.length, 0);
  });

  test("the raport row is written before the file (row exists even if the write fails)", async () => {
    const order = [];
    prisma.when("raport.create", (a) => {
      order.push("raport.create");
      return { id: "r", ...a.data };
    });
    const origWrite = fs.writeFileSync;
    fs.writeFileSync = function (p, ...rest) {
      if (String(p).endsWith(".docx")) {
        order.push("writeFileSync");
        throw new Error("disk full");
      }
      return origWrite.call(this, p, ...rest);
    };
    try {
      const { result: res } = await S.quiet(() => S.invoke(ctrl.monitoringByAdmin, { body: BODY }));
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.error, "disk full");
    } finally {
      fs.writeFileSync = origWrite;
    }
    // NOTE: a raport row pointing at a missing file is left behind
    assert.deepEqual(order, ["raport.create", "writeFileSync"]);
  });
});
