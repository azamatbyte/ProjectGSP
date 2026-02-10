module.exports = {
    secret: "cyberpark-secret-key",
    jwtExpiration: 60*60,           // 1 hour *10
    jwtRefreshExpiration: 60*1000*60*24,   // 24 hours
  
    /* for test */
    // jwtExpiration: 60*1,          // 1 minute
    // jwtRefreshExpiration: 60*1000*2,  // 1 minutes
  };