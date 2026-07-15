const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const tooMany = (res, message) =>
  res.status(429).json({ code: 429, message });

/**
 * Brute-force protection for credential endpoints.
 *
 * Keyed by IP + username so one noisy IP (an on-prem NAT, a shared kiosk) cannot
 * lock every account out — only repeated attempts against the SAME account from
 * the same IP get throttled.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed logins count toward the limit
  // ipKeyGenerator normalizes IPv6 to its /56 subnet — keying on the raw address
  // would let an IPv6 client sidestep the limit by rotating within its own range.
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${req.body?.username || "unknown"}`,
  handler: (req, res) =>
    tooMany(res, "Too many failed sign-in attempts. Please try again later."),
});

/**
 * Password-change attempts are already authenticated, so key on the account and
 * throttle guessing of the CURRENT password.
 */
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // verifyToken runs before this limiter, so req.userId is set for real callers.
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  handler: (req, res) =>
    tooMany(res, "Too many password attempts. Please try again later."),
});

/** Guards the token-refresh endpoint against being used as an oracle. */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    tooMany(res, "Too many refresh attempts. Please try again later."),
});

module.exports = {
  loginLimiter,
  passwordLimiter,
  refreshLimiter,
};
