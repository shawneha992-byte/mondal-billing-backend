/*
  Warnings:

  - You are about to drop the column `balanceAmount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paidAmount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `tax` on the `InvoiceItem` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `Party` table. All the data in the column will be lost.
  - You are about to drop the column `gstNumber` on the `Party` table. All the data in the column will be lost.
  - You are about to drop the column `credit` on the `PartyLedger` table. All the data in the column will be lost.
  - You are about to drop the column `debit` on the `PartyLedger` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `PartyLedger` table. All the data in the column will be lost.
  - Made the column `invoiceNumber` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subTotal` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `taxAmount` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `amount` to the `PartyLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reference` to the `PartyLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `PartyLedger` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEBIT', 'CREDIT');

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "balanceAmount",
DROP COLUMN "paidAmount",
ALTER COLUMN "invoiceNumber" SET NOT NULL,
ALTER COLUMN "subTotal" SET NOT NULL,
ALTER COLUMN "taxAmount" SET NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "tax";

-- AlterTable
ALTER TABLE "Party" DROP COLUMN "address",
DROP COLUMN "gstNumber";

-- AlterTable
ALTER TABLE "PartyLedger" DROP COLUMN "credit",
DROP COLUMN "debit",
DROP COLUMN "description",
ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "reference" TEXT NOT NULL,
ADD COLUMN     "type" "LedgerType" NOT NULL;

-- AddForeignKey
ALTER TABLE "PartyLedger" ADD CONSTRAINT "PartyLedger_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
