import 'reflect-metadata';
import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './data-source';
import { taskWorker } from './workers/taskWorker';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const app = createApp();
  const abortController = new AbortController();

  const workerPromise = taskWorker(abortController.signal).catch((error) => {
    console.error('Task worker crashed:', error);
    process.exit(1);
  });

  const server = app.listen(config.PORT, () => {
    console.log(`Server is running at http://localhost:${config.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`Received ${signal}, shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      console.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);

    server.close((err) => {
      if (err) {
        console.error('Error while closing HTTP server:', err);
      }
    });

    abortController.abort();
    await workerPromise;

    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    } catch (err) {
      console.error('Error while closing DataSource:', err);
    }

    clearTimeout(forceExitTimer);
    console.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    void shutdown('uncaughtException');
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
