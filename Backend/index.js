require('./db/database')
const express = require('express')
const app = express()
const dotenv = require('dotenv')
const cors = require('cors')
const morgan = require('morgan')
const path = require('path');
const bodyParser = require('body-parser')
const router = require('./api/router/index')
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { SERVER_URL } = require('./api/helpers/constants')
dotenv.config()

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const corsOptions = {
  origin: '*',
  exposedHeaders: ['X-Backup-Password', 'X-Backup-Info'],
  credentials: true,
  optionSuccessStatus: 200
}

//
app.use(morgan('dev'))
app.use(cors(corsOptions))
app.use(bodyParser.json({ limit: '10mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use('/status', (req, res) => {
  res.json({ Hello: "World!" })
})
// Serve React static assets (if you have a build/ folder)
// Use long-lived caching for fingerprinted assets and avoid revalidation
app.use(express.static(path.join(__dirname, 'build'), {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    // HTML files should be revalidated so that SPA shell updates are picked up
    if (/\.html$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}))

// API caching policy: default to no-store for API responses so clients always get
// fresh data. We exclude the download path and fingerprinted static asset requests.
app.use('/api/v1', (req, res, next) => {
  const url = req.originalUrl || req.url;
  // allow download route and static asset requests to opt into different caching
  if (url.startsWith('/api/v1/download') || /\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$/i.test(url)) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
})

app.use('/api/v1', router)
// app.use('/api/v1/uploads', express.static(path.join(__dirname, 'uploads')));
// Helper function to sanitize file names
function sanitizeFileName(name) {
  // Remove newline, carriage return, and quotes
  return name.replace(/[\r\n"]/g, '');
}

app.use(
  '/api/v1/download',
  (req, res, next) => {
    // Get the original file name from the URL (e.g., "abc123.pdf")
    const originalFileName = path.basename(req.path);

    if (originalFileName) {
      // Extract the file extension (e.g., ".pdf")
      const extension = path.extname(originalFileName);

      let desiredFileName;
      if (req.query.newFileName) {
        // Sanitize the new file name and remove any provided extension if present
        const safeNewFileName = path.basename(req.query.newFileName, path.extname(req.query.newFileName));
        desiredFileName = safeNewFileName + extension;
      } else {
        desiredFileName = originalFileName;
      }

      // Encode the file name for UTF-8 to support Cyrillic and other special characters
      const encodedFileName = encodeURIComponent(desiredFileName);

      // Set the Content-Disposition header with UTF-8 encoding
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    }

    next();
  },
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
      // Preserve any Content-Disposition set earlier (filename)
      // and set a short caching window for downloads
      if (!res.getHeader('Content-Disposition')) {
        // no-op; Content-Disposition already handled in middleware above
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  })
);


// Swagger konfiguratsiyasi
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'API Information',
      contact: {
        name: 'Developer',
      },
      servers: [SERVER_URL],
    },
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-access-token',
        },
        // refreshToken: {
        //   type: 'apiKey',
        //   in: 'header',
        //   name: 'refreshToken',
        // },
      },
    },
    security: [{
      apiKeyAuth: [],
      refreshToken: []
    }],
  },
  apis: ['./api/controllers/*.js', './api/router/*.js'], // Hujjatlash uchun fayllar yo'li
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// SPA catch-all: serve index.html for any unmatched route so that
// React Router can handle client-side navigation (e.g. /app/search-list).
// This MUST come after all API and static-asset routes.
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'build', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend build not found' });
  }
});

app.listen(PORT, (err) => {
  if (err) { console.log(`Error:${err}`) }
  console.log(`Running on port http://${HOST}:${PORT}/api/v1/api-docs, SUCCESSFULLY!`)
})
