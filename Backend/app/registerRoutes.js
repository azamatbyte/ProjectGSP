const express = require('express');
const fs = require('fs');
const path = require('path');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const apiRouter = require('../api/router');
const { SERVER_URL } = require('../api/helpers/constants');

function registerRoutes(app) {
  app.use('/status', (req, res) => {
    res.json({ Hello: 'World!' });
  });

  app.use(express.static(path.join(__dirname, '..', 'build'), {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (/\.html$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.use('/api/v1', (req, res, next) => {
    const url = req.originalUrl || req.url;
    if (url.startsWith('/api/v1/download') || /\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$/i.test(url)) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/v1', apiRouter);

  app.use(
    '/api/v1/download',
    (req, res, next) => {
      const originalFileName = path.basename(req.path);

      if (originalFileName) {
        const extension = path.extname(originalFileName);
        let desiredFileName;

        if (req.query.newFileName) {
          const safeNewFileName = path.basename(req.query.newFileName, path.extname(req.query.newFileName));
          desiredFileName = safeNewFileName + extension;
        } else {
          desiredFileName = originalFileName;
        }

        const encodedFileName = encodeURIComponent(desiredFileName);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
      }

      next();
    },
    express.static(path.join(__dirname, '..', 'uploads'), {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    })
  );

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
        },
      },
      security: [{
        apiKeyAuth: [],
        refreshToken: []
      }],
    },
    apis: ['./api/controllers/*.js', './api/router/*.js'],
  };

  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'build', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Frontend build not found' });
    }
  });
}

module.exports = {
  registerRoutes,
};
