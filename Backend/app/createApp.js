const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { registerRoutes } = require('./registerRoutes');
const { getEnv } = require('../config/env');

const env = getEnv();

function createApp() {
  const app = express();

  const corsOptions = {
    origin: '*',
    exposedHeaders: ['X-Backup-Password', 'X-Backup-Info'],
    credentials: true,
    optionSuccessStatus: 200
  };

  if (env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  app.use(cors(corsOptions));
  app.use(bodyParser.json({ limit: '10mb', extended: true }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  registerRoutes(app);
  return app;
}

module.exports = {
  createApp,
};
