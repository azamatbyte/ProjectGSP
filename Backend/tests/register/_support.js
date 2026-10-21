// Local helpers for the register/globalSearchExport tests (shared helpers in
// tests/helpers stay untouched).
//
//   installFakePrisma() must already have run before loadController().
//   strictRes()          mockRes() that validates header values like Node's
//                        http.ServerResponse (ERR_INVALID_CHAR on non-latin1).
//   callExport(ctrl, body, { userId, res })  -> finished res
//   postViaPipe(handler, body)               -> { status, headers, body }
//                        real Express + real http over a named pipe (no TCP,
//                        so the loopback MITM proxy on this machine can't interfere).
const http = require("http");
const os = require("os");
const path = require("path");
const { mockReq, mockRes } = require("../helpers/http");

const BACKEND = path.resolve(__dirname, "../..");

// The executor (admin) looked up by req.userId. Latin like the seeded superadmin,
// because a Cyrillic name breaks the Content-Disposition header (see NOTE in the test).
const EXECUTOR = {
  username: "superadmin",
  last_name: "Admin",
  first_name: "Super",
  father_name: null,
};

const CYRILLIC_EXECUTOR = {
  username: "aliqulov",
  last_name: "Алиқулов",
  first_name: "Азамат",
  father_name: "Баходирович",
};

const LONG_NOTES = "Сведения о судимости отсутствуют, компрматериалов не выявлено"; // 61 chars -> width cap 40

// Rows exactly as buildSearchExportQuery's SELECT returns them (lower-cased
// aliases because Postgres folds unquoted identifiers: relationDegree ->
// relationdegree, updatedAt -> updatedat).
function exportRows() {
  const initiator = {
    initiator_last_name: "Иванов",
    initiator_first_name: "Пётр",
    initiator_father_name: "Сергеевич",
  };
  const executor = {
    executor_last_name: "Алиқулов",
    executor_first_name: "Азамат",
    executor_father_name: null,
  };
  const regShared = {
    form_reg: "Ф-4",
    form_reg_log: "01.02.2019",
    reg_number: "1708-19",
    reg_date: new Date("2019-02-01T00:00:00Z"),
    reg_end_date: new Date("2019-03-01T21:30:00Z"), // after 19:00 UTC -> next day in Tashkent
    access_status: "ДОПУСК",
    expired: new Date("2024-02-01T00:00:00Z"),
    complete_status: "COMPLETED",
    passport: "AA1234567",
    conclusion_reg_num: "З-15",
  };
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      model_name: "registration",
      relationdegree: null,
      ...regShared,
      full_name: "Каримов Шерзод Алишерович",
      birth_date: new Date("1985-03-12T00:00:00Z"),
      birth_year: 1985,
      pinfl: "31203851234567",
      birth_place: "г. Ташкент",
      workplace: "АО Узбекнефтегаз",
      positionv1: "инженер",
      notes: LONG_NOTES,
      residence: "г. Ташкент, Юнусабадский р-н",
      ...initiator,
      ...executor,
      updatedat: new Date("2026-01-10T12:34:56Z"),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      model_name: "relative",
      relationdegree: "Отец",
      ...regShared,
      full_name: "Каримов Алишер Рустамович",
      birth_date: null,
      birth_year: 1958,
      pinfl: "",
      birth_place: "Самаркандская обл.",
      workplace: "  Пенсионер  ",
      positionv1: null,
      notes: null,
      residence: "г. Ташкент, Юнусабадский р-н",
      ...initiator,
      ...executor,
      updatedat: new Date("2026-01-11T20:00:00Z"),
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      model_name: "relative",
      relationdegree: "Мать",
      ...regShared,
      full_name: "Каримова Дилноза Ахмедовна",
      birth_date: null,
      birth_year: null,
      pinfl: "41505601234567",
      birth_place: null,
      workplace: null,
      positionv1: "учитель",
      notes: "",
      residence: null,
      ...initiator,
      ...executor,
      updatedat: null,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      model_name: "registration",
      relationdegree: null,
      form_reg: "Ф-1",
      form_reg_log: null,
      reg_number: "2045-24",
      reg_date: new Date("2024-05-20T20:15:00Z"),
      reg_end_date: null,
      access_status: null,
      expired: null,
      complete_status: "WAITING",
      passport: null,
      conclusion_reg_num: null,
      full_name: "Юсупова Малика Рашидовна",
      birth_date: "1990-07-04T00:00:00.000Z", // string dates go through new Date() too
      birth_year: 1990,
      pinfl: "40407901234567",
      birth_place: "г. Бухара",
      workplace: "ООО Бухоро Савдо",
      positionv1: "  бухгалтер ",
      notes: "нет",
      residence: "г. Бухара",
      initiator_last_name: null,
      initiator_first_name: null,
      initiator_father_name: null,
      executor_last_name: null,
      executor_first_name: null,
      executor_father_name: null,
      updatedat: new Date("2026-01-14T23:59:59Z"),
    },
  ];
}

// mockRes + Node's real header validation (express res.setHeader ends in
// http.OutgoingMessage.setHeader, which throws ERR_INVALID_CHAR for chars > 0xFF).
function strictRes() {
  const res = mockRes();
  const set = res.setHeader;
  res.setHeader = res.set = res.header = (k, v) => {
    if (typeof k === "string") {
      http.validateHeaderName(k);
      http.validateHeaderValue(k, v);
    }
    return set(k, v);
  };
  return res;
}

async function callExport(ctrl, body, { userId = "admin-super-id", res = strictRes() } = {}) {
  await ctrl.globalSearchExport(mockReq({ body, userId }), res);
  await res.done;
  return res;
}

let pipeSeq = 0;
function pipePath() {
  pipeSeq += 1;
  const name = `gsp-register-test-${process.pid}-${pipeSeq}`; // no Date.now(): tests freeze Date
  return process.platform === "win32" ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), `${name}.sock`);
}

// Mounts `handler` on a real Express app and POSTs `body` to it over a pipe.
async function postViaPipe(handler, body, { userId = "admin-super-id" } = {}) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.post(
    "/api/v1/register/globalSearchExport",
    (req, _res, next) => {
      req.userId = userId;
      next();
    },
    handler
  );
  const socketPath = pipePath();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(socketPath, r));
  try {
    return await new Promise((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify(body));
      const req = http.request(
        {
          socketPath,
          method: "POST",
          path: "/api/v1/register/globalSearchExport",
          agent: false,
          headers: { "content-type": "application/json", "content-length": payload.length, connection: "close" },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        }
      );
      req.on("error", reject);
      req.end(payload);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

module.exports = {
  BACKEND,
  EXECUTOR,
  CYRILLIC_EXECUTOR,
  LONG_NOTES,
  exportRows,
  strictRes,
  callExport,
  postViaPipe,
};
