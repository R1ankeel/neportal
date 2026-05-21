-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramUsername" TEXT;

-- CreateIndex (nullable: multiple NULL per org allowed in PostgreSQL)
CREATE UNIQUE INDEX "User_organizationId_telegramUsername_key" ON "User"("organizationId", "telegramUsername");
