import { Router } from 'express';
import { AppDataSource } from '../data-source';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    await AppDataSource.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
