const prisma = require("../../db/database");

const REGISTER4_SIMILARITY_THRESHOLD_KEY = "register4_similarity_threshold_percent";
const REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT = 75;
const REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT = 50;
const REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT = 100;

const SYSTEM_SETTING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

function parseThresholdPercent(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeThresholdPercent(rawValue, fallback = REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT) {
  const fallbackParsed = parseThresholdPercent(fallback);
  const safeFallback = Number.isInteger(fallbackParsed)
    ? Math.min(
      REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT,
      Math.max(REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT, fallbackParsed)
    )
    : REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT;

  const parsed = parseThresholdPercent(rawValue);
  if (!Number.isInteger(parsed)) {
    return safeFallback;
  }

  return Math.min(
    REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT,
    Math.max(REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT, parsed)
  );
}

function validateRegister4SimilarityThresholdPercent(rawValue) {
  const parsed = parseThresholdPercent(rawValue);
  if (!Number.isInteger(parsed)) {
    return {
      valid: false,
      value: null,
      message: "threshold_percent must be an integer",
    };
  }

  if (
    parsed < REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT ||
    parsed > REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT
  ) {
    return {
      valid: false,
      value: null,
      message: `threshold_percent must be between ${REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT} and ${REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT}`,
    };
  }

  return {
    valid: true,
    value: parsed,
    message: "",
  };
}

async function ensureSystemSettingTable() {
  await prisma.$executeRawUnsafe(SYSTEM_SETTING_TABLE_SQL);
}

async function getSystemSetting(key) {
  await ensureSystemSettingTable();

  const rows = await prisma.$queryRaw`
    SELECT
      "key",
      "value",
      "createdAt",
      "updatedAt"
    FROM "SystemSetting"
    WHERE "key" = ${key}
    LIMIT 1
  `;

  return rows?.[0] || null;
}

async function upsertSystemSetting(key, value) {
  await ensureSystemSettingTable();

  const rows = await prisma.$queryRaw`
    INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${key}, ${value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING
      "key",
      "value",
      "createdAt",
      "updatedAt"
  `;

  return rows?.[0] || null;
}

async function getRegister4SimilarityThresholdPercent() {
  try {
    const row = await getSystemSetting(REGISTER4_SIMILARITY_THRESHOLD_KEY);
    return normalizeThresholdPercent(
      row?.value,
      REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT
    );
  } catch (error) {
    return REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT;
  }
}

async function setRegister4SimilarityThresholdPercent(rawValue) {
  const validation = validateRegister4SimilarityThresholdPercent(rawValue);
  if (!validation.valid) {
    const error = new Error(validation.message);
    error.statusCode = 400;
    throw error;
  }

  const nextValue = validation.value;
  await upsertSystemSetting(REGISTER4_SIMILARITY_THRESHOLD_KEY, String(nextValue));
  return nextValue;
}

function toRegister4SimilarityThresholdRatio(rawPercent) {
  const percent = normalizeThresholdPercent(
    rawPercent,
    REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT
  );

  return percent / 100;
}

module.exports = {
  REGISTER4_SIMILARITY_THRESHOLD_KEY,
  REGISTER4_SIMILARITY_THRESHOLD_DEFAULT_PERCENT,
  REGISTER4_SIMILARITY_THRESHOLD_MIN_PERCENT,
  REGISTER4_SIMILARITY_THRESHOLD_MAX_PERCENT,
  normalizeThresholdPercent,
  validateRegister4SimilarityThresholdPercent,
  getRegister4SimilarityThresholdPercent,
  setRegister4SimilarityThresholdPercent,
  toRegister4SimilarityThresholdRatio,
};
