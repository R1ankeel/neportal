-- BudgetStatus: remove EXHAUSTED
CREATE TYPE "BudgetStatus_new" AS ENUM ('ACTIVE', 'ARCHIVED');
ALTER TABLE "Budget" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Budget" ALTER COLUMN "status" TYPE "BudgetStatus_new" USING (
  CASE
    WHEN "status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"BudgetStatus_new"
    ELSE 'ACTIVE'::"BudgetStatus_new"
  END
);
ALTER TABLE "Budget" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "BudgetStatus";
ALTER TYPE "BudgetStatus_new" RENAME TO "BudgetStatus";

-- BudgetExpenseStatus replaces ExpenseStatus
CREATE TYPE "BudgetExpenseStatus" AS ENUM ('PENDING_RECEIPT', 'APPROVED');

ALTER TABLE "BudgetExpense" ADD COLUMN "status_new" "BudgetExpenseStatus" NOT NULL DEFAULT 'APPROVED';

UPDATE "BudgetExpense"
SET "status_new" = CASE
  WHEN "status"::text = 'PENDING' THEN 'PENDING_RECEIPT'::"BudgetExpenseStatus"
  WHEN "status"::text = 'APPROVED' THEN 'APPROVED'::"BudgetExpenseStatus"
  ELSE 'APPROVED'::"BudgetExpenseStatus"
END;

ALTER TABLE "BudgetExpense" DROP COLUMN "status";
ALTER TABLE "BudgetExpense" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "BudgetExpense" ALTER COLUMN "status" SET DEFAULT 'APPROVED';

ALTER TABLE "BudgetExpense" DROP CONSTRAINT IF EXISTS "BudgetExpense_approvedById_fkey";
ALTER TABLE "BudgetExpense" DROP COLUMN IF EXISTS "approvedById";
ALTER TABLE "BudgetExpense" DROP COLUMN IF EXISTS "approvedAt";

DROP TYPE "ExpenseStatus";

-- Budget archive & receipt fields
ALTER TABLE "Budget" ADD COLUMN "requiresReceipt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Budget" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Budget" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Budget" ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "Budget_archivedById_idx" ON "Budget"("archivedById");
CREATE INDEX "Budget_status_idx" ON "Budget"("status");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BudgetAccess
CREATE TABLE "BudgetAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "BudgetAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetAccess_budgetId_userId_key" ON "BudgetAccess"("budgetId", "userId");
CREATE INDEX "BudgetAccess_organizationId_idx" ON "BudgetAccess"("organizationId");
CREATE INDEX "BudgetAccess_budgetId_idx" ON "BudgetAccess"("budgetId");
CREATE INDEX "BudgetAccess_userId_idx" ON "BudgetAccess"("userId");
CREATE INDEX "BudgetAccess_createdById_idx" ON "BudgetAccess"("createdById");

ALTER TABLE "BudgetAccess" ADD CONSTRAINT "BudgetAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAccess" ADD CONSTRAINT "BudgetAccess_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAccess" ADD CONSTRAINT "BudgetAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetAccess" ADD CONSTRAINT "BudgetAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sync spentAmount to confirmed (APPROVED) expenses only
UPDATE "Budget" b
SET "spentAmount" = COALESCE((
  SELECT SUM(e."amount")
  FROM "BudgetExpense" e
  WHERE e."budgetId" = b."id" AND e."status" = 'APPROVED'
), 0);
