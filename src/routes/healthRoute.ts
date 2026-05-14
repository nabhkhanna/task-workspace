import { Router } from 'express';
import { pingDatabase } from '../data-source';

export function createHealthRoute(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await pingDatabase();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      req.log.error({ err: error }, 'health.check_failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
