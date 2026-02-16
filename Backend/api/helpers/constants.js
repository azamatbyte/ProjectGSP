const { getEnv } = require('../../config/env');
const env = getEnv();

exports.MODEL_TYPE = {
  REGISTRATION: "registration",
  REGISTRATION_FOUR: "registration4",
  RELATIVE: "relative",
  RELATIVEWITHOUT: "relativeWithoutAnalysis",
};

exports.MODEL_STATUS = {
  WAITING: "WAITING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

exports.ACCESS_STATUS = {
  PROVERKA: "ПРОВЕРКА",
  CONCLUSION: "ЗАКЛЮЧЕНИЕ",
};

exports.SERVER_URL = env.SERVER_URL;




