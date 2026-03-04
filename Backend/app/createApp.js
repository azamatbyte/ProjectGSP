const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { registerRoutes } = require('./registerRoutes');
const { getEnv } = require('../config/env');

const env = getEnv();

function buildCorsOptions() {
  const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS || []);

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['X-Backup-Password', 'X-Backup-Info'],
    allowedHeaders: ['Content-Type', 'x-access-token', 'X-Backup-Password'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200,
  };
}

function createApp() {
  const app = express();
  const corsOptions = buildCorsOptions();

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
