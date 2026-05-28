/*
  Warnings:

  - You are about to drop the column `projectId` on the `Note` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_projectId_fkey";

-- DropIndex
DROP INDEX "Note_projectId_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "projectId";
