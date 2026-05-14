import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger';
import { analysisRoutes, healthRoute } from './routes';

const HTTP_SERVER_ERROR = 500;
const HTTP_CLIENT_ERROR = 400;

export function createApp(): Express {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req: (req) => {
          const withOriginal = req as typeof req & { originalUrl?: string };
          return {
            id: req.id,
            method: req.method,
            url: withOriginal.originalUrl ?? req.url,
          };
        },
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
      customSuccessMessage: (req, res, responseTime) => {
        const withOriginal = req as typeof req & { originalUrl?: string };
        const url = withOriginal.originalUrl ?? req.url;
        return `${req.method} ${url} ${res.statusCode} (${responseTime}ms)`;
      },
      customErrorMessage: (req, res) => {
        const withOriginal = req as typeof req & { originalUrl?: string };
        const url = withOriginal.originalUrl ?? req.url;
        return `${req.method} ${url} ${res.statusCode}`;
      },
    }),
  );
  app.use(express.json());
  app.use('/health', healthRoute);
  app.use('/analysis', analysisRoutes);

  return app;
}
