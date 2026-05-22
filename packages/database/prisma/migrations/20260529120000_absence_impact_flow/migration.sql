-- CreateEnum
CREATE TYPE "AbsenceNotificationType" AS ENUM ('ABSENCE_AFFECTED_TASKS_EMPLOYEE', 'ABSENCE_AFFECTED_TASK_CREATOR', 'ABSENCE_TASK_DELEGATED_CREATOR');

-- AlterTable
ALTER TABLE "TaskTransfer" ADD COLUMN "absenceId" TEXT;

-- CreateTable
CREATE TABLE "AbsenceNotificationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "absenceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AbsenceNotificationType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_organizationId_idx" ON "AbsenceNotificationLog"("organizationId");

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_absenceId_idx" ON "AbsenceNotificationLog"("absenceId");

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_taskId_idx" ON "AbsenceNotificationLog"("taskId");

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_userId_idx" ON "AbsenceNotificationLog"("userId");

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_type_idx" ON "AbsenceNotificationLog"("type");

-- CreateIndex
CREATE INDEX "AbsenceNotificationLog_sentAt_idx" ON "AbsenceNotificationLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceNotificationLog_absenceId_taskId_userId_type_key" ON "AbsenceNotificationLog"("absenceId", "taskId", "userId", "type");

-- CreateIndex
CREATE INDEX "TaskTransfer_absenceId_idx" ON "TaskTransfer"("absenceId");

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "Absence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceNotificationLog" ADD CONSTRAINT "AbsenceNotificationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceNotificationLog" ADD CONSTRAINT "AbsenceNotificationLog_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "Absence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceNotificationLog" ADD CONSTRAINT "AbsenceNotificationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceNotificationLog" ADD CONSTRAINT "AbsenceNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
