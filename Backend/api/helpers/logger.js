const path = require('path');
const { createLogger, format, transports, config } = require('winston');
const { getEnv } = require('../../config/env');
const { combine, timestamp, json } = format;
const env = getEnv();

const logDir = env.NODE_ENV === 'production' && env.PROGRAM_DATA
  ? path.join(env.PROGRAM_DATA, 'GSPApp', 'logs')
  : './logs';

const userLogger = createLogger({
  levels: config.syslog.levels,
  transports: [
      // new transports.Console(),
      new transports.File({ filename: path.join(logDir, 'server.log') })
    ]
});
const paymentLogger = createLogger({
  transports: [
      new transports.Console()
    ]
});

module.exports = {
userLogger: userLogger,
paymentLogger: paymentLogger
};
