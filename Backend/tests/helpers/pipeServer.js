const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
let sequence = 0;
async function startServer(app) {
  const name = `gsp-doc-tests-${process.pid}-${++sequence}`;
  const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), `${name}.sock`);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  return {
    request(url, { method = "GET", headers = {}, body } = {}) {
      return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        const req = http.request({ socketPath, path: url, method, agent: false,
          headers: { connection: "close", ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {}), ...headers },
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve({ status: res.statusCode, headers: res.headers, buffer,
              json: () => JSON.parse(buffer.toString("utf8")) });
          });
        });
        req.setTimeout(10000, () => req.destroy(new Error("Test HTTP request timed out")));
        req.on("error", reject);
        req.end(payload);
      });
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}
module.exports = { startServer };
