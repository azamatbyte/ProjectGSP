// POST /statistics/reportStatements -> statisticsController.reportStatements
// ("отчет по ведомствам"), document built by reportStatementsFunction
// (statisticsController.js:3427). Characterization tests: they lock in
// today's output, quirks included (see // NOTE: comments).
const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const S = require("./_support");

const { prisma, cap, ctrl, SERVER_URL } = S.setup();

// ---------------------------------------------------------------- fixtures
// registration.findMany(distinct workplace) for workplaces:["all"]; DB order
// is deliberately not alphabetical — the controller re-sorts with Intl.Collator.
const ALL_WORKPLACES = ["Равон", "Веймар", "АО Узавто", "Пустое предприятие"];
const FORMS_REG = [{ name: "Р" }, { name: "О" }]; // form.type = registration, status true
const FORMS_REG4 = [{ name: "У" }]; // form.type = registration4
const COUNTS = {
  Равон: { open: 12, close: 9, km: 2, access: 6, eliminete: 3, otk1: 1 },
  Веймар: { open: 7, close: 5, km: 0, access: 4, eliminete: 1, otk1: 0 },
  "АО Узавто": { open: 3, close: 2, km: 1, access: 2, eliminete: 0, otk1: 0 },
  // "Пустое предприятие" -> every count 0 -> row dropped (sum > 0 check, :1225)
  "forms:У": { open: 4, close: 3, km: 0, access: 2, eliminete: 1, otk1: 1 }, // "Иные ..." row (:1280-1367)
};
const BODY_ALL = { workplaces: ["all"], startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-12-31T23:59:59.999Z" };
const USER = "354dca94-9cd3-4c69-8288-c7cdab2d18f2";
const RAPORT_ID = "8464843d-44f1-49c5-97c4-f27ca2bfcc8a";

function configure({ workplaces = ALL_WORKPLACES, counts = COUNTS, throwFor } = {}) {
  prisma.reset();
  cap.clear();
  prisma.when("registration.findMany", workplaces.map((w) => ({ workplace: w })));
  prisma.when("form.findMany", (a) => (a.where.type.equals === "registration4" ? FORMS_REG4 : FORMS_REG));
  prisma.when("registration.count", S.countHandler(counts, { throwFor }));
  prisma.when("raport.create", (a) => ({ id: RAPORT_ID, ...a.data }));
}

before(() => S.freezeTime());
after(() => {
  S.unfreezeTime();
  cap.restore();
});

// ---------------------------------------------------------------- expected shapes
const SHADE = (fill) => ({ fill, val: undefined, color: undefined });
// Header row 1 cell (rowSpan 2): bold 11pt, centered, spacing 100/100, f0f0f0 (:3491-3514)
const hdr = (text, w, { rowSpan = true, gridSpan = 1, spacing = { before: 100, after: 100 } } = {}) =>
  S.cell({
    width: S.pct(w),
    gridSpan,
    vMerge: rowSpan ? "restart" : undefined,
    verticalAlign: "center",
    shading: SHADE("f0f0f0"),
    paragraphs: [S.cellPara(text, 22, { alignment: "center", spacing }, { bold: true })],
  });
// Header row 2 sub-cells: bold 10pt, spacing 50/50, f8f8f8 (:3641-3686)
const sub = (text) =>
  S.cell({
    width: S.pct(10),
    verticalAlign: "center",
    shading: SHADE("f8f8f8"),
    paragraphs: [S.cellPara(text, 20, { alignment: "center", spacing: { before: 50, after: 50 } }, { bold: true })],
  });
// Data cell: 10pt, not bold, first column left / others centered, zebra ffffff/fafafa (:3693-3848)
const DATA_WIDTHS = [20, 15, 15, 15, 15, 10, 10];
const dataRow = (values, index) =>
  values.map((v, i) =>
    S.cell({
      width: S.pct(DATA_WIDTHS[i]),
      verticalAlign: "center",
      shading: SHADE(index % 2 === 0 ? "ffffff" : "fafafa"),
      paragraphs: [S.cellPara(String(v), 20, { alignment: i === 0 ? "left" : "center", spacing: { before: 100, after: 100 } })],
    })
  );
const vals = (label, c) => [label, c.open, c.close, c.km, c.access, c.eliminete, c.otk1];

// Expected data rows for BODY_ALL, in document order.
const SUM_WP = { open: 22, close: 16, km: 3, access: 12, eliminete: 4, otk1: 1 }; // Равон+Веймар+АО Узавто
const GRAND = { open: 26, close: 19, km: 3, access: 14, eliminete: 5, otk1: 2 }; // SUM_WP + Иные (ВСЕГО: excluded, :1393)
const ALL_ROWS = [
  vals("АО Узавто", COUNTS["АО Узавто"]),
  vals("Веймар", COUNTS["Веймар"]),
  vals("Равон", COUNTS["Равон"]),
  vals("ВСЕГО:", SUM_WP),
  vals("Иные объекты, ведомства, организации (СП Ф-У)", COUNTS["forms:У"]),
  vals("ВСЕГО (СП Ф-Р, О, У)", GRAND),
];

// ================================================================ A. response
describe("reportStatements — response contract and DB writes", () => {
  let res;
  before(async () => {
    configure();
    res = await S.call(ctrl.reportStatements, BODY_ALL, USER);
  });

  test("200 JSON with a download LINK (no file in the response)", () => {
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ["code", "link", "message"]);
    assert.equal(res.body.code, 200);
    assert.equal(res.body.message, "Document generated and saved successfully");
    assert.match(res.body.link, S.linkRegex(SERVER_URL)); // :1444 SERVER_URL + "/api/v1/download/" + uuid.docx
    assert.equal(res.downloaded, null);
    assert.equal(res.sentFile, null);
    assert.deepEqual(res.headers, {});
  });

  test("exactly one .docx is written to uploads/ under the linked name", () => {
    assert.equal(cap.files.length, 1);
    const f = cap.last();
    assert.equal(f.ext, ".docx");
    assert.equal(path.dirname(path.resolve(f.path)).toLowerCase(), S.UPLOADS.toLowerCase()); // :1417
    assert.equal(path.basename(f.path), res.body.link.split("/").pop());
    assert.equal(f.buffer.subarray(0, 4).toString("hex"), "504b0304");
  });

  test("raport row: name/notes/executor/link (:1422-1429)", () => {
    const calls = prisma.calls("raport.create");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      data: { name: "отчет по ведомствам", executorId: USER, link: res.body.link, notes: "test" },
    });
  });

  test("raportLink row: code 'test', delete true, display false (:1430-1437)", () => {
    const calls = prisma.calls("raportLink.create");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { data: { raportId: RAPORT_ID, code: "test", delete: true, display: false } });
  });

  test("no registration is updated", () => {
    assert.equal(prisma.calls("registration.update").length, 0);
    assert.equal(prisma.calls("registration.updateMany").length, 0);
  });

  test("workplaces:['all'] loads distinct workplaces ordered by name (:1117-1128)", () => {
    assert.deepEqual(prisma.calls("registration.findMany"), [
      { select: { workplace: true }, orderBy: { workplace: "asc" }, distinct: ["workplace"] },
    ]);
  });

  test("form lists: registration forms once per workplace, registration4 forms once (no status filter)", () => {
    const formCalls = prisma.calls("form.findMany");
    const reg = formCalls.filter((a) => a.where.type.equals === "registration");
    assert.equal(reg.length, ALL_WORKPLACES.length); // re-queried inside the loop (:1136)
    for (const a of reg) assert.deepEqual(a, { where: { type: { equals: "registration" }, status: { equals: true } }, select: { name: true } });
    const reg4 = formCalls.filter((a) => a.where.type.equals === "registration4");
    assert.deepEqual(reg4, [{ where: { type: { equals: "registration4" } }, select: { name: true } }]); // :1268-1276
  });

  test("6 counts per workplace + 6 for the 'Иные' row; dates passed through as the raw strings", () => {
    const counts = prisma.calls("registration.count");
    assert.equal(counts.length, 6 * ALL_WORKPLACES.length + 6);
    // open_count for one workplace (:1146-1155) — startDate/endDate are NOT converted to Date
    assert.deepEqual(counts[0], {
      where: {
        form_reg: { in: ["Р", "О"] },
        workplace: { equals: "Равон" },
        regDate: { gte: BODY_ALL.startDate, lte: BODY_ALL.endDate },
      },
      orderBy: { createdAt: "desc" },
    });
    // close_count (:1156-1165): regEndDate inside an OR with one branch, no orderBy
    assert.deepEqual(counts[1], {
      where: {
        form_reg: { in: ["Р", "О"] },
        workplace: { equals: "Равон" },
        OR: [{ regEndDate: { gte: BODY_ALL.startDate, lte: BODY_ALL.endDate } }],
      },
    });
    const metrics = counts.slice(0, 6).map((a) => S.metricOf(a.where));
    assert.deepEqual(metrics, ["open", "close", "km", "access", "eliminete", "otk1"]);
    // the 'Иные' counts have no workplace filter and use the registration4 forms
    const last6 = counts.slice(-6);
    for (const a of last6) {
      assert.deepEqual(a.where.form_reg, { in: ["У"] });
      assert.equal(a.where.workplace, undefined);
    }
  });
});

// ================================================================ A. validation / errors
describe("reportStatements — validation and error paths", () => {
  beforeEach(() => configure());

  test("missing workplaces -> 500 TypeError (workplaces.includes runs before validation, :1098)", async () => {
    // NOTE: should be a 400 "Workplaces are required"; the check at :1100 comes too late.
    const res = await S.call(ctrl.reportStatements, { startDate: BODY_ALL.startDate, endDate: BODY_ALL.endDate });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      code: 500,
      message: "Internal server error",
      error: "Cannot read properties of undefined (reading 'includes')",
    });
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls("raport.create").length, 0);
  });

  test("missing startDate or endDate -> 400 (:1086-1090)", async () => {
    for (const body of [{ workplaces: ["all"], endDate: BODY_ALL.endDate }, { workplaces: ["all"], startDate: BODY_ALL.startDate }, { workplaces: ["all"] }]) {
      const res = await S.call(ctrl.reportStatements, body);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "Start and end dates are required" });
    }
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.log.length, 0);
  });

  test("empty or non-array workplaces -> 400 'Workplaces are required' (:1100-1104)", async () => {
    for (const workplaces of [[], "Веймар"]) {
      const res = await S.call(ctrl.reportStatements, { ...BODY_ALL, workplaces });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "Workplaces are required" });
    }
    assert.equal(cap.files.length, 0);
  });

  test("named workplaces with no data -> 404 (:1377-1382), nothing written", async () => {
    configure({ counts: {} });
    const res = await S.call(ctrl.reportStatements, { ...BODY_ALL, workplaces: ["Веймар", "Равон"] });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found for the specified criteria" });
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls("raport.create").length, 0);
    assert.equal(prisma.calls("raportLink.create").length, 0);
  });

  test("prisma throw on the workplace lookup -> 500 with the error message", async () => {
    prisma.when("registration.findMany", () => {
      throw new Error("db down");
    });
    const res = await S.call(ctrl.reportStatements, BODY_ALL);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "db down" });
    assert.equal(cap.files.length, 0);
  });

  test("prisma throw on raport.create -> 500 and no file (DB row is written before the file, :1422 vs :1439)", async () => {
    prisma.when("raport.create", () => {
      throw new Error("insert failed");
    });
    const res = await S.call(ctrl.reportStatements, BODY_ALL);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "insert failed" });
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls("raportLink.create").length, 0);
  });

  test("a count failing for one workplace is swallowed and that row is skipped (:1236-1238)", async () => {
    configure({ throwFor: "Веймар" });
    const res = await S.call(ctrl.reportStatements, BODY_ALL);
    assert.equal(res.statusCode, 200);
    const t = S.lastDocx(cap).doc.tables[0];
    assert.deepEqual(
      t.rows.slice(2).map((r) => r.cells[0].text),
      ["АО Узавто", "Равон", "ВСЕГО:", "Иные объекты, ведомства, организации (СП Ф-У)", "ВСЕГО (СП Ф-Р, О, У)"]
    );
    assert.deepEqual(S.rowTexts(t.rows[4]), ["ВСЕГО:", "15", "11", "3", "8", "3", "1"]); // Равон + АО Узавто
  });
});

// ================================================================ B–E. document (workplaces: all)
describe("reportStatements — document layout (workplaces: ['all'])", () => {
  let doc;
  before(async () => {
    configure();
    await S.call(ctrl.reportStatements, BODY_ALL, USER);
    doc = S.lastDocx(cap).doc;
  });

  test("B. one section, A4 portrait, margins 2/1.5/2/2.5 cm (:3447-3454)", () => {
    assert.equal(doc.sections.length, 1);
    const sec = doc.sections[0];
    assert.deepEqual(sec.page, S.PAGE);
    assert.deepEqual(sec.margins, S.MARGINS);
    assert.equal(sec.columns, undefined);
    assert.equal(sec.titlePage, undefined);
  });

  test("B. no headers/footers, no page breaks", () => {
    const sec = doc.sections[0];
    assert.deepEqual(sec.headerRefs, []);
    assert.deepEqual(sec.footerRefs, []);
    assert.deepEqual(sec.headers, {});
    assert.deepEqual(sec.footers, {});
    assert.equal(doc.pageBreakCount, 0);
  });

  test("C. style defaults are empty and no font is set anywhere (Word default font)", () => {
    assert.deepEqual(doc.styles.defaults, { run: {}, paragraph: {} });
    assert.equal(doc.xml.includes("w:rFonts"), false);
    for (const p of doc.allParagraphs) for (const r of p.runs) assert.equal(r.font, undefined, `font set on "${r.text}"`);
    assert.deepEqual(doc.fontsUsed(), [undefined]);
  });

  test("D. only the expected font sizes are used: 6pt line, 10pt cells, 11pt headers/date, 16pt title", () => {
    assert.deepEqual(doc.sizesUsed(), [12, 20, 22, 32]);
  });

  test("D. block order: title, line, table, line, date", () => {
    assert.deepEqual(
      doc.blocks.map((b) => b.type),
      ["paragraph", "paragraph", "table", "paragraph", "paragraph"]
    );
    assert.equal(doc.paragraphs.length, 4);
    assert.equal(doc.tables.length, 1);
  });

  test("D. title: 16pt bold, centered, before 276 / after 200 (:3460-3470)", () => {
    const title = "Статистика по объектам, привлекаемым ведомствам, учреждениям и организациям (за период: 01.01.2024 - 31.12.2024):";
    assert.deepEqual(
      S.bare(doc.paragraphs[0]),
      S.para(title, { alignment: "center", spacing: { before: 276, after: 200 } }, [S.run(title, 32, { bold: true })])
    );
  });

  test("D. top decorative line: 160 underscores, 6pt bold, centered, after 400 (:3473-3483)", () => {
    assert.deepEqual(
      S.bare(doc.paragraphs[1]),
      S.para(S.LINE_160, { alignment: "center", spacing: { before: 0, after: 400 } }, [S.run(S.LINE_160, 12, { bold: true })])
    );
  });

  test("D. bottom decorative line: 137 underscores, 6pt bold black, 400/400 (:3870-3881)", () => {
    assert.deepEqual(
      S.bare(doc.paragraphs[2]),
      S.para(S.LINE_137, { alignment: "center", spacing: { before: 400, after: 400 } }, [
        S.run(S.LINE_137, 12, { bold: true, color: "000000" }),
      ])
    );
  });

  test("D. date line: 11pt italic not bold, right-aligned, 300/200, frozen now (:3884-3895)", () => {
    const text = S.expectedDateLine();
    assert.match(text, /^Дата составления: 15 января 2026 года в \d\d:00$/);
    assert.deepEqual(
      S.bare(doc.paragraphs[3]),
      S.para(text, { alignment: "right", spacing: { before: 300, after: 200 } }, [S.run(text, 22, { bold: false, italic: true })])
    );
  });

  test("D. no paragraph has indents, tabs, keepNext or page-break-before", () => {
    for (const p of doc.allParagraphs) {
      assert.equal(p.indent, undefined);
      assert.equal(p.tabs, undefined);
      assert.equal(p.keepNext, undefined);
      assert.equal(p.pageBreakBefore, undefined);
      assert.equal(p.borders, undefined);
    }
  });

  test("E. table: 100% pct, centered, no layout/indent/cell margins, explicit black borders (:3854-3866)", () => {
    const t = doc.tables[0];
    assert.deepEqual(t.width, { size: "100%", type: "pct" });
    assert.equal(t.alignment, "center");
    assert.equal(t.layout, undefined);
    assert.equal(t.indent, undefined);
    assert.equal(t.cellMargins, undefined);
    assert.equal(t.style, undefined);
    assert.deepEqual(t.borders, {
      top: S.border("single", 4, "000000"),
      left: S.border("single", 4, "000000"),
      bottom: S.border("single", 4, "000000"),
      right: S.border("single", 4, "000000"),
      insideH: S.border("single", 2, "000000"),
      insideV: S.border("single", 2, "000000"),
    });
  });

  test("E. grid: 7 columns of 100 twips each (docx placeholder grid)", () => {
    assert.deepEqual(doc.tables[0].grid, [100, 100, 100, 100, 100, 100, 100]);
  });

  test("E. rows: 2 header rows + 6 data rows, no heights, none marked as repeating header", () => {
    const t = doc.tables[0];
    assert.equal(t.rows.length, 2 + ALL_ROWS.length);
    for (const r of t.rows) {
      assert.equal(r.height, undefined);
      assert.equal(r.isHeader, false);
      assert.equal(r.cantSplit, false);
    }
  });

  test("E. header row 1: five rowSpan-2 cells + 'ОТКАЗЫ' spanning 2 columns (:3489-3636)", () => {
    assert.deepEqual(S.bare(doc.tables[0].rows[0].cells), [
      hdr("Объекты, ведомства, учреждения, и организации", 20),
      hdr("СП развернута (Ф-Р,О)", 15),
      hdr("СП завершена (Ф-Р,О)", 15),
      hdr("К/м (Ф-Р,О)", 15),
      hdr("ДОПУСК", 15),
      hdr("ОТКАЗЫ", 20, { rowSpan: false, gridSpan: 2, spacing: { before: 50, after: 50 } }),
    ]);
  });

  test("E. header row 2: five vMerge continuations + 'Всего' / 'ОТК-1' (:3639-3688)", () => {
    assert.deepEqual(S.bare(doc.tables[0].rows[1].cells), [
      S.vMergeContinue(),
      S.vMergeContinue(),
      S.vMergeContinue(),
      S.vMergeContinue(),
      S.vMergeContinue(),
      sub("Всего"),
      sub("ОТК-1"),
    ]);
  });

  test("E. data rows: workplaces sorted by collator, then 'ВСЕГО:', 'Иные …', grand total", () => {
    const rows = doc.tables[0].rows.slice(2);
    assert.deepEqual(rows.map(S.rowTexts), ALL_ROWS.map((r) => r.map(String)));
  });

  test("E. every data cell: width 20/15/15/15/15/10/10 %, centered vAlign, zebra shading, 10pt", () => {
    const rows = doc.tables[0].rows.slice(2);
    rows.forEach((r, i) => assert.deepEqual(S.bare(r.cells), dataRow(ALL_ROWS[i], i), `row ${i}`));
  });

  test("E. totals: 'ВСЕГО:' sums the workplaces; grand total adds 'Иные' but not 'ВСЕГО:' (:1249-1265, :1393-1402)", () => {
    const rows = doc.tables[0].rows.slice(2).map(S.rowTexts);
    const num = (r) => r.slice(1).map(Number);
    const wp = rows.slice(0, 3).map(num);
    const sumCols = (list) => list[0].map((_, c) => list.reduce((a, r) => a + r[c], 0));
    assert.deepEqual(num(rows[3]), sumCols(wp));
    assert.deepEqual(num(rows[5]), sumCols([...wp, num(rows[4])]));
  });

  test("E. zero counts print as '0' (the `|| '0'` fallback)", () => {
    const weimar = doc.tables[0].rows[3];
    assert.equal(weimar.cells[0].text, "Веймар");
    assert.equal(weimar.cells[3].text, "0"); // km_count 0
    assert.equal(weimar.cells[6].text, "0"); // otk1_count 0
  });
});

// ================================================================ F. variants
describe("reportStatements — variants", () => {
  test("named workplaces: no 'ВСЕГО:' / 'Иные' rows, total label without 'У', no workplace lookup", async () => {
    configure();
    const res = await S.call(ctrl.reportStatements, { ...BODY_ALL, workplaces: ["Равон", "Веймар"] });
    assert.equal(res.statusCode, 200);
    assert.equal(prisma.calls("registration.findMany").length, 0);
    assert.equal(prisma.calls("form.findMany").filter((a) => a.where.type.equals === "registration4").length, 0);
    assert.equal(prisma.calls("registration.count").length, 12);
    const t = S.lastDocx(cap).doc.tables[0];
    const exp = [
      vals("Веймар", COUNTS["Веймар"]),
      vals("Равон", COUNTS["Равон"]),
      vals("ВСЕГО (СП Ф-Р, О)", { open: 19, close: 14, km: 2, access: 10, eliminete: 4, otk1: 1 }), // :1395 statusReg false
    ];
    assert.equal(t.rows.length, 2 + exp.length);
    t.rows.slice(2).forEach((r, i) => assert.deepEqual(S.bare(r.cells), dataRow(exp[i], i)));
  });

  test("duplicate workplaces are de-duplicated before querying (:1112-1114)", async () => {
    configure();
    await S.call(ctrl.reportStatements, { ...BODY_ALL, workplaces: ["Веймар", "Веймар", "Равон"] });
    assert.equal(prisma.calls("form.findMany").length, 2);
    assert.equal(prisma.calls("registration.count").length, 12);
    assert.equal(S.lastDocx(cap).doc.tables[0].rows.length, 2 + 3);
  });

  test("column count stays 7 (grid + every row) whatever the number of workplaces", async () => {
    for (const workplaces of [["Равон"], ["Равон", "Веймар", "АО Узавто"]]) {
      configure();
      await S.call(ctrl.reportStatements, { ...BODY_ALL, workplaces });
      const t = S.lastDocx(cap).doc.tables[0];
      assert.equal(t.grid.length, 7);
      assert.equal(t.rows.length, 2 + workplaces.length + 1); // header x2 + workplaces + final total
      assert.equal(t.rows[0].cells.reduce((a, c) => a + c.gridSpan, 0), 7);
      for (const r of t.rows.slice(1)) assert.equal(r.cells.length, 7);
    }
  });

  test("workplaces:['all'] with no data at all still returns 200 ('Иные' row is always pushed, :1358)", async () => {
    // NOTE: unlike named workplaces this never reaches the 404 branch.
    configure({ counts: {} });
    const res = await S.call(ctrl.reportStatements, BODY_ALL);
    assert.equal(res.statusCode, 200);
    const t = S.lastDocx(cap).doc.tables[0];
    assert.deepEqual(t.rows.slice(2).map(S.rowTexts), [
      ["ВСЕГО:", "0", "0", "0", "0", "0", "0"],
      ["Иные объекты, ведомства, организации (СП Ф-У)", "0", "0", "0", "0", "0", "0"],
      ["ВСЕГО (СП Ф-Р, О, У)", "0", "0", "0", "0", "0", "0"],
    ]);
  });

  test("'Иные' label lists every registration4 form joined with ','", async () => {
    configure();
    prisma.when("form.findMany", (a) => (a.where.type.equals === "registration4" ? [{ name: "У" }, { name: "У-2" }] : FORMS_REG));
    await S.call(ctrl.reportStatements, BODY_ALL);
    const t = S.lastDocx(cap).doc.tables[0];
    assert.equal(t.rows.at(-2).cells[0].text, "Иные объекты, ведомства, организации (СП Ф-У,У-2)");
  });
});
