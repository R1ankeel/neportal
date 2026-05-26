import { revalidatePath } from "next/cache";

/** Paths to refresh after any task detail field mutation. */
export function revalidateTaskDetailPaths(taskId: string, projectId?: string | null): void {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  const pid = projectId?.trim();
  if (pid) {
    revalidatePath(`/projects/${pid}/tasks`);
    revalidatePath(`/projects/${pid}`);
  }
}
