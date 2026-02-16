if (!global.__gspConsoleLogPatched) {
  const originalLog = console.log.bind(console);

  const getCallerFunctionName = () => {
    const previousPrepareStackTrace = Error.prepareStackTrace;
    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const error = new Error();
      Error.captureStackTrace(error, getCallerFunctionName);

      const stack = error.stack || [];
      for (const callSite of stack) {
        const fileName = callSite.getFileName();
        if (!fileName || fileName === __filename) {
          continue;
        }

        return callSite.getFunctionName() || callSite.getMethodName() || "anonymous";
      }
    } catch (err) {
      return "anonymous";
    } finally {
      Error.prepareStackTrace = previousPrepareStackTrace;
    }

    return "anonymous";
  };

  console.log = (...args) => {
    const functionName = getCallerFunctionName();
    originalLog(`[${functionName}]`, ...args);
  };

  global.__gspConsoleLogPatched = true;
}

