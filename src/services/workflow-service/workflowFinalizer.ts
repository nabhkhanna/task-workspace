import {
  deriveWorkflowStatus,
  type Task,
  type Workflow,
  type WorkflowFinalResult,
  type WorkflowFinalResultTaskEntry,
} from '../../entities';
import type { WorkflowRepository } from '../../repositories';

const FINAL_REPORT_TEXT = 'Aggregated workflow results go here';

export function buildFinalResult(workflow: Workflow): WorkflowFinalResult {
  const tasks: WorkflowFinalResultTaskEntry[] = workflow.tasks.map((task) => {
    const entry: WorkflowFinalResultTaskEntry = {
      taskId: task.id,
      type: task.type,
      output: task.output,
    };
    const lastError = lastErrorOf(task);
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

export function createFinalizeWorkflow(
  workflowRepository: WorkflowRepository,
): (workflowId: string) => Promise<void> {
  return async (workflowId: string): Promise<void> => {
    const workflow = await workflowRepository.findByIdWithTasks(workflowId);
    if (!workflow) {
      return;
    }
    if (workflow.finalResult !== null) {
      return;
    }
    const status = deriveWorkflowStatus(workflow.tasks);
    if (status !== 'completed' && status !== 'failed') {
      return;
    }
    workflow.finalResult = buildFinalResult(workflow);
    await workflowRepository.save(workflow);
  };
}
