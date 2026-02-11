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

exports.SERVER_URL = process.env.SERVER_URL
  || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 8080}`;




