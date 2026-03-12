/*
  Warnings:

  - You are about to drop the column `date` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `discount` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `tax` on the `Quotation` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `Quotation` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `QuotationItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `total` on the `QuotationItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[quotationNo]` on the table `Quotation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `quotationNo` to the `Quotation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Quotation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "quotationId" INTEGER;

-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "date",
DROP COLUMN "discount",
DROP COLUMN "subtotal",
DROP COLUMN "tax",
DROP COLUMN "total",
ADD COLUMN     "additionalChargesTotal" DECIMAL(12,2),
ADD COLUMN     "branchCode" TEXT,
ADD COLUMN     "challanNo" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "ewayBillNo" TEXT,
ADD COLUMN     "financedBy" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "quotationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "quotationNo" TEXT NOT NULL,
ADD COLUMN     "roundOff" DECIMAL(12,2),
ADD COLUMN     "salesman" TEXT,
ADD COLUMN     "subTotal" DECIMAL(12,2),
ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "taxableAmount" DECIMAL(12,2),
ADD COLUMN     "termsConditions" TEXT,
ADD COLUMN     "totalAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "warrantyPeriod" TEXT,
ALTER COLUMN "validTill" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "discount" DECIMAL(10,2),
ADD COLUMN     "taxAmount" DECIMAL(10,2),
ADD COLUMN     "taxRate" DOUBLE PRECISION,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "QuotationAdditionalCharge" (
    "id" SERIAL NOT NULL,
    "quotationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "QuotationAdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNo_key" ON "Quotation"("quotationNo");

-- CreateIndex
CREATE INDEX "Quotation_partyId_idx" ON "Quotation"("partyId");

-- CreateIndex
CREATE INDEX "Quotation_quotationDate_idx" ON "Quotation"("quotationDate");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAdditionalCharge" ADD CONSTRAINT "QuotationAdditionalCharge_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
