// Explicit discovery avoids running support modules as tests on Node 22.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name.endsWith(".test.js") ? [file] : [];
  });
}
const files = [...discover(path.join(root, "tests")), ...discover(path.join(root, "api/helpers"))].sort();
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, TZ: "Asia/Tashkent", NODE_ENV: "test",
    SERVER_URL: "https://documents.test.invalid",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/document_tests",
    JWT_SECRET: "document-tests-only" },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
