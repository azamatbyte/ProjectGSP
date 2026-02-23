const prisma = require("../../db/database");

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupExpiredRefreshTokens() {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { expiredAt: { lt: new Date() } },
    });

    if (result?.count) {
      console.log(
        `[refreshTokenCleanup] Removed ${result.count} expired refresh tokens.`
      );
    }
  } catch (error) {
    console.error("[refreshTokenCleanup] Cleanup failed:", error);
  }
}

function startRefreshTokenCleanup() {
  cleanupExpiredRefreshTokens();

  const interval = setInterval(
    cleanupExpiredRefreshTokens,
    CLEANUP_INTERVAL_MS
  );

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  return interval;
}

module.exports = {
  startRefreshTokenCleanup,
};
