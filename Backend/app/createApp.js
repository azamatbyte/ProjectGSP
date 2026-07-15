const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const net = require('net');
const { registerRoutes } = require('./registerRoutes');
const { getEnv } = require('../config/env');

const env = getEnv();

function isPrivateAddress(hostname) {
  if (net.isIPv4(hostname)) {
    const [a, b] = hostname.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT, used by VPN overlays
    );
  }

  if (net.isIPv6(hostname)) {
    if (hostname === '::1') return true;
    if (hostname.startsWith('fe80:')) return true; // link-local
    if (/^f[cd]/.test(hostname)) return true; // fc00::/7 unique-local
    const mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
  }

  return false;
}

// This is an on-prem app: any page actually served from the operator's own
// network may call the API. Browsers derive Origin from the page's real URL, so
// a site on the public internet can never present a private-network Origin —
// this stays closed to the internet without listing every LAN address.
function isPrivateNetworkOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return true;
  }

  return isPrivateAddress(hostname);
}

function buildCorsOptions() {
  const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS || []);

  return {
    origin(origin, callback) {
      // Same-origin and non-browser callers (curl, the installer) send no Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Local-network pages are always trusted; CORS_ALLOWED_ORIGINS is only
      // needed for extra PUBLIC origins. Reflecting an arbitrary origin here
      // while credentials are enabled would let any website call this API as
      // the logged-in user, so everything else stays denied.
      if (isPrivateNetworkOrigin(origin) || allowedOrigins.has(origin)) {
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

  // The API serves JSON to a separate SPA, so the restrictive defaults that
  // matter for HTML (CSP, COEP) would only get in the way of the upload/backup
  // endpoints; keep the transport/rendering headers.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors(corsOptions));
  app.use(bodyParser.json({ limit: '10mb', extended: true }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  registerRoutes(app);
  return app;
}

module.exports = {
  createApp,
};
