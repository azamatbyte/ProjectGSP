const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Document, Paragraph, Packer } = require("docx");
const ExcelJS = require("exceljs");
const { startServer } = require("../helpers/pipeServer");
const { inspectDocx } = require("../helpers/docxInspector");
const root = path.resolve(__dirname, "../..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gsp-download-test-"));
const uploads = path.join(temp, "uploads");
fs.mkdirSync(uploads);
fs.writeFileSync(path.join(temp, "outside.txt"), "MUST NOT BE SERVED");
function replace(id, exports) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
replace(require.resolve("../../api/router"), express.Router());
replace(require.resolve("../../api/helpers/constants"), { SERVER_URL: "https://test.invalid" });
replace(require.resolve("swagger-jsdoc"), () => ({}));
replace(require.resolve("swagger-ui-express"), { serve: (_req, _res, next) => next(), setup: () => (_req, _res, next) => next() });
let server, word, sheet;
before(async () => {
  word = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Тест downloadable document")] }] }));
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Fixture").getCell("A1").value = "Synthetic data";
  sheet = Buffer.from(await workbook.xlsx.writeBuffer());
  fs.writeFileSync(path.join(uploads, "fixture.docx"), word);
  fs.writeFileSync(path.join(uploads, "fixture.xlsx"), sheet);
  // The real download middleware serves only this private fixture directory.
  const realStatic = express.static;
  express.static = (dir, opts) => realStatic(path.resolve(dir) === path.join(root, "uploads") ? uploads : path.join(temp, "empty-build"), opts);
  const app = express();
  try { require("../../app/registerRoutes").registerRoutes(app); }
  finally { express.static = realStatic; }
  server = await startServer(app);
});
after(async () => {
  if (server) await server.close();
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temp, { recursive: true, force: true });
});
for (const ext of ["docx", "xlsx"]) {
  test(`download serves exact ${ext} bytes, MIME, attachment and cache without authentication`, async () => {
    const r = await server.request(`/api/v1/download/fixture.${ext}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.buffer, ext === "docx" ? word : sheet);
    assert.equal(r.headers["content-type"], `application/vnd.openxmlformats-officedocument.${ext === "docx" ? "wordprocessingml.document" : "spreadsheetml.sheet"}`);
    assert.equal(r.headers["content-disposition"], `attachment; filename="fixture.${ext}"; filename*=UTF-8''fixture.${ext}`);
    assert.equal(r.headers["cache-control"], "public, max-age=300");
    if (ext === "docx") assert.match(inspectDocx(r.buffer).text, /Тест downloadable document/);
  });
}
test("custom Unicode filename preserves original extension and RFC 5987 name", async () => {
  const name = "Отчёт 2026.pdf";
  const r = await server.request(`/api/v1/download/fixture.docx?newFileName=${encodeURIComponent(name)}`);
  assert.equal(r.status, 200);
  const disposition = r.headers["content-disposition"];
  assert.ok(disposition.endsWith(`filename*=UTF-8''${encodeURIComponent("Отчёт 2026.docx")}`));
  assert.match(disposition, /^attachment; filename="[\x20-\x7E]+\.docx";/);
  assert.deepEqual(r.buffer, word);
});
test("rename strips path components and invalid filename characters", async () => {
  const r = await server.request(`/api/v1/download/fixture.xlsx?newFileName=${encodeURIComponent("../../safe:*?file.exe")}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-disposition"], "attachment; filename=\"safe_file.xlsx\"; filename*=UTF-8''safe_file.xlsx");
});
test("blank requested filename uses download fallback", async () => {
  const r = await server.request("/api/v1/download/fixture.docx?newFileName=%20%20");
  assert.equal(r.headers["content-disposition"], "attachment; filename=\"download.docx\"; filename*=UTF-8''download.docx");
});
test("HEAD retains content length and headers with no body", async () => {
  const r = await server.request("/api/v1/download/fixture.docx", { method: "HEAD" });
  assert.equal(r.status, 200); assert.equal(r.buffer.length, 0);
  assert.equal(Number(r.headers["content-length"]), word.length);
});
test("byte range returns requested bytes", async () => {
  const r = await server.request("/api/v1/download/fixture.docx", { headers: { range: "bytes=0-3" } });
  assert.equal(r.status, 206); assert.equal(r.buffer.toString("hex"), "504b0304");
  assert.equal(r.headers["content-range"], `bytes 0-3/${word.length}`);
});
test("missing document is a 404 without file bytes", async () => {
  const r = await server.request("/api/v1/download/missing.docx");
  assert.equal(r.status, 404); assert.equal(r.json().error, "Frontend build not found");
});
test("encoded traversal cannot escape the download directory", async () => {
  const r = await server.request("/api/v1/download/%2e%2e%2foutside.txt");
  assert.equal(r.status, 404); assert.ok(!r.buffer.toString().includes("MUST NOT BE SERVED"));
});
test("non-download API responses retain no-store cache control", async () => {
  const r = await server.request("/api/v1/unknown");
  assert.equal(r.headers["cache-control"], "no-store");
});
