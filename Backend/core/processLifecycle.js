let terminating = false;

function exitProcess(code) {
  if (terminating) {
    return;
  }

  terminating = true;
  process.exit(code);
}

function registerProcessLifecycle({ onShutdown } = {}) {
  async function safeShutdown() {
    if (typeof onShutdown !== 'function') {
      return;
    }

    try {
      await onShutdown();
    } catch (error) {
      console.error('Shutdown cleanup failed:', error);
    }
  }

  process.on('beforeExit', async () => {
    await safeShutdown();
  });

  process.on('SIGINT', async () => {
    await safeShutdown();
    exitProcess(0);
  });

  process.on('SIGTERM', async () => {
    await safeShutdown();
    exitProcess(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await safeShutdown();
    exitProcess(1);
  });

  process.on('unhandledRejection', async (error) => {
    console.error('Unhandled rejection:', error);
    await safeShutdown();
    exitProcess(1);
  });
}

module.exports = {
  exitProcess,
  registerProcessLifecycle,
};
