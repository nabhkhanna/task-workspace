import type { IncomingMessage } from 'node:http';
import express, { type Express, type Router } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger';

const HTTP_SERVER_ERROR = 500;
const HTTP_CLIENT_ERROR = 400;

export interface AppRoutes {
  healthRoute: Router;
  analysisRoutes: Router;
  workflowRoutes: Router;
}

/**
 * pino-http types `req` as Node's `IncomingMessage`, but at runtime Express
 * augments it with `originalUrl`. Use an `in` check to narrow without an
 * `as` cast and fall back to `req.url` if the request never went through
 * the Express router.
 */
function urlOf(req: IncomingMessage): string {
  if ('originalUrl' in req && typeof req.originalUrl === 'string') {
    return req.originalUrl;
  }
  return req.url ?? '';
}

export function createApp(routes: AppRoutes): Express {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: urlOf(req),
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= HTTP_SERVER_ERROR) {
          return 'error';
        }
        if (res.statusCode >= HTTP_CLIENT_ERROR) {
          return 'warn';
        }
        return 'info';
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${urlOf(req)} ${res.statusCode} (${responseTime}ms)`,
      customErrorMessage: (req, res) => `${req.method} ${urlOf(req)} ${res.statusCode}`,
    }),
  );
  app.use(express.json());
  app.use('/health', routes.healthRoute);
  app.use('/analysis', routes.analysisRoutes);
  app.use('/workflow', routes.workflowRoutes);

  return app;
}
