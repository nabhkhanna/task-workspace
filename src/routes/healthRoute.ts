import { Router } from 'express';
import { AppDataSource } from '../data-source';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await AppDataSource.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    req.log.error({ err: error }, 'health.check_failed');
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
