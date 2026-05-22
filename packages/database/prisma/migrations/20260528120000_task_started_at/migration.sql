-- AlterTable
ALTER TABLE "Task" ADD COLUMN "startedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "TaskNotificationType" ADD VALUE 'TASK_STARTED_CREATOR';
