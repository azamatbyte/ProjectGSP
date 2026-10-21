// POST /api/v1/auth/backup -> registerController.exportData
// (registerController.js:4987-5135, column definitions in api/helpers/backupHelper.js)
//
// FILE endpoint: writes one CSV per model + an encrypted ZIP into
// getBackupTempDir(), res.sendFile()s the ZIP and deletes everything in the
// sendFile callback. format:"json" returns the whole DB inline instead.
// Nothing goes to uploads/ and nothing is written to the DB.
const { describe, test, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  PASSWORD_RE,
  FROZEN_NOW,
  FROZEN_TS,
  countUploads,
  createSandbox,
  listDir,
  call,
  listZipEntries,
  extractZip,
  tryExtract,
  parseCsv,
  installArchiverSpy,
  postViaHttp,
} = require("./_support");
const { buildFixtures } = require("./_fixtures");
const { installFakePrisma } = require("../helpers/fakePrisma");

const uploadsBefore = countUploads();
const sandbox = createSandbox("backup");
const archiverSpy = installArchiverSpy(); // before the controller requires archiver
const prisma = installFakePrisma();
const ctrl = require("../../api/controllers/registerController");
const { getBackupModelConfigs } = require("../../api/helpers/backupHelper");

// [prismaModel, csvPrefix, jsonKey, CSV header line] in export order
// (BACKUP_MODEL_CONFIGS sorted by restoreOrder — backupHelper.js:84-587).
// NOTE: the brief/survey says "about 26" CSVs; the code defines 23 models.
const MODELS = [
  ["admin", "admins", "admins", "ID,Username,Password,Birth Date,Father Name,First Name,Last Name,Nationality,Rank,Gender,Workplace,Phone,Photo,Salt,Role,Status,Created At,Updated At"],
  ["service", "services", "services", "ID,Name,Description,Code,Created At,Updated At"],
  ["form", "forms", "forms", "ID,Name,Description,Length,Month,Type,Status,Created At,Updated At"],
  ["initiator", "initiators", "initiators", "ID,First Name,Last Name,Father Name,Rank,Notes,Created At,Updated At"],
  ["relationDegree", "relation_degrees", "relationDegrees", "ID,Name,Created At,Updated At"],
  ["workPlace", "workplaces", "workPlaces", "ID,Name,Created At,Updated At"],
  ["systemSetting", "system_settings", "systemSettings", "Key,Value,Created At,Updated At"],
  ["accessStatus", "access_statuses", "accessStatuses", "ID,Name,Admin ID,Status,Created At,Updated At"],
  ["adminServiceAccess", "admin_service_accesses", "adminServiceAccesses", "ID,Admin ID,Service ID,Granted By,Created At,Updated At"],
  ["registration", "registrations", "registrations", "ID,Registration Number,Registration Date,Registration End Date,Full Name,First Name,Last Name,Father Name,Nationality,PINFL,Passport,Birth Date,Birth Year,Birth Place,Residence,Workplace,Position,Status,Complete Status,Form Registration,Form Registration Log,Conclusion Date,Conclusion Registration Number,Model,Notes,Additional Notes,Conclusion Comprehensive,External Notes,Access Status,Expired,Expired Date,Record Number,End Date,Initiator ID,Executor ID,Who Added,Created At,Updated At"],
  ["relatives", "relatives", "relatives", "ID,Registration Number,Relation Degree,Full Name,First Name,Last Name,Father Name,Nationality,PINFL,Birth Date,Birth Year,Birth Status,Birth Place,Residence,Workplace,Position,Family Status,Model,Notes,Additional Notes,External Notes,Access Status,Status Analysis,Related Registration ID,Initiator ID,Executor ID,Who Added,Created At,Updated At"],
  ["registrationLog", "registration_logs", "registrationLogs", "ID,Registration ID,Field Name,Old Value,New Value,Executor ID,Created At,Updated At"],
  ["log", "logs", "logs", "ID,Record ID,Table Name,Field Name,Old Value,New Value,Executor ID,Created At,Updated At"],
  ["seans", "seans", "seans", "ID,Admin ID,Resource,IP Address,User Agent,Auth Method,Created At,Updated At"],
  ["refreshToken", "refresh_tokens", "refreshTokens", "ID,Token,Admin ID,Expired At,Created At,Updated At"],
  ["upload", "uploads", "uploads", "ID,File Link,Uploaded By,Created At,Updated At"],
  ["signList", "sign_lists", "signLists", "ID,Last Name,First Name,Father Name,Workplace,Position,Rank,Notes,Birth Date,Nationality,Gender,Phone,Photo,Status,Created At,Updated At"],
  ["raportTypes", "raport_types", "raportTypes", "ID,Name,Code,Code RU,Code UZ,Organization,Requested Organization,Signed FIO,Signed Position,Link,Notes,Executor ID,Data,Created At,Updated At"],
  ["raport", "raports", "raports", "ID,Name,Executor ID,Link,Notes,Created At,Updated At"],
  ["raportLink", "raport_links", "raportLinks", "ID,Raport ID,Reg Number,Code,Delete,Display,Admin Check,Discuss Check,Operator,Notes,Registration IDs,Created At,Updated At"],
  ["archive", "archives", "archives", "ID,Name,Data,Executor ID,Created At,Updated At"],
  ["temporaryData", "temporary_data", "temporaryData", "ID,Order,Form Reg,Reg Number,Reg Date,First Name,Last Name,Father Name,Full Name,Birth Year,Birth Place,Workplace,Position,Model,Residence,Initiator ID,Executor ID,Access Status,Data,Record Number,PINFL,Found Status,Action Status,Registration,Registration Similarity,Registration Four,Registration Four Similarity,Relatives,Migration Status,Status,Created At,Updated At"],
  ["session", "sessions", "sessions", "ID,Registration ID,Reg Number,Full Name,First Name,Last Name,Father Name,Birth Year,Birth Date,Birth Place,Workplace,Position,Residence,Model,Notes,Additional Notes,External Notes,Admin ID,Type,Order,Created At,Updated At"],
];
const JSON_KEYS = MODELS.map((m) => m[2]);
const csvName = (prefix) => `${prefix}_${FROZEN_TS}.csv`; // registerController.js:5027
const ZIP_NAME = `export_${FROZEN_TS}.zip`; // registerController.js:5064
const RAPORT_LINK_INCLUDE = { registrations: { select: { id: true } } }; // backupHelper.js:481
const C = "2025-02-10T08:30:00.000Z";
const U = "2025-03-11T12:45:30.500Z";

// Each model's findMany returns its fixture rows for skip 0, [] afterwards.
function seed(fx) {
  prisma.reset();
  for (const [model] of MODELS) {
    const rows = fx[model] || [];
    prisma.when(`${model}.findMany`, (args) => (args && args.skip ? [] : structuredClone(rows)));
  }
}

// Independent oracle for an ordinary cell (overrides cover the special cases).
function expectedCell(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function zipEntryNames(buf) {
  return listZipEntries(buf).map((e) => e.name).sort();
}

before(() => {
  mock.timers.enable({ apis: ["Date"], now: FROZEN_NOW });
});
after(() => {
  mock.timers.reset();
  sandbox.cleanup();
  assert.equal(countUploads(), uploadsBefore, "uploads/ must not change");
});
beforeEach(() => {
  sandbox.resetEnv();
  archiverSpy.created.length = 0;
});

test("backupHelper still defines exactly these 23 models in this order", () => {
  const cfgs = getBackupModelConfigs();
  assert.deepEqual(
    cfgs.map((c) => [c.prismaModel, c.csvPrefix, c.jsonKey, c.fields.map((f) => f.title).join(",")]),
    MODELS
  );
});

describe("csv (default) — full fixture export", () => {
  const fx = buildFixtures();
  let res;
  let info;
  let password;
  let extracted;
  let archiveCall;
  let csv; // csvPrefix -> text

  before(async () => {
    seed(fx);
    // body exactly as the frontend NavBackup.js sends it; `compress` is ignored
    res = await call(ctrl.exportData, { body: { format: "csv", compress: true } });
    archiveCall = structuredClone(archiverSpy.created.at(-1));
    password = res.headers["x-backup-password"];
    info = JSON.parse(res.headers["x-backup-info"]);
    extracted = extractZip(res.sentBuffer, password, sandbox.dir("work"));
    csv = {};
    for (const [, prefix] of MODELS) {
      const buf = extracted.files[csvName(prefix)];
      csv[prefix] = buf ? buf.toString("utf8") : undefined;
    }
  });

  test("response: 200, sendFile of the zip in %PROGRAMDATA%\\GSPApp\\temp, zip headers", () => {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined); // no JSON body, only the file
    assert.equal(res.sentFile, path.join(sandbox.backupDir, ZIP_NAME)); // registerController.js:5086
    assert.equal(res.sentFileOptions, undefined); // called as sendFile(path, cb)
    assert.equal(res.headers["content-type"], "application/zip"); // :5084
    assert.equal(res.headers["content-disposition"], `attachment; filename="export_${FROZEN_TS}.zip"`); // :5083
    assert.deepEqual(Object.keys(res.headers).sort(), [
      "content-disposition",
      "content-type",
      "x-backup-info",
      "x-backup-password",
    ]);
    assert.equal(res.sentBuffer.readUInt32LE(0), 0x04034b50, "starts with a ZIP local header");
  });

  test("X-Backup-Password is a 16-char password from generateSecurePassword's charset", () => {
    assert.match(password, PASSWORD_RE); // registerController.js:74-84, length 16 at :5063
  });

  test("X-Backup-Info JSON: password, message, filename, exportedAt, models, counts", () => {
    // registerController.js:5075-5082
    assert.deepEqual(Object.keys(info), ["password", "message", "filename", "exportedAt", "models", "counts"]);
    assert.equal(info.password, password);
    assert.equal(info.message, "Use this password to extract the ZIP file. Save it securely; it cannot be recovered if lost.");
    assert.equal(info.filename, ZIP_NAME);
    assert.equal(info.exportedAt, "2026-01-15T09:00:00.000Z");
    assert.deepEqual(info.models, JSON_KEYS);
    assert.deepEqual(info.counts, {
      admins: 2, services: 2, forms: 2, initiators: 1, relationDegrees: 3, workPlaces: 1,
      systemSettings: 1, accessStatuses: 2, adminServiceAccesses: 1, registrations: 3,
      relatives: 4, registrationLogs: 1, logs: 2, seans: 1, refreshTokens: 1, uploads: 1,
      signLists: 2, raportTypes: 1, raports: 1, raportLinks: 2, archives: 1, temporaryData: 1,
      sessions: 2,
    });
    assert.deepEqual(Object.keys(info.counts), JSON_KEYS);
  });

  test("archiver is created as zip-encrypted / ZipCrypto (zip20), zlib level 6, with the header password", () => {
    // registerController.js:5066-5071
    assert.equal(archiveCall.format, "zip-encrypted");
    assert.deepEqual(archiveCall.options, { zlib: { level: 6 }, encryptionMethod: "zip20", password });
  });

  test("zip holds exactly one CSV per model (23), every entry encrypted + deflated", () => {
    const entries = listZipEntries(res.sentBuffer);
    assert.equal(entries.length, 23);
    assert.deepEqual(entries.map((e) => e.name).sort(), MODELS.map((m) => csvName(m[1])).sort());
    for (const e of entries) {
      assert.equal(e.encrypted, true, `${e.name} central-dir encrypted flag`);
      assert.equal(e.localFlags & 1, 1, `${e.name} local-header encrypted flag`);
      assert.equal(e.method, 8, `${e.name} deflate`);
      assert.equal(e.name.includes("/"), false, "flat archive, no folders"); // name: path.basename (:5125)
    }
    // 7za agrees: ZipCrypto, encrypted
    assert.equal((extracted.listing.match(/^Method = ZipCrypto Deflate$/gm) || []).length, 23);
    assert.equal((extracted.listing.match(/^Encrypted = \+$/gm) || []).length, 23);
    assert.deepEqual(Object.keys(extracted.files).sort(), MODELS.map((m) => csvName(m[1])).sort());
  });

  test("zip does not open with a wrong or empty password", () => {
    assert.notEqual(tryExtract(res.sentBuffer, "wrong-password!!", sandbox.dir("work")), 0);
    assert.notEqual(tryExtract(res.sentBuffer, "", sandbox.dir("work")), 0);
  });

  test("temp dir: 23 CSVs + zip exist while sending, all deleted after sendFile's callback", () => {
    assert.deepEqual(res.tempBefore, [...MODELS.map((m) => csvName(m[1])), ZIP_NAME].sort());
    assert.deepEqual(res.tempAfter, []); // registerController.js:5087-5095
    assert.deepEqual(listDir(sandbox.backupDir), []);
  });

  test("prisma: one paginated findMany per model, in order, raportLink includes registration ids", () => {
    const calls = prisma.log.map((e) => e.key);
    assert.deepEqual(calls, MODELS.map((m) => `${m[0]}.findMany`));
    for (const [model] of MODELS) {
      const expected = model === "raportLink" ? { include: RAPORT_LINK_INCLUDE, skip: 0, take: 500 } : { skip: 0, take: 500 };
      assert.deepEqual(prisma.calls(`${model}.findMany`), [expected], model); // BACKUP_BATCH_SIZE = 500 (:4598)
    }
    // read-only: no writes of any kind
    assert.equal(prisma.log.filter((e) => !e.key.endsWith(".findMany")).length, 0);
  });

  test("every CSV: UTF-8 without BOM, LF line endings, exact header line in backupHelper column order", () => {
    for (const [, prefix, , header] of MODELS) {
      const buf = extracted.files[csvName(prefix)];
      assert.notDeepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf], `${prefix}: no BOM`);
      const text = buf.toString("utf8");
      assert.equal(text.split("\n")[0], header, `${prefix} header`);
      assert.equal(text.endsWith("\n"), true, `${prefix} ends with \\n`);
      assert.equal(text.includes("\r\n"), prefix === "logs", `${prefix}: CRLF only inside the logs value "x\\r\\ny"`);
    }
  });

  test("every CSV: row count equals the fixture rows", () => {
    for (const [model, prefix] of MODELS) {
      const rows = parseCsv(csv[prefix]);
      assert.equal(rows.length - 1, fx[model].length, `${prefix} data rows`);
      for (const r of rows) assert.equal(r.length, rows[0].length, `${prefix}: constant column count`);
    }
  });

  test("every cell matches its fixture value (Date->ISO, null->'', object->JSON, bool->true/false)", () => {
    const cfgs = getBackupModelConfigs();
    // explicit expectations for the non-trivial cells
    const overrides = {
      form: { 0: { status: "false" } }, // 'yes' is not === true (backupHelper.js:668-669)
      registration: { 0: { endDate: "2025-03-01T00:00:00.000Z" }, 1: { endDate: "" } }, // string date normalised / invalid -> ''
      raportLink: { 0: { registrationIds: '["reg-1","reg-2"]' }, 1: { registrationIds: "[]" } }, // exportFrom (backupHelper.js:495)
    };
    for (const cfg of cfgs) {
      const rows = parseCsv(csv[cfg.csvPrefix]);
      fx[cfg.prismaModel].forEach((fixtureRow, i) => {
        const got = rows[i + 1];
        cfg.fields.forEach((field, col) => {
          const ov = overrides[cfg.prismaModel]?.[i];
          const want = ov && field.key in ov ? ov[field.key] : expectedCell(fixtureRow[field.key]);
          assert.equal(got[col], want, `${cfg.csvPrefix}[${i}].${field.key}`);
        });
      });
    }
  });

  test("registrations.csv exact text: comma/quote/newline escaping, Cyrillic, dates, empties", () => {
    const line1 = [
      "reg-1", "12/345", "2025-01-20T00:00:00.000Z", "2030-01-20T00:00:00.000Z",
      "Иванов Иван Иванович", "Иван", "Иванов", "Иванович", "узбек", "31234567890123", "AA1234567",
      "1985-04-01T00:00:00.000Z", "1985", "г. Ташкент",
      '"г. Ташкент; ул. Навои, д. 5"', // comma -> quoted
      "Завод", "инженер", "accepted", "WAITING", "frm-1", "frm-1", "", "", "registration",
      '"Примечание, с запятой"', // comma -> quoted
      '"Он сказал ""да"""', // quotes doubled
      "  с пробелами  ", // spaces kept, not quoted
      '"Строка 1\nСтрока 2"', // embedded LF -> quoted
      "ДОПУСК", "2026-01-20T00:00:00.000Z", "", "77",
      "2025-03-01T00:00:00.000Z", // "2025-03-01" -> ISO (type 'date')
      "ini-1", "adm-1", "adm-1", C, U,
    ].join(",");
    const line2 = [
      "reg-2", "12/346", "2025-01-21T00:00:00.000Z", "", "Петрова Анна Сергеевна", "Анна", "Петрова", "Сергеевна",
      "", "", "", "", "1990", "", "", "", "", "", "COMPLETED", "", "", "", "", "registration4",
      "", "", "", "", "", "", "", "",
      "", // "not-a-date" -> ''
      "ini-1", "adm-2", "", C, U,
    ].join(",");
    const line3 = [
      "reg-3", "12/347", "", "", "Каримов Алишер", "Алишер", "Каримов", "", "", "", "", "", "", "", "", "", "", "",
      "IN_PROGRESS", "", "", "", "", "registration", "", "", "", "", "", "", "", "", "", "", "", "", C, U,
    ].join(",");
    assert.equal(csv.registrations, `${MODELS[9][3]}\n${line1}\n${line2}\n${line3}\n`);
  });

  test("small CSVs, exact text (0 kept, JSON quoted, booleans, auth_method, bare CR not quoted)", () => {
    assert.equal(
      csv.services,
      "ID,Name,Description,Code,Created At,Updated At\n" +
        `srv-1,Проверка,Сервис проверки,0,${C},${U}\n` + // code 0 is written, not blank
        `srv-2,Архив,,12,${C},${U}\n`
    );
    assert.equal(csv.workplaces, `ID,Name,Created At,Updated At\nwp-1,"ООО ""Ромашка""",${C},${U}\n`);
    assert.equal(
      csv.seans,
      "ID,Admin ID,Resource,IP Address,User Agent,Auth Method,Created At,Updated At\n" +
        `se-1,adm-1,login,192.168.1.10,"Mozilla/5.0 (KHTML, like Gecko)",password,${C},${U}\n`
    );
    // NOTE: csv-writer's needsQuote() only checks , " and \n — a bare \r is
    // written unquoted ("a\rb"), which some CSV readers treat as a row break.
    assert.equal(
      csv.logs,
      "ID,Record ID,Table Name,Field Name,Old Value,New Value,Executor ID,Created At,Updated At\n" +
        `log-1,reg-1,Registration,residence,a\rb,Ташкент,adm-1,${C},${U}\n` +
        `log-2,rel-1,Relatives,notes,,"x\r\ny",adm-2,${C},${U}\n`
    );
    assert.equal(
      csv.raport_links,
      "ID,Raport ID,Reg Number,Code,Delete,Display,Admin Check,Discuss Check,Operator,Notes,Registration IDs,Created At,Updated At\n" +
        `rlk-1,rp-1,12/345,R1,false,true,false,true,false,,"[""reg-1"",""reg-2""]",${C},${U}\n` +
        `rlk-2,rp-1,12/347,R2,true,false,true,false,true,n,[],${C},${U}\n`
    );
    assert.equal(
      csv.raport_types,
      "ID,Name,Code,Code RU,Code UZ,Organization,Requested Organization,Signed FIO,Signed Position,Link,Notes,Executor ID,Data,Created At,Updated At\n" +
        `rty-1,Справка,SPR,Справка,Ma'lumotnoma,Орг,Запр. орг,О. Сидоров,Начальник,,,adm-1,"{""a"":1,""b"":""x, y""}",${C},${U}\n`
    );
    assert.equal(csv.archives, `ID,Name,Data,Executor ID,Created At,Updated At\nar-1,Архив 2024,"[{""id"":""reg-9"",""fullName"":""Удалённый""}]",adm-1,${C},${U}\n`);
    assert.equal(
      csv.relatives.split("\n")[1],
      `rel-1,12/345,Отец,Иванов Иван Петрович,Иван,Иванов,Петрович,,,,1955,true,,,,,,relative,,,,,,reg-1,,,,${C},${U}`
    );
    assert.equal(csv.sessions.split("\n")[1], `ss-1,reg-1,12/345,Иванов Иван Иванович,Иван,Иванов,Иванович,1985,,,,,,,,,,adm-1,RESERVE,2,${C},${U}`);
  });

  test("Cyrillic is stored as raw UTF-8 bytes", () => {
    const buf = extracted.files[csvName("relation_degrees")];
    assert.equal(buf.includes(Buffer.from("Отец", "utf8")), true);
    assert.equal(buf.toString("utf8"), `ID,Name,Created At,Updated At\nrd-1,Отец,${C},${U}\nrd-2,Мать,${C},${U}\nrd-3,Брат,${C},${U}\n`);
  });

  test("admins.csv: unknown keys dropped; password hash and salt ARE exported", () => {
    assert.equal(csv.admins.includes("do-not-export"), false);
    assert.equal(csv.admins.includes("secretInternal"), false);
    // NOTE: the backup carries password hashes, salts (admins) and refresh
    // tokens in clear text inside the ZipCrypto archive.
    assert.equal(
      csv.admins.split("\n")[1],
      `adm-1,superadmin,$2a$10$hashhashhash,1980-05-17T00:00:00.000Z,Рустамович,Азамат,Алиқулов,узбек,майор,male,"Управление, отдел 1",+998901112233,,salt-1,superAdmin,active,${C},${U}`
    );
    assert.equal(csv.refresh_tokens.split("\n")[1], `rt-1,tok.abc.def,adm-1,2025-04-01T00:00:00.000Z,${C},${U}`);
  });
});

describe("csv — pagination by BACKUP_BATCH_SIZE (500)", () => {
  let res;
  let files;
  before(async () => {
    prisma.reset();
    const mk = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: `Имя ${i + 1}`, createdAt: new Date(C), updatedAt: new Date(U) }));
    const logs = mk(503, "log");
    const degrees = mk(500, "rd");
    prisma.when("log.findMany", (a) => logs.slice(a.skip, a.skip + a.take));
    prisma.when("relationDegree.findMany", (a) => degrees.slice(a.skip, a.skip + a.take));
    res = await call(ctrl.exportData, { body: {} });
    files = extractZip(res.sentBuffer, res.headers["x-backup-password"], sandbox.dir("work")).files;
  });

  test("findMany is repeated with skip += batch length until a short/empty page", () => {
    // registerController.js:5039-5058
    assert.deepEqual(prisma.calls("log.findMany"), [
      { skip: 0, take: 500 },
      { skip: 500, take: 500 },
    ]);
    // exactly 500 rows -> a third (empty) page is needed to stop
    assert.deepEqual(prisma.calls("relationDegree.findMany"), [
      { skip: 0, take: 500 },
      { skip: 500, take: 500 },
    ]);
    assert.deepEqual(prisma.calls("admin.findMany"), [{ skip: 0, take: 500 }]);
  });

  test("all pages land in the same CSV, header written once", () => {
    const logs = files[csvName("logs")].toString("utf8").split("\n");
    assert.equal(logs.length, 1 + 503 + 1); // header + rows + trailing ''
    assert.equal(logs.filter((l) => l.startsWith("ID,")).length, 1);
    assert.equal(logs[500], `log-500,,,,,,,${C},${U}`);
    assert.equal(logs[503], `log-503,,,,,,,${C},${U}`);
    const rd = parseCsv(files[csvName("relation_degrees")].toString("utf8"));
    assert.equal(rd.length, 501);
    const info = JSON.parse(res.headers["x-backup-info"]);
    assert.equal(info.counts.logs, 503);
    assert.equal(info.counts.relationDegrees, 500);
    assert.equal(info.counts.admins, 0);
  });

  test("models with zero rows produce NO csv file and no zip entry", () => {
    // NOTE: csv-writer only creates the file on the first writeRecords(); an
    // empty table therefore has no header-only CSV and archiver silently skips
    // the missing path (it emits 'warning', which nobody listens to).
    assert.deepEqual(Object.keys(files).sort(), [csvName("logs"), csvName("relation_degrees")].sort());
    assert.deepEqual(zipEntryNames(res.sentBuffer), [csvName("logs"), csvName("relation_degrees")].sort());
    assert.deepEqual(res.tempBefore, [csvName("logs"), csvName("relation_degrees"), ZIP_NAME].sort());
    assert.deepEqual(res.tempAfter, []);
  });
});

describe("csv — edge cases of the request and an empty database", () => {
  test("no body at all -> defaults to csv", async () => {
    prisma.reset();
    const req = { body: undefined };
    const { fileRes } = require("./_support");
    const res = fileRes();
    await ctrl.exportData(req, res);
    await res.done;
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/zip");
    assert.equal(res.sentFile, path.join(sandbox.backupDir, ZIP_NAME));
  });

  test("empty database -> valid zip with 0 entries, counts all 0, only the zip in temp", async () => {
    prisma.reset();
    const res = await call(ctrl.exportData, { body: { format: "csv" } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(listZipEntries(res.sentBuffer), []);
    const info = JSON.parse(res.headers["x-backup-info"]);
    assert.deepEqual(info.counts, Object.fromEntries(JSON_KEYS.map((k) => [k, 0])));
    assert.deepEqual(info.models, JSON_KEYS);
    assert.deepEqual(res.tempBefore, [ZIP_NAME]);
    assert.deepEqual(res.tempAfter, []);
    assert.equal(prisma.log.length, 23);
  });

  for (const format of ["xml", "CSV", "JSON", "", 1]) {
    test(`format ${JSON.stringify(format)} -> 400, no DB read, no temp dir`, async () => {
      prisma.reset();
      const fresh = sandbox.dir(`pd-invalid-${String(format) || "empty"}`);
      process.env.PROGRAMDATA = fresh;
      const res = await call(ctrl.exportData, { body: { format } });
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { code: 400, message: "Invalid format. Allowed formats: csv, json" }); // :4992-4995
      assert.equal(res.sentFile, null);
      assert.equal(prisma.log.length, 0);
      assert.equal(fs.existsSync(path.join(fresh, "GSPApp")), false);
    });
  }

  test("format null -> default csv is NOT applied (destructuring default only for undefined) -> 400", async () => {
    prisma.reset();
    const res = await call(ctrl.exportData, { body: { format: null } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { code: 400, message: "Invalid format. Allowed formats: csv, json" });
  });
});

describe("format: json — inline export", () => {
  const fx = buildFixtures();
  let res;
  let pd;
  before(async () => {
    seed(fx);
    pd = sandbox.dir("pd-json");
    process.env.PROGRAMDATA = pd;
    res = await call(ctrl.exportData, { body: { format: "json" } });
  });

  test("200 inline JSON, no file, no backup headers", () => {
    assert.equal(res.statusCode, 200);
    assert.equal(res.sentFile, null);
    assert.equal(res.downloaded, null);
    assert.deepEqual(res.headers, {});
    assert.equal(fs.existsSync(path.join(pd, "GSPApp")), false, "getBackupTempDir() is never called");
  });

  test("body shape {success, data:{counts, exportedAt, modelCount}, <jsonKey>: rows...}", () => {
    // registerController.js:5010-5018
    assert.deepEqual(Object.keys(res.body), ["success", "data", ...JSON_KEYS]);
    assert.equal(res.body.success, true);
    assert.deepEqual(Object.keys(res.body.data), ["counts", "exportedAt", "modelCount"]);
    assert.equal(res.body.data.exportedAt, "2026-01-15T09:00:00.000Z");
    assert.equal(res.body.data.modelCount, 23);
    assert.deepEqual(res.body.data.counts, Object.fromEntries(MODELS.map(([m, , k]) => [k, fx[m].length])));
  });

  test("each key holds the raw prisma rows untouched (no CSV serialisation, extra keys kept)", () => {
    for (const [model, , key] of MODELS) assert.deepEqual(res.body[key], fx[model], key);
    assert.equal(res.body.admins[0].secretInternal, "do-not-export");
    assert.equal(res.body.admins[0].password, "$2a$10$hashhashhash");
    assert.equal(res.body.forms[0].status, "yes");
    assert.ok(res.body.registrations[0].createdAt instanceof Date);
  });

  test("findMany without pagination; only raportLink gets the include", () => {
    // NOTE: json mode loads every table fully in one query (no skip/take).
    assert.deepEqual(prisma.log.map((e) => e.key), MODELS.map((m) => `${m[0]}.findMany`));
    for (const [model] of MODELS) {
      const expected = model === "raportLink" ? { include: RAPORT_LINK_INCLUDE } : {};
      assert.deepEqual(prisma.calls(`${model}.findMany`), [expected], model);
    }
  });

  test("empty database -> every key is [] and counts are 0", async () => {
    prisma.reset();
    const r = await call(ctrl.exportData, { body: { format: "json" } });
    for (const k of JSON_KEYS) assert.deepEqual(r.body[k], []);
    assert.deepEqual(r.body.data.counts, Object.fromEntries(JSON_KEYS.map((k) => [k, 0])));
  });

  test("prisma throws -> 500 'Internal server error during export'", async (t) => {
    const err = t.mock.method(console, "error", () => {});
    prisma.reset();
    prisma.when("registration.findMany", () => {
      throw new Error("db down");
    });
    const r = await call(ctrl.exportData, { body: { format: "json" } });
    assert.equal(r.statusCode, 500);
    assert.deepEqual(r.body, { error: "Internal server error during export", message: "db down" }); // :5130-5133
    assert.equal(err.mock.calls[0].arguments[0], "Export error:");
  });
});

describe("temp directory resolution (getBackupTempDir, registerController.js:47-71)", () => {
  test("PROGRAMDATA unusable -> falls back to os.tmpdir()/gspapp/temp", async () => {
    prisma.reset();
    prisma.when("service.findMany", (a) => (a.skip ? [] : [{ id: "srv-1", name: "Проверка" }]));
    const blocked = sandbox.dir("pd-blocked");
    fs.writeFileSync(path.join(blocked, "GSPApp"), "not a dir"); // mkdir GSPApp/temp fails
    const altTmp = sandbox.dir("alt-tmp");
    process.env.PROGRAMDATA = blocked;
    process.env.TEMP = altTmp;
    process.env.TMP = altTmp;
    const res = await call(ctrl.exportData, { body: {} });
    const fallback = path.join(altTmp, "gspapp", "temp");
    assert.equal(res.statusCode, 200);
    assert.equal(res.sentFile, path.join(fallback, ZIP_NAME));
    assert.deepEqual(res.tempBefore, [csvName("services"), ZIP_NAME].sort());
    assert.deepEqual(listDir(fallback), []);
  });

  test("both candidates unusable -> 500 before any DB read", async (t) => {
    const err = t.mock.method(console, "error", () => {});
    prisma.reset();
    const blocked = sandbox.dir("pd-blocked2");
    fs.writeFileSync(path.join(blocked, "GSPApp"), "x");
    const tmpBlocked = sandbox.dir("tmp-blocked");
    fs.writeFileSync(path.join(tmpBlocked, "gspapp"), "x");
    process.env.PROGRAMDATA = blocked;
    process.env.TEMP = tmpBlocked;
    process.env.TMP = tmpBlocked;
    const res = await call(ctrl.exportData, { body: {} });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "Internal server error during export");
    assert.match(res.body.message, /gspapp/i); // last candidate's fs error is surfaced
    assert.equal(prisma.log.length, 0);
    assert.equal(err.mock.callCount(), 1);
  });
});

describe("500 / failure paths of the csv export", () => {
  afterEach(() => archiverSpy.closeOpenStreams());

  test("prisma throws mid-export -> 500; CSVs already written are LEFT in the temp dir", async (t) => {
    const err = t.mock.method(console, "error", () => {});
    const fx = buildFixtures();
    seed(fx);
    prisma.when("registration.findMany", () => {
      throw new Error("connection lost");
    });
    const res = await call(ctrl.exportData, { body: { format: "csv" } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Internal server error during export", message: "connection lost" });
    assert.equal(res.sentFile, null);
    assert.equal(err.mock.calls[0].arguments[0], "Export error:");
    // NOTE: the outer catch (registerController.js:5128) does not delete the
    // CSVs of the models exported before the failure (admin..adminServiceAccess).
    const leftovers = listDir(sandbox.backupDir);
    assert.deepEqual(leftovers, MODELS.slice(0, 9).map((m) => csvName(m[1])).sort());
    for (const f of leftovers) fs.unlinkSync(path.join(sandbox.backupDir, f));
  });

  test("archive error -> 500 'Error creating backup archive', every temp file removed, no headers", async () => {
    seed(buildFixtures());
    archiverSpy.failNext = new Error("disk full");
    const res = await call(ctrl.exportData, { body: {} });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Error creating backup archive", message: "disk full" }); // :5116-5119
    assert.equal(res.sentFile, null);
    assert.equal(res.headers["x-backup-password"], undefined);
    assert.equal(res.headers["content-type"], undefined);
    // NOTE: the zip write stream is never closed on archive error (fd leak);
    // the test closes it before checking the folder.
    assert.equal(archiverSpy.openStreams.length, 1);
    await archiverSpy.closeOpenStreams();
    assert.deepEqual(listDir(sandbox.backupDir), []);
    assert.equal(res.missingFileAttempt, path.join(sandbox.backupDir, ZIP_NAME), "known defect: output close attempts transfer after the archive-error response");
  });

  test("sendFile fails before headers are sent -> 500 'Error sending backup file', files still removed", async (t) => {
    const err = t.mock.method(console, "error", () => {});
    seed(buildFixtures());
    const res = await call(ctrl.exportData, { body: {} }, { sendError: new Error("EPIPE") });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Error sending backup file" }); // :5099
    assert.deepEqual(res.tempAfter, []);
    assert.equal(err.mock.calls.at(-1).arguments[0], "Error sending ZIP file:");
  });

  test("sendFile fails after headers were sent -> no second response, files still removed", async (t) => {
    t.mock.method(console, "error", () => {});
    seed(buildFixtures());
    const res = await call(ctrl.exportData, { body: {} }, { sendError: new Error("ECONNRESET"), headersSent: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined);
    assert.equal(res.tempBefore.length, 24);
    assert.deepEqual(res.tempAfter, []);
  });

  test("each export gets a fresh password", async () => {
    seed(buildFixtures());
    const a = await call(ctrl.exportData, { body: {} });
    const b = await call(ctrl.exportData, { body: {} });
    assert.match(a.headers["x-backup-password"], PASSWORD_RE);
    assert.notEqual(a.headers["x-backup-password"], b.headers["x-backup-password"]);
  });
});

describe('real Express backup transport', () => {
  test('inline JSON serializes dates to ISO, preserves Unicode and sends no attachment headers', async () => {
    const fixtures = buildFixtures();
    seed(fixtures);
    const response = await postViaHttp(ctrl.exportData, { format: 'json' });
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /^application\/json; charset=utf-8$/);
    assert.equal(response.headers['content-disposition'], undefined);
    assert.equal(response.headers['x-backup-password'], undefined);
    assert.equal(response.headers['x-backup-info'], undefined);
    const body = response.json();
    assert.equal(body.data.exportedAt, FROZEN_NOW.toISOString());
    assert.equal(body.data.modelCount, 23);
    assert.deepEqual(body.registrations, JSON.parse(JSON.stringify(fixtures.registration)));
    assert.deepEqual(body.raportLinks, JSON.parse(JSON.stringify(fixtures.raportLink)));
    assert.equal(archiverSpy.created.length, 0);
    assert.deepEqual(listDir(sandbox.backupDir), []);
  });

  test('CSV ZIP is transferred completely before callback removes temporary files', async () => {
    seed({ service: [{ id: 'srv-http', name: 'Транспорт, "ZIP"', code: 0 }] });
    const response = await postViaHttp(ctrl.exportData, { format: 'csv' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'application/zip');
    assert.equal(Number(response.headers['content-length']), response.buffer.length);
    assert.equal(response.headers['content-disposition'], `attachment; filename="${ZIP_NAME}"`);
    const password = response.headers['x-backup-password'];
    assert.match(password, PASSWORD_RE);
    const info = JSON.parse(response.headers['x-backup-info']);
    assert.equal(info.password, password);
    assert.equal(info.counts.services, 1);
    const { files } = extractZip(response.buffer, password, sandbox.dir('http-zip'));
    assert.deepEqual(Object.keys(files), [csvName('services')]);
    assert.deepEqual(parseCsv(files[csvName('services')].toString('utf8'))[1], ['srv-http', 'Транспорт, "ZIP"', '', '0', '', '']);
    assert.deepEqual(listDir(sandbox.backupDir), []);
  });

  test('failed deletion of one CSV is logged and does not prevent deletion of the ZIP and other CSVs', async (t) => {
    seed({ service: [{ id: 'srv-cleanup', name: 'Service' }], form: [{ id: 'form-cleanup', name: 'Form' }] });
    const blocked = path.join(sandbox.backupDir, csvName('services'));
    const unlink = fs.unlinkSync;
    const error = t.mock.method(console, 'error', () => {});
    const spy = t.mock.method(fs, 'unlinkSync', function (file) {
      if (file === blocked) throw Object.assign(new Error('synthetic sharing violation'), { code: 'EBUSY' });
      return unlink.call(this, file);
    });
    try {
      const response = await call(ctrl.exportData, { body: { format: 'csv' } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.tempAfter, [csvName('services')]);
      assert.equal(error.mock.callCount(), 1);
      assert.equal(error.mock.calls[0].arguments[0], 'Error cleaning up backup files:');
      assert.equal(fs.existsSync(response.sentFile), false);
    } finally {
      spy.mock.restore();
      if (fs.existsSync(blocked)) unlink(blocked);
    }
  });
});
