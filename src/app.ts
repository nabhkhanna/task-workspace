import express, { type Express } from 'express';
import analysisRoutes from './routes/analysisRoutes';
import healthRoute from './routes/healthRoute';

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/health', healthRoute);
  app.use('/analysis', analysisRoutes);

  return app;
}
