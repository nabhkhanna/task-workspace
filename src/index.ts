import 'reflect-metadata';
import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './data-source';
import { logger } from './logger';
import { initRepositories, repositories } from './repositories';
import { TaskWorker } from './workers';
import { runAnalysis, runNotification, runPolygonArea } from './workers/jobs';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  initRepositories(AppDataSource);

  const requeuedCount = await repositories.taskRepository.requeueInProgress();
  if (requeuedCount > 0) {
    logger.warn({ count: requeuedCount }, 'startup.requeued_interrupted_tasks');
  }

  const app = createApp();

  const worker = new TaskWorker({
    taskRepository: repositories.taskRepository,
    handlers: {
      analysis: runAnalysis,
      notification: runNotification,
      polygon_area: runPolygonArea,
    },
    maxRetries: config.MAX_TASK_RETRIES,
  });
  const workerPromise = worker.start().catch((error) => {
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

    await worker.stop();
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
