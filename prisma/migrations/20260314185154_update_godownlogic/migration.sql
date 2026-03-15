/*
  Warnings:

  - You are about to alter the column `openingStock` on the `ProductStock` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `Integer`.
  - You are about to alter the column `currentStock` on the `ProductStock` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `Integer`.
  - You are about to alter the column `quantityIn` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `Integer`.
  - You are about to alter the column `quantityOut` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `Integer`.
  - You are about to alter the column `balance` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `Integer`.
  - You are about to drop the `PaymentOutSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseInvoiceSettings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[quotationId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "PaymentOutSettings" DROP CONSTRAINT "PaymentOutSettings_branchCode_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseInvoiceSettings" DROP CONSTRAINT "PurchaseInvoiceSettings_branchCode_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_godownId_fkey";

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "godownId" INTEGER;

-- AlterTable
ALTER TABLE "ProductStock" ALTER COLUMN "openingStock" SET DATA TYPE INTEGER,
ALTER COLUMN "currentStock" SET DEFAULT 0,
ALTER COLUMN "currentStock" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "godownId" INTEGER;

-- AlterTable
ALTER TABLE "StockLedger" ALTER COLUMN "godownId" DROP NOT NULL,
ALTER COLUMN "quantityIn" SET DEFAULT 0,
ALTER COLUMN "quantityIn" SET DATA TYPE INTEGER,
ALTER COLUMN "quantityOut" SET DEFAULT 0,
ALTER COLUMN "quantityOut" SET DATA TYPE INTEGER,
ALTER COLUMN "balance" SET DATA TYPE INTEGER;

-- DropTable
DROP TABLE "PaymentOutSettings";

-- DropTable
DROP TABLE "PurchaseInvoiceSettings";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_quotationId_key" ON "Invoice"("quotationId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNo_idx" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "InvoiceItem_godownId_idx" ON "InvoiceItem"("godownId");

-- CreateIndex
CREATE INDEX "ProductStock_productId_idx" ON "ProductStock"("productId");

-- CreateIndex
CREATE INDEX "ProductStock_godownId_idx" ON "ProductStock"("godownId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_productId_idx" ON "QuotationItem"("productId");

-- CreateIndex
CREATE INDEX "StockLedger_productId_godownId_idx" ON "StockLedger"("productId", "godownId");

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;
