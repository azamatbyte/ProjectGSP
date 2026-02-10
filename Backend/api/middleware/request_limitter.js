const rateLimit = require("express-rate-limit");


//request limitter
module.exports = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minut window
    max: 15, // start blocking after 25 requests
    message:
      "Too many accounts created from this IP, please try again after an hour"
  });