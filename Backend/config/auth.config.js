const { getEnv } = require("./env");

const env = getEnv();

// Dev-only fallback so a fresh clone boots without setup. Production must supply
// a real per-installation JWT_SECRET — a shared/known secret lets anyone forge a
// token for any account, including superAdmin.
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-do-not-use-in-production";

if (!env.JWT_SECRET && env.NODE_ENV === "production") {
  throw new Error(
    "JWT_SECRET is not set. Generate one per installation, e.g.\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
      "and add it to Backend/.env before starting in production."
  );
}

if (!env.JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET is not set — falling back to an insecure development secret."
  );
}

const ONE_HOUR_IN_SECONDS = 60 * 60;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

module.exports = {
  secret: env.JWT_SECRET || DEV_FALLBACK_SECRET,

  // jwt.sign expiresIn, in seconds.
  jwtExpiration: ONE_HOUR_IN_SECONDS,

  // Added to Date.now() for the RefreshToken.expiredAt column, so this must be
  // in MILLISECONDS and must match the refresh token's own "1d" JWT expiry.
  jwtRefreshExpiration: ONE_DAY_IN_MS,
};
