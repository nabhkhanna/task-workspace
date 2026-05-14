import 'reflect-metadata';
import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './data-source';
import { logger } from './logger';
import { taskWorker } from './workers';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp();
  const abortController = new AbortController();

  const workerPromise = taskWorker(abortController.signal).catch((error) => {
    logger.error({ err: error }, 'worker.crashed');
    process.exit(1);
  });

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'server.started');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, 'shutdown.received');

    const forceExitTimer = setTimeout(() => {
      logger.error('shutdown.timeout_exceeded');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);

    server.close((err) => {
      if (err) {
        logger.error({ err }, 'shutdown.http_close_failed');
      }
    });

    abortController.abort();
    await workerPromise;

    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    } catch (err) {
      logger.error({ err }, 'shutdown.datasource_close_failed');
    }

    clearTimeout(forceExitTimer);
    logger.info('shutdown.complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'process.unhandled_rejection');
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'process.uncaught_exception');
    void shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.error({ err: error }, 'server.startup_failed');
  process.exit(1);
});
