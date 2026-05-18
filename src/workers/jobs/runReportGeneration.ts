import type {
  ReportPayload,
  ReportTaskEntry,
  Task,
  TaskOutput,
  TaskStatus,
  Workflow,
} from '../../entities';
import type { JobFn } from '.';

const FINAL_REPORT_TEXT = 'Aggregated data and results';
const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed'];

export function buildReport(currentTask: Task, workflow: Workflow): ReportPayload {
  const precedingTasks = workflow.tasks.filter(
    (sibling) => sibling.id !== currentTask.id && TERMINAL_TASK_STATUSES.includes(sibling.status),
  );

  const tasks: ReportTaskEntry[] = precedingTasks.map((sibling) => {
    const entry: ReportTaskEntry = {
      taskId: sibling.id,
      type: sibling.type,
      output: sibling.output,
    };
    const lastError = lastErrorOf(sibling);
    if (lastError !== undefined) {
      entry.error = lastError;
    }
    return entry;
  });

  return {
    workflowId: workflow.id,
    tasks,
    finalReport: FINAL_REPORT_TEXT,
  };
}

function lastErrorOf(task: Task): string | undefined {
  if (task.status !== 'failed') {
    return undefined;
  }
  return task.errorHistory[task.errorHistory.length - 1]?.error;
}

export const runReportGeneration: JobFn = (task: Task): Promise<TaskOutput> => {
  return Promise.resolve({
    type: 'report_generation',
    report: buildReport(task, task.workflow),
  });
};
