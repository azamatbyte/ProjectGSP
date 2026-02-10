const path = require('path');
const { createLogger, format, transports, config } = require('winston');
const { combine, timestamp, json } = format;

const logDir = process.env.NODE_ENV === 'production' && process.env.ProgramData
  ? path.join(process.env.ProgramData, 'GSPApp', 'logs')
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