// In-memory stand-in for the shared Prisma client (db/database.js) so
// document-generator tests never touch the real database.
//
//   const prisma = installFakePrisma();          // BEFORE requiring a controller
//   prisma.when("registration.findUnique", (args) => ({ id: args.where.id, ... }));
//   prisma.when("signList.findMany", [signer]);  // a plain value works too
//   const ctrl = require("../../api/controllers/raportController");
//   ...
//   prisma.calls("raport.create")                // -> [args, ...]
//
// Unconfigured calls get a harmless default: findMany -> [], findUnique/
// findFirst -> null, count -> 0, create/update/upsert -> { id: "fake-<model>-<n>", ...data },
// createMany/updateMany/deleteMany -> { count: 0 }, aggregate/groupBy -> {} / [].
const path = require("path");

const DB_MODULE = path.resolve(__dirname, "../../db/database.js");

function defaultResult(model, method, args, seq) {
  switch (method) {
    case "findMany":
    case "groupBy":
      return [];
    case "findUnique":
    case "findFirst":
    case "findUniqueOrThrow":
    case "findFirstOrThrow":
      return null;
    case "count":
      return 0;
    case "aggregate":
      return {};
    case "create":
    case "update":
    case "upsert":
      return { id: `fake-${model}-${seq}`, ...((args && (args.data || args.create)) || {}) };
    case "delete":
      return { id: `fake-${model}-${seq}` };
    case "createMany":
    case "updateMany":
    case "deleteMany":
      return { count: 0 };
    default:
      return null;
  }
}

function createFakePrisma() {
  const handlers = new Map();
  // `log` is also a real Prisma model. Preserve array call-history access while
  // exposing model methods (e.g. backup's prisma.log.findMany).
  const log = new Proxy([], {
    get(target, prop, receiver) {
      if (prop in target || typeof prop !== "string" || prop === "then") return Reflect.get(target, prop, receiver);
      return (args) => call(`log.${prop}`, args);
    },
  });
  let seq = 0;

  const call = async (key, args) => {
    seq += 1;
    log.push({ key, args });
    const [model, method] = key.split(".");
    if (handlers.has(key)) {
      const h = handlers.get(key);
      return typeof h === "function" ? h(args, seq) : structuredCloneSafe(h);
    }
    return defaultResult(model, method, args, seq);
  };

  const modelProxy = (model) =>
    new Proxy(
      {},
      {
        get(_t, method) {
          if (typeof method !== "string") return undefined;
          return (args) => call(`${model}.${method}`, args);
        },
      }
    );

  const models = new Map();
  const fake = {
    when(key, handler) {
      handlers.set(key, handler);
      return fake;
    },
    calls(key) {
      return log.filter((e) => e.key === key).map((e) => e.args);
    },
    get log() {
      return log;
    },
    reset() {
      handlers.clear();
      log.length = 0;
      seq = 0;
    },
    // Raw SQL entry points share one key each.
    $queryRaw: (...a) => call("$queryRaw", a),
    $queryRawUnsafe: (...a) => call("$queryRawUnsafe", a),
    $executeRaw: (...a) => call("$executeRaw", a),
    $executeRawUnsafe: (...a) => call("$executeRawUnsafe", a),
    $transaction: async (arg) => (typeof arg === "function" ? arg(proxy) : Promise.all(arg)),
    $connect: async () => {},
    $disconnect: async () => {},
    connectDatabase: async () => true,
    disconnectDatabase: async () => {},
  };

  const proxy = new Proxy(fake, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (!models.has(prop)) models.set(prop, modelProxy(prop));
      return models.get(prop);
    },
  });
  return proxy;
}

function structuredCloneSafe(v) {
  try {
    return structuredClone(v);
  } catch {
    return v;
  }
}

// Puts the fake into require.cache under db/database.js so every controller
// that does `require('../../db/database')` gets it. Call before requiring them.
function installFakePrisma() {
  const fake = createFakePrisma();
  require.cache[DB_MODULE] = {
    id: DB_MODULE,
    filename: DB_MODULE,
    loaded: true,
    exports: fake,
  };
  return fake;
}

module.exports = { installFakePrisma, createFakePrisma, DB_MODULE };
