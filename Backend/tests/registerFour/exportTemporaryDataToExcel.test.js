// POST /registerFour/export -> registerFourController.exportTemporaryDataToExcel
// Characterization tests: lock in today's response contract, prisma queries and
// the exact layout/formatting of the "Temporary Data" sheet.
process.env.TZ = "Asia/Tashkent";

const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { installFakePrisma } = require("../helpers/fakePrisma");
const prisma = installFakePrisma();
const { captureGeneratedFiles } = require("../helpers/captureFiles");
const { SERVER_URL } = require("../../api/helpers/constants");
const ctrl = require("../../api/controllers/registerFourController");
const S = require("./_support");

const CALLER = "admin-7f3c";

// registration rows (camelCase fields, as in the registration model)
const REGISTRATIONS = [
  {
    id: "reg-1",
    regNumber: "1708-19",
    lastName: "Иванов",
    firstName: "Иван",
    fatherName: "Иванович",
    birthDate: new Date("1980-05-05T12:00:00Z"),
    birthPlace: "г. Ташкент, Юнусабадский р-н",
    executor: { first_name: "Алишер", last_name: "Каримов" },
    Initiator: { first_name: "Бобур", last_name: "Рахимов" },
  },
  {
    id: "reg-2",
    regNumber: "0951-21",
    lastName: "Каримова",
    firstName: "Дилноза",
    fatherName: "Рустамовна",
    birthDate: null,
    birthYear: 1975,
    birthPlace: "Самаркандская обл.",
    executor: null,
    Initiator: null,
  },
];
// relatives rows (some legacy snake_case fields are also read by the mapper)
const RELATIVES = [
  {
    id: "rel-1",
    reg_number: "1708-20",
    last_name: "Петров",
    first_name: "Сергей",
    fatherName: "Николаевич",
    birthYear: 1952,
    birthPlace: "",
  },
  {
    id: "rel-2",
    regNumber: "1708-19",
    lastName: "Иванова",
    firstName: "Мария",
    fatherName: null,
    birthDate: null,
    birthYear: null,
    birthPlace: null,
  },
];

let cap;
before(() => {
  cap = captureGeneratedFiles();
});
after(() => cap.restore());
beforeEach(() => {
  prisma.reset();
  cap.clear();
});

function seed() {
  prisma.when("session.findMany", [
    { registrationId: "reg-1" },
    { registrationId: "reg-2" },
    { registrationId: "rel-1" },
    { registrationId: "rel-2" },
  ]);
  prisma.when("registration.findMany", REGISTRATIONS);
  prisma.when("relatives.findMany", RELATIVES);
}

async function exportOk(type = "SESSION") {
  prisma.reset();
  cap.clear();
  seed();
  const res = await S.call(ctrl.exportTemporaryDataToExcel, { body: { type }, userId: CALLER });
  assert.equal(res.statusCode, 200);
  assert.equal(cap.files.length, 1);
  const book = await S.inspectXlsx(cap.last().buffer);
  return { res, book, s: book.sheets[0] };
}

describe("response contract", () => {
  test("200 JSON with a download link to a uuid .xlsx written to ./uploads", async () => {
    const { res } = await exportOk();
    assert.deepEqual(Object.keys(res.body).sort(), ["code", "link", "message"]);
    assert.equal(res.body.code, 200);
    assert.equal(res.body.message, "Excel file exported successfully");
    assert.match(res.body.link, S.linkRegex(SERVER_URL));
    // link and file share the same uuid file name
    const f = cap.last();
    assert.match(f.path, S.UPLOAD_PATH_RE); // `./uploads/${fileName}`
    assert.equal(f.ext, ".xlsx");
    assert.equal(res.body.link.split("/").pop(), f.path.split("/").pop());
    assert.equal(f.buffer.slice(0, 4).toString("hex"), "504b0304");
    // LINK endpoint: nothing streamed, no attachment headers
    assert.equal(res.downloaded, null);
    assert.equal(res.sentFile, null);
    assert.equal(res.headers["content-disposition"], undefined);
  });

  test("queries only the caller's sessions of the requested type, then registration + relatives by id", async () => {
    await exportOk("RESERVE");
    assert.deepEqual(prisma.calls("session.findMany"), [
      { where: { type: "RESERVE", adminId: CALLER }, select: { registrationId: true } },
    ]);
    const include = {
      executor: { select: { first_name: true, last_name: true } },
      Initiator: { select: { first_name: true, last_name: true } },
    };
    const where = { id: { in: ["reg-1", "reg-2", "rel-1", "rel-2"] } };
    assert.deepEqual(prisma.calls("registration.findMany"), [{ where, orderBy: { regNumber: "asc" }, include }]);
    assert.deepEqual(prisma.calls("relatives.findMany"), [{ where, orderBy: { regNumber: "asc" }, include }]);
    // read-only endpoint: no DB writes at all
    const writes = prisma.log.filter((e) => /\.(create|update|upsert|delete)/.test(e.key));
    assert.deepEqual(writes, []);
  });

  for (const type of ["SESSION", "RESERVE", "RAPORT"]) {
    test(`type ${type}: passes type through and produces the same sheet layout`, async () => {
      const { res, s } = await exportOk(type);
      assert.equal(prisma.calls("session.findMany")[0].where.type, type);
      assert.match(res.body.link, S.linkRegex(SERVER_URL));
      assert.equal(s.name, "Temporary Data");
      assert.equal(s.rowCount, 5); // header + 4 rows
      assert.deepEqual(s.columns.map((c) => c.width), [10, 12, 20, 20, 20, 10, 50]);
    });
  }

  test("any non-empty type string is accepted (no whitelist)", async () => {
    // NOTE: unlike exportSverkaMain there is no SESSION/RESERVE/RAPORT whitelist here.
    const { s } = await exportOk("anything");
    assert.equal(prisma.calls("session.findMany")[0].where.type, "anything");
    assert.equal(s.rowCount, 5);
  });

  for (const [label, body] of [
    ["missing type", {}],
    ["empty type", { type: "" }],
    ["whitespace type", { type: "   " }],
  ]) {
    test(`400 "type is required" for ${label}, no DB call, no file`, async () => {
      const res = await S.call(ctrl.exportTemporaryDataToExcel, { body, userId: CALLER });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "type is required" });
      assert.equal(prisma.log.length, 0);
      assert.equal(cap.files.length, 0);
    });
  }

  test("non-string type throws before the try block (promise rejects, no response)", async () => {
    // NOTE: `type.trim()` runs outside try/catch, so { type: 1 } rejects with a
    // TypeError instead of returning 400/500. Express 4 would leave the request hanging.
    const { mockReq, mockRes } = require("../helpers/http");
    const res = mockRes();
    await assert.rejects(ctrl.exportTemporaryDataToExcel(mockReq({ body: { type: 1 }, userId: CALLER }), res), TypeError);
    assert.equal(res.finished, false);
    assert.equal(cap.files.length, 0);
  });

  test('404 "No sessions found for the given type" when the caller has no sessions', async () => {
    prisma.when("session.findMany", []);
    const res = await S.call(ctrl.exportTemporaryDataToExcel, { body: { type: "SESSION" }, userId: CALLER });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No sessions found for the given type" });
    assert.equal(prisma.calls("registration.findMany").length, 0);
    assert.equal(cap.files.length, 0);
  });

  test('404 "No data found" when sessions exist but neither registration nor relatives match', async () => {
    prisma.when("session.findMany", [{ registrationId: "gone-1" }]);
    const res = await S.call(ctrl.exportTemporaryDataToExcel, { body: { type: "SESSION" }, userId: CALLER });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { code: 404, message: "No data found" });
    assert.equal(prisma.calls("registration.findMany").length, 1);
    assert.equal(prisma.calls("relatives.findMany").length, 1);
    assert.equal(cap.files.length, 0);
  });

  test("500 with the prisma error message when a query throws", async () => {
    prisma.when("session.findMany", [{ registrationId: "reg-1" }]);
    prisma.when("registration.findMany", () => {
      throw new Error("db connection lost");
    });
    const res = await S.quiet(() => S.call(ctrl.exportTemporaryDataToExcel, { body: { type: "SESSION" }, userId: CALLER }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { code: 500, message: "Internal server error", error: "db connection lost" });
    assert.equal(cap.files.length, 0);
  });
});

describe('sheet "Temporary Data" layout', () => {
  let s;
  let book;
  before(async () => {
    ({ s, book } = await exportOk());
  });

  test("one sheet, default portrait page setup, no views/filters/images", () => {
    assert.deepEqual(book.sheetNames, ["Temporary Data"]); // addWorksheet("Temporary Data")
    assert.deepEqual(s.pageSetup, S.defaultPageSetup("portrait")); // no pageSetup passed
    assert.equal(s.pageSetup.paperSize, undefined);
    assert.equal(s.views, null); // no frozen panes
    assert.equal(s.autoFilter, undefined);
    assert.equal(s.headerFooter, null);
    assert.deepEqual(s.merges, []);
    assert.deepEqual(s.images, []);
    assert.deepEqual(book.media, []);
    assert.equal(s.properties.defaultRowHeight, 15);
  });

  test("column widths and keys from sheet.columns", () => {
    // registerFourController.js:2023-2031
    assert.deepEqual(
      s.columns.map((c) => [c.letter, c.width, c.hidden]),
      [
        ["A", 10, false], // t_raqam
        ["B", 12, false], // qayd_raqam
        ["C", 20, false], // familiya
        ["D", 20, false], // ism
        ["E", 20, false], // sharif
        ["F", 10, false], // t_sana
        ["G", 50, false], // t_joy
      ]
    );
    assert.equal(s.columnCount, 7);
  });

  test("header row 1: latin column names, peach fill FFFCE4D6, default Calibri 11, no border/alignment", () => {
    assert.deepEqual(s.rows[1].values, ["t_raqam", "qayd_raqam", "familiya", "ism", "sharif", "t_sana", "t_joy"]);
    assert.equal(s.rows[1].height, undefined);
    for (const col of "ABCDEFG") {
      const c = s.cell(`${col}1`);
      assert.deepEqual(c.fill, { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } }, `${col}1 fill`); // :2036-2040
      assert.deepEqual(c.font, S.DEFAULT_FONT, `${col}1 font`); // not bold
      assert.equal(c.alignment, undefined, `${col}1 alignment`);
      assert.deepEqual(c.border, {}, `${col}1 border`);
      assert.equal(c.numFmt, undefined, `${col}1 numFmt`);
      assert.equal(c.isMerged, false);
    }
    // only the 7 used header cells are filled
    assert.equal(s.cell("H1").fill, undefined);
    assert.equal(s.cell("H1").value, null);
  });

  test("data rows: registrations + relatives merged, sorted by regNumber (localeCompare), numbered 1..n", () => {
    assert.equal(s.rowCount, 1 + REGISTRATIONS.length + RELATIVES.length);
    assert.deepEqual(
      [2, 3, 4, 5].map((n) => s.rows[n].values),
      [
        // 0951-21 registration: birthDate null -> birthYear
        [1, "0951-21", "Каримова", "Дилноза", "Рустамовна", 1975, "Самаркандская обл."],
        // 1708-19 registration (first in the stable sort): birthDate -> getFullYear()
        [2, "1708-19", "Иванов", "Иван", "Иванович", 1980, "г. Ташкент, Юнусабадский р-н"],
        // 1708-19 relative: every optional field null -> ""
        [3, "1708-19", "Иванова", "Мария", "", "", ""],
        // 1708-20 relative: reg_number / last_name / first_name fallbacks
        [4, "1708-20", "Петров", "Сергей", "Николаевич", 1952, ""],
      ]
    );
  });

  test("data cells carry no explicit formatting and numbers stay numeric", () => {
    for (const n of [2, 3, 4, 5]) {
      assert.equal(s.rows[n].height, undefined, `row ${n} height`);
      for (const col of "ABCDEFG") {
        const c = s.cell(`${col}${n}`);
        assert.equal(c.font, undefined, `${col}${n} font`);
        assert.equal(c.fill, undefined, `${col}${n} fill`);
        assert.equal(c.border, undefined, `${col}${n} border`);
        assert.equal(c.alignment, undefined, `${col}${n} alignment`);
        assert.equal(c.numFmt, undefined, `${col}${n} numFmt`);
      }
    }
    assert.equal(typeof s.cell("A2").value, "number");
    assert.equal(typeof s.cell("F2").value, "number"); // year as number, not string
    assert.equal(s.cell("F4").value, ""); // missing year -> empty string
  });
});
