const nodemailer = require("nodemailer");
const { getEnv } = require("../../config/env");
const env = getEnv();


// require('../logs/server.log')
module.exports = function sendmail(email,code){
  var transportar = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.EMAILCOMPANY, // Your Gmail ID
      pass: env.EMAILPASSWORD,         // Your Gmail Password
    },
  });
  
  // Deifne mailing options like Sender Email and Receiver.
  var mailOptions = {
    from: env.EMAILCOMPANY, // Sender ID
    to: email, // Reciever ID
    subject: "Verification code", // Mail Subject
    html: "<h1>Welcome User</h1><p>Your verification code is</p><h1>"+code+"</h1>", // Description
  };
  
  // Send an Email
  transportar.sendMail(mailOptions, (error, info) => {
    if (error) console.log(error);
    // console.log(info);
  });
}
