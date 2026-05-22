-- CreateEnum
CREATE TYPE "TaskNotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DEADLINE_TOMORROW', 'TASK_OVERDUE_ASSIGNEE', 'TASK_OVERDUE_CREATOR');

-- CreateTable
CREATE TABLE "TaskNotificationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TaskNotificationType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskNotificationLog_organizationId_idx" ON "TaskNotificationLog"("organizationId");

-- CreateIndex
CREATE INDEX "TaskNotificationLog_taskId_idx" ON "TaskNotificationLog"("taskId");

-- CreateIndex
CREATE INDEX "TaskNotificationLog_userId_idx" ON "TaskNotificationLog"("userId");

-- CreateIndex
CREATE INDEX "TaskNotificationLog_type_idx" ON "TaskNotificationLog"("type");

-- CreateIndex
CREATE INDEX "TaskNotificationLog_sentAt_idx" ON "TaskNotificationLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskNotificationLog_taskId_userId_type_key" ON "TaskNotificationLog"("taskId", "userId", "type");

-- AddForeignKey
ALTER TABLE "TaskNotificationLog" ADD CONSTRAINT "TaskNotificationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskNotificationLog" ADD CONSTRAINT "TaskNotificationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskNotificationLog" ADD CONSTRAINT "TaskNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
