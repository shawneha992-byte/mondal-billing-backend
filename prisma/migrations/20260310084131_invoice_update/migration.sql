/*
  Warnings:

  - You are about to drop the column `created_at` on the `Invoice` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `InvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `total` on the `InvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - Added the required column `updatedAt` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "created_at",
ADD COLUMN     "additionalChargesTotal" DECIMAL(12,2),
ADD COLUMN     "applyTcs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoRoundOff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "branchCode" TEXT,
ADD COLUMN     "challanNo" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "ewayBillNo" TEXT,
ADD COLUMN     "financedBy" TEXT,
ADD COLUMN     "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMode" "PaymentMode",
ADD COLUMN     "receivedAmount" DECIMAL(12,2),
ADD COLUMN     "roundOff" DECIMAL(12,2),
ADD COLUMN     "salesman" TEXT,
ADD COLUMN     "taxableAmount" DECIMAL(12,2),
ADD COLUMN     "termsConditions" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "warrantyPeriod" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "discount" DECIMAL(10,2),
ADD COLUMN     "taxAmount" DECIMAL(10,2),
ADD COLUMN     "taxRate" DOUBLE PRECISION,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "InvoiceAdditionalCharge" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "InvoiceAdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdditionalCharge" ADD CONSTRAINT "InvoiceAdditionalCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
