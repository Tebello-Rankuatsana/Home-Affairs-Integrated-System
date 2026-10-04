import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import passport from './passport.js';
import routes from './routes/index.js';
// import { openapi } from './openapi.js';
import { config } from './config.js';
// import { globalLimiter } from './middleware/rateLimit.js';
// import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);

  // Helmet's default CSP upgrades requests to https, which breaks Swagger UI on plain-http localhost
  const defaults = helmet.contentSecurityPolicy.getDefaultDirectives();
  if (!config.isProd) defaults['upgrade-insecure-requests'] = null;
  app.use(helmet({ contentSecurityPolicy: { directives: defaults } }));

  app.use(cors()); // tighten to the frontend origin before deployment
  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Government Services API' }));

  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
