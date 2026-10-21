// Minimal Express req/res doubles for calling a controller handler directly.
//
//   const res = mockRes();
//   await ctrl.generateUPK(mockReq({ body: {...}, userId: "admin-1" }), res);
//   await res.done;            // resolves on json/send/download/sendFile/end
//   res.statusCode, res.body, res.headers, res.downloaded
function mockReq({ body = {}, query = {}, params = {}, headers = {}, userId = "test-admin-id", user } = {}) {
  return {
    body,
    query,
    params,
    headers,
    userId,
    user,
    protocol: "http",
    get: (h) => headers[String(h).toLowerCase()] || (String(h).toLowerCase() === "host" ? "localhost:8080" : undefined),
    header(h) {
      return this.get(h);
    },
  };
}

function mockRes() {
  let resolveDone;
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    downloaded: null,
    sentFile: null,
    finished: false,
    done: null,
  };
  res.done = new Promise((r) => (resolveDone = r));
  const finish = () => {
    res.finished = true;
    resolveDone(res);
    return res;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.sendStatus = (code) => {
    res.statusCode = code;
    return finish();
  };
  res.set = res.header = res.setHeader = (k, v) => {
    if (typeof k === "object") Object.entries(k).forEach(([kk, vv]) => (res.headers[kk.toLowerCase()] = vv));
    else res.headers[String(k).toLowerCase()] = v;
    return res;
  };
  res.getHeader = (k) => res.headers[String(k).toLowerCase()];
  res.type = (t) => res.set("content-type", t);
  res.attachment = (name) => res.set("content-disposition", `attachment; filename="${name}"`);
  res.json = (b) => {
    res.body = b;
    return finish();
  };
  res.send = (b) => {
    res.body = b;
    return finish();
  };
  res.end = (b) => {
    if (b !== undefined) res.body = b;
    return finish();
  };
  res.write = (chunk) => {
    res.body = Buffer.concat([res.body || Buffer.alloc(0), Buffer.from(chunk)]);
    return true;
  };
  res.download = (p, name, cb) => {
    res.downloaded = { path: p, name };
    if (typeof cb === "function") cb();
    return finish();
  };
  res.sendFile = (p, opts, cb) => {
    res.sentFile = p;
    const done = typeof opts === "function" ? opts : cb;
    if (typeof done === "function") done();
    return finish();
  };
  res.on = () => res;
  res.once = () => res;
  res.emit = () => true;
  return res;
}

module.exports = { mockReq, mockRes };
