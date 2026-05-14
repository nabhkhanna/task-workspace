import 'reflect-metadata';
import express from 'express';
import { config } from './config';
import { AppDataSource } from './data-source';
import analysisRoutes from './routes/analysisRoutes';
import defaultRoute from './routes/defaultRoute';
import { taskWorker } from './workers/taskWorker';

const app = express();
app.use(express.json());
app.use('/analysis', analysisRoutes);
app.use('/', defaultRoute);

AppDataSource.initialize()
  .then(() => {
    // Start the worker after successful DB connection
    taskWorker();

    app.listen(config.PORT, () => {
      console.log(`Server is running at http://localhost:${config.PORT}`);
    });
  })
  .catch((error) => console.log(error));
