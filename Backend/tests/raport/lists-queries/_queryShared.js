// Tests shared by POST /raport/createQuerySgb and POST /raport/createQueryGsbp.
// Both handlers (generateDedicatedQueryRaportSGB / ...GSBP, raportController.js:618 / :711)
// are line-for-line identical apart from the generator (via buildMalumotnomaQueryDoc,
// :517) and the raportLink.code. The header table, addressee block, signer
// (agreed) block, page setup, DB writes and error paths are therefore checked
// here once per endpoint; each endpoint file adds its own body-paragraph tests.
const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const S = require("./_support");

const { prisma, signers, admin, registration, relative, raportType, routeRaportTypes, run, paraShape, runShape, NO_BORDERS, LINK_RE, ADMIN_ID, UPLOADS_DIR } = S;

const TNR = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman", eastAsia: "Times New Roman" };
// The t() helper (raportController.js:4902 / :5192): Times New Roman, size 28 unless overridden.
const tRun = (text, extra = {}) => ({ text, font: TNR, size: 28, sizeCs: 28, ...extra, breaks: [], tabs: 0 });

// buildQuerySignedListBlocks (api/helpers/querySignerLayout.js): the rank line is
// `String(rank + "                        ")` (24 spaces) joined to the name with
// "     " (5 spaces) => rank + 29 spaces + name.
const RANK_GAP = " ".repeat(29);
// currentMonthRu = toLocaleString("ru-RU", { month: "long" }) (raportController.js:500)
// NOTE: this is the nominative "январь", not the genitive "января" a date line needs.
const DATE_LINE = "«____» январь 2026 года";

const SIGNER_BY_ID = Object.fromEntries(Object.values(signers).map((s) => [s.id, s]));

// Standard fixture wiring for one call. Returns run() result.
async function callQuery(handler, fixedName, {
  body,
  signerById = SIGNER_BY_ID,
  reg = registration(),
  rel = null,
  types = null,
  adminRow = admin,
  relativesNotes = [],
  overrides = {},
} = {}) {
  prisma.reset();
  prisma.when("admin.findUnique", adminRow);
  prisma.when("signList.findUnique", (a) => signerById[a.where.id] || null);
  prisma.when("registration.findUnique", reg);
  prisma.when("relatives.findUnique", rel);
  prisma.when("relatives.findMany", relativesNotes);
  const rows = types || [
    raportType({ id: `rt-${fixedName}`, name: fixedName, code: fixedName, link: fixedName, notes: "проверкой на допуск к секретным сведениям", editable_word: "Просим сообщить имеющиеся сведения" }),
  ];
  routeRaportTypes((values) => (values[0] === `%${fixedName}%` && values.length === 1 ? rows : []));
  for (const [key, value] of Object.entries(overrides)) prisma.when(key, value);
  return run(handler, body || { id: "reg-0001", signListIds: ["sign-0001", "sign-0002"] });
}

const recipientParas = (doc) => doc.paragraphs.filter((p) => p.indent && p.indent.left === 4820);
const agreedParas = (doc) => doc.paragraphs.filter((p) => p.spacing && p.spacing.line === 280);

// Expected agreed (signer) lines for one signer — querySignerLayout.js buildQuerySignedListBlocks.
const agreedLines = (s) => [s.position, s.workplace, `${s.rank}${RANK_GAP}${s.lastName} ${s.firstName[0]}.${s.fatherName[0]}.`, DATE_LINE];

function registerCommonQueryTests({ handler, fixedName, linkCode }) {
  describe("response contract and DB writes", () => {
    let r;
    before(async () => {
      r = await callQuery(handler, fixedName);
    });

    test("200 JSON with a LINK to a .docx under SERVER_URL/api/v1/download", () => {
      assert.equal(r.res.statusCode, 200);
      assert.deepEqual(Object.keys(r.res.body).sort(), ["code", "link", "message"]);
      assert.equal(r.res.body.code, 200);
      assert.equal(r.res.body.message, "Document generated and saved successfully");
      assert.match(r.res.body.link, LINK_RE);
      assert.equal(r.res.downloaded, null); // LINK endpoint: no res.download
      assert.equal(r.res.sentFile, null);
    });

    test("exactly one .docx is written to Backend/uploads/<uuid>.docx named like the link", () => {
      assert.equal(r.files.length, 1);
      const uuid = r.res.body.link.match(LINK_RE)[1];
      assert.equal(path.resolve(r.file.path), path.join(UPLOADS_DIR, `${uuid}.docx`));
      assert.equal(r.file.buffer.subarray(0, 4).toString("hex"), "504b0304");
    });

    test(`raport row: name "${fixedName}", executorId = caller, link = response link, notes ""`, () => {
      const calls = prisma.calls("raport.create");
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        data: { name: fixedName, executorId: ADMIN_ID, link: r.res.body.link, notes: "" },
      });
    });

    test(`raportLink row: code "${linkCode}", connects the raport and the registration`, () => {
      const calls = prisma.calls("raportLink.create");
      assert.equal(calls.length, 1);
      const raportId = calls[0].data.raport.connect.id;
      assert.match(raportId, /^fake-raport-\d+$/); // id returned by the fake raport.create
      assert.deepEqual(calls[0], {
        data: { code: linkCode, raport: { connect: { id: raportId } }, registrations: { connect: { id: "reg-0001" } } },
      });
    });

    test("prisma call order and the exact lookup shapes", () => {
      assert.deepEqual(
        prisma.log.map((e) => e.key),
        ["signList.findUnique", "signList.findUnique", "registration.findUnique", "$queryRaw", "admin.findUnique", "admin.findUnique", "raport.create", "raportLink.create"]
      );
      assert.deepEqual(prisma.calls("signList.findUnique"), [{ where: { id: "sign-0001" } }, { where: { id: "sign-0002" } }]);
      // loadQueryRaportSourceData (raportController.js:570)
      assert.deepEqual(prisma.calls("registration.findUnique")[0], {
        where: { id: "reg-0001" },
        include: {
          Initiator: { select: { first_name: true, last_name: true, father_name: true } },
          executor: { select: { first_name: true, last_name: true, father_name: true, phone: true } },
        },
      });
      assert.equal(prisma.calls("relatives.findUnique").length, 0);
      // selectRaportTypesByCodeOrFallback({ code: fixedName }) — first query is code ILIKE %fixedName%
      assert.deepEqual(S.sqlValues(prisma.calls("$queryRaw")[0]), [`%${fixedName}%`]);
      // buildMalumotnomaQueryDoc (raportController.js:487 / :495)
      assert.deepEqual(prisma.calls("admin.findUnique"), [
        { where: { id: ADMIN_ID } },
        { where: { id: ADMIN_ID }, select: { first_name: true, last_name: true } },
      ]);
    });
  });

  describe("validation and error paths", () => {
    test("signListIds missing -> 404 'signListIds not found', no DB access", async () => {
      const r = await callQuery(handler, fixedName, { body: { id: "reg-0001" } });
      assert.equal(r.res.statusCode, 404);
      assert.deepEqual(r.res.body, { code: 404, message: "signListIds not found" });
      assert.equal(prisma.log.length, 0);
      assert.equal(r.files.length, 0);
    });

    test("signListIds [] -> 404 'signListIds not found'", async () => {
      const r = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: [] } });
      assert.equal(r.res.statusCode, 404);
      assert.deepEqual(r.res.body, { code: 404, message: "signListIds not found" });
    });

    test("no signList row matches -> 404 'signList not found'", async () => {
      const r = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: ["nope-1", "nope-2"] } });
      assert.equal(r.res.statusCode, 404);
      assert.deepEqual(r.res.body, { code: 404, message: "signList not found" });
      assert.equal(prisma.calls("registration.findUnique").length, 0);
      assert.equal(r.files.length, 0);
    });

    test("id is neither a registration nor a relative -> 404 'data not found' (relatives looked up with the same include)", async () => {
      const r = await callQuery(handler, fixedName, { reg: null, rel: null, body: { id: "ghost", signListIds: ["sign-0001"] } });
      assert.equal(r.res.statusCode, 404);
      assert.deepEqual(r.res.body, { code: 404, message: "data not found" });
      assert.deepEqual(prisma.calls("relatives.findUnique"), [
        {
          where: { id: "ghost" },
          include: {
            Initiator: { select: { first_name: true, last_name: true, father_name: true } },
            executor: { select: { first_name: true, last_name: true, father_name: true, phone: true } },
          },
        },
      ]);
      assert.equal(prisma.calls("raport.create").length, 0);
    });

    test("no raport type at all -> 404 'raport type not found' after the full fallback chain", async () => {
      const r = await callQuery(handler, fixedName, { types: [] });
      assert.equal(r.res.statusCode, 404);
      assert.deepEqual(r.res.body, { code: 404, message: "raport type not found" });
      // selectRaportTypesByCodeOrFallback (raportController.js:227): code, then link/name/code, then type2, type1, then all
      assert.deepEqual(prisma.calls("$queryRaw").map(S.sqlValues), [
        [`%${fixedName}%`],
        [`%${fixedName}%`, `%${fixedName}%`, `%${fixedName}%`],
        ["%type2%"],
        ["%type1%"],
        [],
      ]);
      assert.equal(prisma.calls("raport.create").length, 0);
      assert.equal(r.files.length, 0);
    });

    test("a prisma error -> 500 with the error message", async () => {
      prisma.reset();
      prisma.when("signList.findUnique", () => {
        throw new Error("connection refused");
      });
      const r = await run(handler, { id: "reg-0001", signListIds: ["sign-0001"] });
      assert.equal(r.res.statusCode, 500);
      assert.deepEqual(r.res.body, { code: 500, message: "Internal server error", error: "connection refused" });
      assert.equal(r.files.length, 0);
    });

    test("relative id: data is loaded from relatives, but raportLink still connects it as a registration -> 500, orphan raport row, no file", async () => {
      // NOTE: bug (survey: "accept a relative id but always connect it as a registration").
      // The handler falls back to prisma.relatives (raportController.js:593) and builds the
      // document, then raportLink.create uses `registrations: { connect: { id } }` (:689 / :782).
      // Real Prisma rejects connecting a non-existent Registration (P2025); the fake below
      // reproduces that. raport.create already ran, so a raport row is left without a link
      // row, and fs.writeFileSync is never reached.
      prisma.reset();
      const r = await (async () => {
        const res = callQuery(handler, fixedName, {
          reg: null,
          rel: relative({ notes: "сведения о родственнике" }),
          body: { id: "rel-0001", signListIds: ["sign-0001"] },
        });
        return res;
      })().catch((e) => e);
      // callQuery resets the fake, so the P2025 behaviour is installed through a second call:
      prisma.when("raportLink.create", (a) => {
        if (a.data.registrations.connect.id !== "reg-0001") {
          const e = new Error("No 'Registration' record(s) (needed to inline the relation on 'RaportLink' record(s)) was found for a nested connect on one-to-many relation 'RaportLinkToRegistration'.");
          e.code = "P2025";
          throw e;
        }
        return { id: "link-1" };
      });
      // First run (default fake) shows what the handler SENDS for a relative id:
      assert.equal(r.res.statusCode, 200);
      // (fake accepts any connect) — record the args it sent
      // Second run with the realistic P2025 fake:
      const failing = await run(handler, { id: "rel-0001", signListIds: ["sign-0001"] });
      assert.equal(failing.res.statusCode, 500);
      assert.equal(failing.res.body.code, 500);
      assert.equal(failing.res.body.message, "Internal server error");
      assert.match(failing.res.body.error, /No 'Registration' record\(s\)/);
      assert.equal(prisma.calls("relatives.findUnique").length, 2); // once per run
      const linkCalls = prisma.calls("raportLink.create");
      assert.deepEqual(linkCalls.map((c) => c.data.registrations), [{ connect: { id: "rel-0001" } }, { connect: { id: "rel-0001" } }]);
      assert.equal(prisma.calls("raport.create").length, 2); // the failing run still created its raport row
      assert.equal(failing.files.length, 0); // writeFileSync comes after raportLink.create
    });
  });

  describe("page setup and styles", () => {
    let doc;
    before(async () => {
      doc = (await callQuery(handler, fixedName)).doc;
    });

    test("one A4 portrait section, margins 850/850/850/1701 (top/right/bottom/left)", () => {
      assert.equal(doc.sections.length, 1);
      const sec = doc.sections[0];
      assert.deepEqual(sec.page, { width: 11906, height: 16838, orientation: "portrait" }); // docx default A4
      // raportController.js:5148 / :5526 — margin: { top: 850, bottom: 850, left: 1701, right: 850 } (1.5/1.5/3/1.5 cm);
      // header/footer/gutter are the docx library defaults.
      assert.deepEqual(sec.margins, { top: 850, right: 850, bottom: 850, left: 1701, header: 708, footer: 708, gutter: 0 });
      assert.deepEqual(sec.headerRefs, []);
      assert.deepEqual(sec.footerRefs, []);
      assert.deepEqual(sec.headers, {});
      assert.deepEqual(sec.footers, {});
      assert.equal(sec.type, undefined);
    });

    test("no page breaks, no custom style defaults", () => {
      assert.equal(doc.pageBreakCount, 0);
      assert.deepEqual(doc.styles.defaults, { run: {}, paragraph: {} });
    });

    test("only Times New Roman, only 10 pt and 14 pt", () => {
      assert.deepEqual(doc.fontsUsed(), ["Times New Roman"]);
      assert.deepEqual(doc.sizesUsed(), [20, 28]);
      for (const p of doc.allParagraphs) for (const rr of p.runs) assert.deepEqual(rr.font, TNR);
    });

    test("the document starts with the header table and has exactly one table", () => {
      assert.equal(doc.blocks[0].type, "table");
      assert.equal(doc.tables.length, 1); // signatureTable (and footerTable for ГСБП) are built but never added
      assert.equal(doc.blocks.filter((b) => b.type === "table").length, 1);
    });
  });

  describe("header table (Подлежит возврату / Секретно)", () => {
    let t;
    before(async () => {
      t = (await callQuery(handler, fixedName)).doc.tables[0];
    });

    test("table: 100% pct, borderless (none/0/FFFFFF on all six sides), default grid", () => {
      assert.deepEqual(t.width, { size: "100%", type: "pct" }); // width: { size: 100, type: PERCENTAGE }
      assert.deepEqual(t.borders, NO_BORDERS); // noBorders (raportController.js:4887)
      assert.deepEqual(t.grid, [100, 100, 100]);
      assert.equal(t.layout, undefined);
      assert.equal(t.alignment, undefined);
      assert.equal(t.indent, undefined);
      assert.equal(t.cellMargins, undefined);
      assert.equal(t.rows.length, 1);
      assert.equal(t.rows[0].height, undefined);
      assert.equal(t.rows[0].isHeader, false);
    });

    test("three cells 18% / 52% / 30%, borderless, no merges/shading/margins", () => {
      const cells = t.rows[0].cells;
      assert.deepEqual(cells.map((c) => c.width), [
        { size: "18%", type: "pct" },
        { size: "52%", type: "pct" },
        { size: "30%", type: "pct" },
      ]);
      const cellNone = { top: NO_BORDERS.top, left: NO_BORDERS.left, bottom: NO_BORDERS.bottom, right: NO_BORDERS.right };
      for (const c of cells) {
        assert.deepEqual(c.borders, cellNone);
        assert.equal(c.gridSpan, 1);
        assert.equal(c.vMerge, undefined);
        assert.equal(c.shading, undefined);
        assert.equal(c.margins, undefined);
        assert.equal(c.verticalAlign, undefined);
      }
    });

    test("cell 1: executor initials '<first-name initial><last-name initial>-1', 10 pt", () => {
      // leftHeader (raportController.js:534): Тимур Назаров -> "тн-1"
      assert.deepEqual(t.rows[0].cells[0].paragraphs.map(paraShape), [
        { text: "тн-1", spacing: { after: 0 }, runs: [tRun("тн-1", { size: 20, sizeCs: 20 })] },
      ]);
    });

    test("cell 2: 'Подлежит возврату' centered, bold, single underline, 14 pt", () => {
      assert.deepEqual(t.rows[0].cells[1].paragraphs.map(paraShape), [
        { text: "Подлежит возврату", alignment: "center", spacing: { after: 0 }, runs: [tRun("Подлежит возврату", { bold: true, underline: "single" })] },
      ]);
    });

    test("cell 3: 'Секретно' / 'Экз.№_' right-aligned, 10 pt, after 0 / 120", () => {
      assert.deepEqual(t.rows[0].cells[2].paragraphs.map(paraShape), [
        { text: "Секретно", alignment: "right", spacing: { after: 0 }, runs: [tRun("Секретно", { size: 20, sizeCs: 20 })] },
        { text: "Экз.№_", alignment: "right", spacing: { after: 120 }, runs: [tRun("Экз.№_", { size: 20, sizeCs: 20 })] },
      ]);
    });

    test("no admin row -> the initials cell reads just '-1'", async () => {
      const r = await callQuery(handler, fixedName, { adminRow: null });
      assert.equal(r.res.statusCode, 200);
      assert.equal(r.doc.tables[0].rows[0].cells[0].text, "-1");
    });
  });

  describe("addressee block (first signer)", () => {
    const recipientPara = (text) => ({ text, alignment: "left", spacing: { after: 0 }, indent: { left: 4820 }, runs: [tRun(text, { bold: true })] });

    test("4 lines from the FIRST signer: workplace, position, rank, 'Фамилия И.О.' — left, indent 4820, bold 14 pt", async () => {
      const { doc } = await callQuery(handler, fixedName);
      // buildQueryRecipientData (raportController.js:291) + recipientBlockLayout (:4986 / :5288)
      assert.deepEqual(recipientParas(doc).map(paraShape), [
        recipientPara("Служба государственной безопасности"),
        recipientPara("Начальник управления"),
        recipientPara("полковник"),
        recipientPara("Каримов Б.Р."),
      ]);
    });

    test("signer without rank -> the rank line is dropped (3 lines)", async () => {
      const { doc } = await callQuery(handler, fixedName, { signerById: { "sign-0001": { ...signers.s1, rank: "" } }, body: { id: "reg-0001", signListIds: ["sign-0001"] } });
      assert.deepEqual(recipientParas(doc).map((p) => p.text), ["Служба государственной безопасности", "Начальник управления", "Каримов Б.Р."]);
    });

    test("signer with no name/rank/workplace/position -> falls back to the raport type (requested_organization, signed_position, rank, signed_fio)", async () => {
      const blank = { id: "sign-blank", lastName: "", firstName: "", fatherName: "", workplace: "", position: "", rank: "" };
      const { doc } = await callQuery(handler, fixedName, { signerById: { "sign-blank": blank }, body: { id: "reg-0001", signListIds: ["sign-blank"] } });
      assert.deepEqual(recipientParas(doc).map((p) => p.text), ["СГБ Республики Узбекистан", "Начальник департамента", "генерал-майор", "Алимов А.А."]);
    });

    test("signListIds order decides the addressee", async () => {
      const { doc } = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: ["sign-0002", "sign-0001"] } });
      assert.deepEqual(recipientParas(doc).map((p) => p.text), ["Отдел кадров", "Заместитель начальника", "подполковник", "Юсупова Д.А."]);
    });
  });

  describe("signer (agreed) block — querySignerLayout.js", () => {
    const agreedPara = (text) => ({ text, spacing: { after: 0, line: 280 }, runs: [tRun(text, { bold: !text.includes("года") })] });

    test("1 signer: the same signer is both addressee and the agreed block", async () => {
      const { doc } = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: ["sign-0001"] } });
      assert.deepEqual(recipientParas(doc).at(-1).text, "Каримов Б.Р.");
      // splitQuerySigners: 1 signer -> agreedSigners = [signer]
      assert.deepEqual(agreedParas(doc).map(paraShape), agreedLines(signers.s1).map(agreedPara));
    });

    test("2 signers: first -> addressee, second -> agreed block", async () => {
      const { doc } = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: ["sign-0001", "sign-0002"] } });
      assert.deepEqual(agreedParas(doc).map(paraShape), agreedLines(signers.s2).map(agreedPara));
      assert.equal(agreedParas(doc)[2].text, `подполковник${RANK_GAP}Юсупова Д.А.`);
    });

    test("3 signers: agreed block lists signers 2 and 3 in order; no «СОГЛАСОВАНО» label is printed", async () => {
      const { doc } = await callQuery(handler, fixedName, { body: { id: "reg-0001", signListIds: ["sign-0001", "sign-0002", "sign-0003"] } });
      assert.deepEqual(agreedParas(doc).map(paraShape), [...agreedLines(signers.s2), ...agreedLines(signers.s3)].map(agreedPara));
      // NOTE: getQueryApprovalLabelMode returns "afterFirst" for 3+ signers, but the helper's
      // buildQuerySignedListBlocks computes shouldAddApprovalLabel and never uses it, so the
      // «СОГЛАСОВАНО» label never appears (the controller's own local copy would add it).
      assert.equal(doc.findParagraph("СОГЛАСОВАНО"), undefined);
    });

    test("signer with rank '' -> name line has no rank and no padding", async () => {
      const { doc } = await callQuery(handler, fixedName, {
        signerById: { "sign-0001": signers.s1, "sign-0002": { ...signers.s2, rank: "" } },
      });
      assert.equal(agreedParas(doc)[2].text, "Юсупова Д.А.");
    });

    test("signer with rank null -> the literal 'null' is printed before the name", async () => {
      // NOTE: bug in querySignerLayout.js — `String(item?.rank + "    ..." || "")` turns a null rank into "null".
      const { doc } = await callQuery(handler, fixedName, {
        signerById: { "sign-0001": signers.s1, "sign-0002": { ...signers.s2, rank: null } },
      });
      assert.equal(agreedParas(doc)[2].text, `null${RANK_GAP}Юсупова Д.А.`);
    });

    test("empty position/workplace lines are dropped from the agreed block", async () => {
      const { doc } = await callQuery(handler, fixedName, {
        signerById: { "sign-0001": signers.s1, "sign-0002": { ...signers.s2, position: null, workplace: "" } },
      });
      assert.deepEqual(agreedParas(doc).map((p) => p.text), [`подполковник${RANK_GAP}Юсупова Д.А.`, DATE_LINE]);
    });

    test("signature note: regNumber right-aligned, before 240 / after 0; falls back to recordNumber, else empty", async () => {
      let { doc } = await callQuery(handler, fixedName);
      const note = doc.paragraphs.find((p) => p.alignment === "right" && p.spacing && p.spacing.before === 240);
      assert.deepEqual(paraShape(note), { text: "1708-19", alignment: "right", spacing: { before: 240, after: 0 }, runs: [tRun("1708-19")] });
      ({ doc } = await callQuery(handler, fixedName, { reg: registration({ regNumber: "", recordNumber: "77-А" }) }));
      assert.equal(doc.paragraphs.find((p) => p.alignment === "right" && p.spacing.before === 240).text, "77-А");
      ({ doc } = await callQuery(handler, fixedName, { reg: registration({ regNumber: "", recordNumber: "" }) }));
      assert.equal(doc.paragraphs.find((p) => p.alignment === "right" && p.spacing.before === 240).text, "");
    });
  });
}

module.exports = {
  registerCommonQueryTests,
  callQuery,
  tRun,
  TNR,
  DATE_LINE,
  RANK_GAP,
  recipientParas,
  agreedParas,
  agreedLines,
};
