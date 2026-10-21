const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createFakePrisma } = require("../helpers/fakePrisma");
const { startServer } = require("../helpers/pipeServer");
const endpoints = require("../helpers/documentEndpoints");
const prisma = createFakePrisma();
const secret = "document-route-tests-only-not-a-real-secret";
const root = path.resolve(__dirname, "../..");
function replace(relative, exports) {
  const id = require.resolve(path.join(root, relative));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const prismaId = require.resolve("@prisma/client");
require.cache[prismaId] = { id: prismaId, filename: prismaId, loaded: true,
  exports: { PrismaClient: function () { return prisma; } } };
replace("config/auth.config.js", { secret });
let invocations = [];
for (const controller of new Set([...endpoints.map((e) => e.controller), "authController"])) {
  replace(`api/controllers/${controller}.js`, new Proxy({}, {
    get(_obj, handler) {
      return (req, res) => {
        invocations.push({ controller, handler, userId: req.userId });
        res.json({ controller, handler, userId: req.userId, body: req.body });
      };
    },
  }));
}
replace("api/middleware/request_limitter.js", {
  loginLimiter: (_req, _res, next) => next(), passwordLimiter: (_req, _res, next) => next(), refreshLimiter: (_req, _res, next) => next(),
});
let server;
before(async () => {
  const app = express();
  app.use(express.json());
  for (const mount of new Set(endpoints.map((e) => e.mount))) {
    const e = endpoints.find((item) => item.mount === mount);
    app.use(`/api/v1/${mount}`, require(path.join(root, `api/router/${e.router}.js`)));
  }
  server = await startServer(app);
});
after(async () => { if (server) await server.close(); });
function actor(role, serviceAccess = false) {
  prisma.reset(); invocations = [];
  prisma.when("admin.findUnique", role ? { id: "test-actor", role } : null);
  prisma.when("adminServiceAccess.findFirst", serviceAccess ? { id: "grant", service: { code: 3 } } : null);
}
function token(options = {}) { return jwt.sign({ id: "test-actor" }, secret, { expiresIn: "1h", ...options }); }
for (const e of endpoints) {
  test(`${e.method} ${e.url}: actual router binds ${e.handler} behind JWT/access middleware`, async (t) => {
    await t.test("missing token blocks handler before database access", async () => {
      actor("superAdmin");
      const r = await server.request(e.url, { method: "POST", body: {} });
      assert.equal(r.status, 403); assert.equal(r.json().message, "No token provided!");
      assert.equal(invocations.length, 0); assert.equal(prisma.log.length, 0);
    });
    for (const [label, value] of [["invalid", "bad-token"], ["expired", token({ expiresIn: -1 })]]) {
      await t.test(`${label} token blocks handler`, async () => {
        actor("superAdmin");
        const r = await server.request(e.url, { method: "POST", body: {}, headers: { "x-access-token": value } });
        assert.equal(r.status, 401); assert.equal(invocations.length, 0); assert.equal(prisma.log.length, 0);
      });
    }
    await t.test("superAdmin dispatches expected handler with body and identity", async () => {
      actor("superAdmin");
      const body = { fixture: "Cyrillic: Тест", ids: ["synthetic-id"] };
      const r = await server.request(e.url, { method: "POST", body, headers: { "x-access-token": token() } });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json(), { controller: e.controller, handler: e.handler, userId: "test-actor", body });
      assert.equal(invocations.length, 1);
    });
    if (e.access !== "token") {
      await t.test("unknown user cannot invoke generator", async () => {
        actor(null);
        const r = await server.request(e.url, { method: "POST", body: {}, headers: { "x-access-token": token() } });
        assert.equal(r.status, 401); assert.equal(invocations.length, 0);
      });
      await t.test("insufficient role/service blocks generator", async () => {
        actor(e.access === "superAdmin" ? "admin" : "viewer");
        const r = await server.request(e.url, { method: "POST", body: {}, headers: { "x-access-token": token() } });
        assert.equal(r.status, e.access === "service3" ? 401 : 406); assert.equal(invocations.length, 0);
      });
    }
    if (e.access === "admin" || e.access === "service3") {
      await t.test("authorized admin dispatches generator", async () => {
        actor("admin", e.access === "service3");
        const r = await server.request(e.url, { method: "POST", body: {}, headers: { "x-access-token": token() } });
        assert.equal(r.status, 200); assert.equal(invocations.length, 1);
        if (e.access === "service3") assert.equal(prisma.calls("adminServiceAccess.findFirst")[0].where.service.code, 3);
      });
    }
    await t.test("wrong HTTP method cannot invoke generator", async () => {
      actor("superAdmin");
      const r = await server.request(e.url, { headers: { "x-access-token": token() } });
      assert.equal(r.status, 404); assert.equal(invocations.length, 0);
    });
  });
}
test("inventory includes exactly 23 unique document generators", () => {
  assert.equal(endpoints.length, 23);
  assert.equal(new Set(endpoints.map((e) => e.url)).size, 23);
});
