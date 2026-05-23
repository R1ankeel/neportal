-- AlterEnum
ALTER TYPE "AbsenceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Absence" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancellationReason" TEXT;

-- CreateIndex
CREATE INDEX "Absence_cancelledById_idx" ON "Absence"("cancelledById");

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
