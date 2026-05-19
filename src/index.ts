import 'reflect-metadata';
import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './data-source';
import { logger } from './logger';
import { createTaskRepository, createWorkflowRepository } from './repositories';
import { createAnalysisRoutes, createWorkflowRoutes, healthRoute, homeRoute } from './routes';
import { createFinalizeWorkflow, createWorkflowService } from './services';
import { TaskWorker } from './workers';
import { runAnalysis, runNotification, runPolygonArea, runReportGeneration } from './workers/jobs';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const taskRepository = createTaskRepository(AppDataSource);
  const workflowRepository = createWorkflowRepository(AppDataSource);

  const requeuedCount = await taskRepository.requeueInterrupted();
  if (requeuedCount > 0) {
    logger.warn({ count: requeuedCount }, 'startup.requeued_interrupted_tasks');
  }

  const workflowService = createWorkflowService({ workflowRepository, taskRepository });
  const finalizeWorkflow = createFinalizeWorkflow(workflowRepository);

  const app = createApp({
    homeRoute,
    healthRoute,
    analysisRoutes: createAnalysisRoutes(workflowService),
    workflowRoutes: createWorkflowRoutes(workflowRepository),
  });

  const worker = new TaskWorker({
    taskStore: taskRepository,
    handlers: {
      analysis: runAnalysis,
      notification: runNotification,
      polygon_area: runPolygonArea,
      report_generation: runReportGeneration,
    },
    maxRetries: config.MAX_TASK_RETRIES,
    onTaskCompleted: finalizeWorkflow,
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
