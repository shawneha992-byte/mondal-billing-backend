/*
  Warnings:

  - You are about to alter the column `adjustAmt` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `discountAmt` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `discountPct` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,2)`.
  - The `shippingAddress` column on the `ProformaInvoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "ProformaInvoice_branchCode_idx";

-- DropIndex
DROP INDEX "ProformaInvoice_status_idx";

-- AlterTable
ALTER TABLE "ProformaInvoice" ALTER COLUMN "adjustAmt" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "customFieldValues" DROP DEFAULT,
ALTER COLUMN "discountAmt" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "discountPct" SET DATA TYPE DECIMAL(5,2),
DROP COLUMN "shippingAddress",
ADD COLUMN     "shippingAddress" JSONB;

-- CreateIndex
CREATE INDEX "ProformaInvoice_status_branchCode_idx" ON "ProformaInvoice"("status", "branchCode");

-- CreateIndex
CREATE INDEX "ProformaInvoice_convertedToInvoiceId_idx" ON "ProformaInvoice"("convertedToInvoiceId");

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "PartyBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
