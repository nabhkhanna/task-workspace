/**
 * One-shot data migration. Backfills `Workflow.finalResult` for terminal
 * workflows that were created before the schema migration added the column.
 *
 * Time-bounded by the schema migration's timestamp: only workflows created
 * before that point are eligible. Newer workflows get their `finalResult`
 * written by `finalizeWorkflow` as their final task completes.
 *
 * Logic inlined deliberately — this script is frozen at the moment the
 * schema migration was authored and must not change behaviour if
 * `buildFinalResult` evolves later.
 *
 * Run via the data-migration runner: `npm run script:migrate-db`.
 */

import { AppDataSource } from '../../src/data-source';
import { logger } from '../../src/logger';

const SCHEMA_MIGRATION_TIMESTAMP_MS = 1778947707009;
const TERMINAL_TASK_STATUSES = ['completed', 'failed'] as const;
const FAILED_STATUS = 'failed';
const FINAL_REPORT_TEXT = 'Aggregated workflow results go here';

interface WorkflowRow {
  id: string;
}

interface TaskRow {
  id: string;
  type: string;
  status: string;
  output: string | null;
  errorHistory: string;
}

interface ErrorHistoryEntry {
  attemptedAt: string;
  error: string;
}

interface FinalResultTaskEntry {
  taskId: string;
  type: string;
  output: unknown;
  error?: string;
}

export default async function backfillWorkflowFinalResult(): Promise<void> {
  const cutoff = new Date(SCHEMA_MIGRATION_TIMESTAMP_MS).toISOString();
  logger.info({ cutoff }, 'backfill.start');

  let backfilled = 0;
  let skippedNotTerminal = 0;
  let skippedNoTasks = 0;

  const candidates: WorkflowRow[] = await AppDataSource.query(
    `SELECT id FROM workflows
       WHERE finalResult IS NULL
         AND datetime(createdAt) < datetime(?)`,
    [cutoff],
  );
  logger.info({ candidateCount: candidates.length }, 'backfill.candidates_loaded');

  for (const { id: workflowId } of candidates) {
    const tasks: TaskRow[] = await AppDataSource.query(
      `SELECT id, type, status, output, errorHistory FROM tasks WHERE workflowId = ?`,
      [workflowId],
    );

    if (tasks.length === 0) {
      skippedNoTasks += 1;
      continue;
    }
    const allTerminal = tasks.every((task) =>
      (TERMINAL_TASK_STATUSES as readonly string[]).includes(task.status),
    );
    if (!allTerminal) {
      skippedNotTerminal += 1;
      continue;
    }

    const entries: FinalResultTaskEntry[] = tasks.map((task) => {
      const entry: FinalResultTaskEntry = {
        taskId: task.id,
        type: task.type,
        output: task.output === null ? null : JSON.parse(task.output),
      };
      if (task.status === FAILED_STATUS) {
        const history: ErrorHistoryEntry[] = JSON.parse(task.errorHistory);
        const lastError = history[history.length - 1]?.error;
        if (lastError !== undefined) {
          entry.error = lastError;
        }
      }
      return entry;
    });

    const finalResult = {
      workflowId,
      tasks: entries,
      finalReport: FINAL_REPORT_TEXT,
    };

    await AppDataSource.query(`UPDATE workflows SET finalResult = ? WHERE id = ?`, [
      JSON.stringify(finalResult),
      workflowId,
    ]);
    backfilled += 1;
  }

  logger.info(
    { backfilled, skippedNotTerminal, skippedNoTasks },
    'backfill.complete',
  );
}
