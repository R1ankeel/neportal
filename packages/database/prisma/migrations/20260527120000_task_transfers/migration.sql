-- CreateEnum
CREATE TYPE "TaskTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TaskTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "comment" TEXT,
    "status" "TaskTransferStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTransfer_organizationId_idx" ON "TaskTransfer"("organizationId");

-- CreateIndex
CREATE INDEX "TaskTransfer_taskId_idx" ON "TaskTransfer"("taskId");

-- CreateIndex
CREATE INDEX "TaskTransfer_fromUserId_idx" ON "TaskTransfer"("fromUserId");

-- CreateIndex
CREATE INDEX "TaskTransfer_toUserId_idx" ON "TaskTransfer"("toUserId");

-- CreateIndex
CREATE INDEX "TaskTransfer_requestedById_idx" ON "TaskTransfer"("requestedById");

-- CreateIndex
CREATE INDEX "TaskTransfer_status_idx" ON "TaskTransfer"("status");

-- CreateIndex
CREATE INDEX "TaskTransfer_createdAt_idx" ON "TaskTransfer"("createdAt");

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTransfer" ADD CONSTRAINT "TaskTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
