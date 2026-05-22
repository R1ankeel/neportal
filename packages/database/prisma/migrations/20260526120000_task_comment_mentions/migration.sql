-- CreateTable
CREATE TABLE "TaskCommentMention" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCommentMention_organizationId_idx" ON "TaskCommentMention"("organizationId");

-- CreateIndex
CREATE INDEX "TaskCommentMention_commentId_idx" ON "TaskCommentMention"("commentId");

-- CreateIndex
CREATE INDEX "TaskCommentMention_taskId_idx" ON "TaskCommentMention"("taskId");

-- CreateIndex
CREATE INDEX "TaskCommentMention_mentionedUserId_idx" ON "TaskCommentMention"("mentionedUserId");

-- CreateIndex
CREATE INDEX "TaskCommentMention_requestedById_idx" ON "TaskCommentMention"("requestedById");

-- CreateIndex
CREATE INDEX "TaskCommentMention_createdAt_idx" ON "TaskCommentMention"("createdAt");

-- AddForeignKey
ALTER TABLE "TaskCommentMention" ADD CONSTRAINT "TaskCommentMention_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMention" ADD CONSTRAINT "TaskCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMention" ADD CONSTRAINT "TaskCommentMention_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMention" ADD CONSTRAINT "TaskCommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMention" ADD CONSTRAINT "TaskCommentMention_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
