-- CreateEnum
CREATE TYPE "NotificationBindingType" AS ENUM ('NEW_TASK', 'TASK_TRANSFER', 'TASK_COMMENT', 'TASK_MENTION');

-- CreateTable
CREATE TABLE "NotificationMessageBinding" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "telegramMessageId" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceCommentId" TEXT,
    "sourceCommentAuthorId" TEXT,
    "notificationType" "NotificationBindingType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "NotificationMessageBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationMessageBinding_taskId_idx" ON "NotificationMessageBinding"("taskId");

-- CreateIndex
CREATE INDEX "NotificationMessageBinding_createdAt_idx" ON "NotificationMessageBinding"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationMessageBinding_telegramChatId_telegramMessageId_key" ON "NotificationMessageBinding"("telegramChatId", "telegramMessageId");

-- AddForeignKey
ALTER TABLE "NotificationMessageBinding" ADD CONSTRAINT "NotificationMessageBinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationMessageBinding" ADD CONSTRAINT "NotificationMessageBinding_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
