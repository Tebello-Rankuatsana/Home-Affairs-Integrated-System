import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import passport from './passport.js';
import routes from './routes/index.js';
import { openapi } from './openapi.js';
import { config } from './config.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  const defaults = helmet.contentSecurityPolicy.getDefaultDirectives();
  if (!config.isProd) defaults['upgrade-insecure-requests'] = null;
  app.use(helmet({ contentSecurityPolicy: { directives: defaults } }));

  app.use(cors({ exposedHeaders: ['X-Request-Id', 'X-Total-Count'] }));

  app.use((req, res, next) => {
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  if (!config.isProd) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(passport.initialize());

  app.get('/health', (req, res) =>
    res.json({ status: 'ok', uptime: Math.round(process.uptime()), requestId: req.id })
  );
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: 'Government Services API' })
  );

  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}