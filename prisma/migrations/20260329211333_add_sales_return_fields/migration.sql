/*
  Warnings:

  - A unique constraint covering the columns `[invoiceId]` on the table `SalesReturn` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `SalesReturn` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "SalesReturnItem" DROP CONSTRAINT "SalesReturnItem_salesReturnId_fkey";

-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "returnStatus" TEXT NOT NULL DEFAULT 'Refunded',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SalesReturnItem" ADD COLUMN     "godownId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_invoiceId_key" ON "SalesReturn"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesReturn_partyId_idx" ON "SalesReturn"("partyId");

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;
