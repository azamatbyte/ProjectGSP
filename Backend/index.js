require('./api/helpers/consoleLogWithFunctionName');

const { getEnv } = require('./config/env');
const env = getEnv();

const { createApp } = require('./app/createApp');
const { connectDatabase, disconnectDatabase } = require('./db/database');
const { registerProcessLifecycle, exitProcess } = require('./core/processLifecycle');
const { startRefreshTokenCleanup } = require('./api/helpers/refreshTokenCleanup');

const PORT = env.PORT;
const HOST = env.HOST;
const SERVER_URL = env.SERVER_URL;

async function bootstrap() {
  await connectDatabase();

  const refreshTokenCleanupInterval = startRefreshTokenCleanup();

  registerProcessLifecycle({
    onShutdown: async () => {
      if (refreshTokenCleanupInterval) {
        clearInterval(refreshTokenCleanupInterval);
      }
      await disconnectDatabase();
    }
  });

  const app = createApp();
  app.listen(PORT, HOST, (err) => {
    if (err) {
      console.log(`Error:${err}`);
      return;
    }
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log(`Public URL ${SERVER_URL}/api/v1/api-docs`);
  });
}

bootstrap().catch(async (error) => {
  console.error('Backend bootstrap failed:', error);
  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    console.error('Error while disconnecting DB after bootstrap failure:', disconnectError);
  }
  exitProcess(1);
});
