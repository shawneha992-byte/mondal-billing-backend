/*
  Warnings:

  - The primary key for the `ProformaInvoice` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `customerName` on the `ProformaInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `customerPhone` on the `ProformaInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `ProformaInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `grandTotal` on the `ProformaInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `proformaNumber` on the `ProformaInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `quotationId` on the `ProformaInvoice` table. All the data in the column will be lost.
  - The `id` column on the `ProformaInvoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `subTotal` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `taxAmount` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `discountAmount` on the `ProformaInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The primary key for the `ProformaInvoiceItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `proformaInvoiceId` on the `ProformaInvoiceItem` table. All the data in the column will be lost.
  - You are about to drop the column `rate` on the `ProformaInvoiceItem` table. All the data in the column will be lost.
  - You are about to drop the column `taxPercent` on the `ProformaInvoiceItem` table. All the data in the column will be lost.
  - The `id` column on the `ProformaInvoiceItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `quantity` on the `ProformaInvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `taxAmount` on the `ProformaInvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `total` on the `ProformaInvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[proformaNo]` on the table `ProformaInvoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[convertedToInvoiceId]` on the table `ProformaInvoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `partyId` to the `ProformaInvoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proformaNo` to the `ProformaInvoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `ProformaInvoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `ProformaInvoiceItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proformaId` to the `ProformaInvoiceItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ProformaStatus" ADD VALUE 'CONVERTED';

-- DropForeignKey
ALTER TABLE "ProformaInvoiceItem" DROP CONSTRAINT "ProformaInvoiceItem_proformaInvoiceId_fkey";

-- DropIndex
DROP INDEX "ProformaInvoice_proformaNumber_key";

-- AlterTable
ALTER TABLE "ProformaInvoice" DROP CONSTRAINT "ProformaInvoice_pkey",
DROP COLUMN "customerName",
DROP COLUMN "customerPhone",
DROP COLUMN "date",
DROP COLUMN "grandTotal",
DROP COLUMN "proformaNumber",
DROP COLUMN "quotationId",
ADD COLUMN     "additionalChargesTotal" DECIMAL(12,2),
ADD COLUMN     "adjustAmt" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "adjustType" TEXT,
ADD COLUMN     "autoRoundOff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bankAccountId" INTEGER,
ADD COLUMN     "branchCode" TEXT,
ADD COLUMN     "challanNo" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedToInvoiceId" INTEGER,
ADD COLUMN     "customFieldValues" JSONB DEFAULT '{}',
ADD COLUMN     "discountAmt" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "discountPct" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "dispatchedThrough" TEXT,
ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "ewayBillNo" TEXT,
ADD COLUMN     "financedBy" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "partyId" INTEGER NOT NULL,
ADD COLUMN     "paymentTermsDays" INTEGER,
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "proformaDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "proformaNo" TEXT NOT NULL,
ADD COLUMN     "roundOff" DECIMAL(12,2),
ADD COLUMN     "salesman" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "showEmptySignatureBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "taxableAmount" DECIMAL(12,2),
ADD COLUMN     "termsConditions" TEXT,
ADD COLUMN     "totalAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "transportName" TEXT,
ADD COLUMN     "validTill" TIMESTAMP(3),
ADD COLUMN     "vehicleNo" TEXT,
ADD COLUMN     "warrantyPeriod" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "subTotal" DROP NOT NULL,
ALTER COLUMN "subTotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "taxAmount" DROP NOT NULL,
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discountAmount" DROP NOT NULL,
ALTER COLUMN "discountAmount" DROP DEFAULT,
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(12,2),
ADD CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProformaInvoiceItem" DROP CONSTRAINT "ProformaInvoiceItem_pkey",
DROP COLUMN "proformaInvoiceId",
DROP COLUMN "rate",
DROP COLUMN "taxPercent",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "discountAmt" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "discountPct" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "hsnSac" TEXT,
ADD COLUMN     "price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "productId" INTEGER,
ADD COLUMN     "proformaId" INTEGER NOT NULL,
ADD COLUMN     "taxLabel" TEXT DEFAULT 'None',
ADD COLUMN     "taxRate" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "unit" TEXT DEFAULT 'PCS',
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "taxAmount" DROP NOT NULL,
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(10,2),
ADD CONSTRAINT "ProformaInvoiceItem_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "ProformaAdditionalCharge" (
    "id" SERIAL NOT NULL,
    "proformaId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "taxLabel" TEXT DEFAULT 'No Tax Applicable',
    "taxAmount" DECIMAL(10,2),

    CONSTRAINT "ProformaAdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "enablePrefix" BOOLEAN NOT NULL DEFAULT false,
    "showItemImage" BOOLEAN NOT NULL DEFAULT false,
    "priceHistory" BOOLEAN NOT NULL DEFAULT false,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_proformaNo_key" ON "ProformaInvoice"("proformaNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_convertedToInvoiceId_key" ON "ProformaInvoice"("convertedToInvoiceId");

-- CreateIndex
CREATE INDEX "ProformaInvoice_partyId_idx" ON "ProformaInvoice"("partyId");

-- CreateIndex
CREATE INDEX "ProformaInvoice_proformaDate_idx" ON "ProformaInvoice"("proformaDate");

-- CreateIndex
CREATE INDEX "ProformaInvoice_branchCode_idx" ON "ProformaInvoice"("branchCode");

-- CreateIndex
CREATE INDEX "ProformaInvoice_status_idx" ON "ProformaInvoice"("status");

-- CreateIndex
CREATE INDEX "ProformaInvoiceItem_proformaId_idx" ON "ProformaInvoiceItem"("proformaId");

-- CreateIndex
CREATE INDEX "ProformaInvoiceItem_productId_idx" ON "ProformaInvoiceItem"("productId");

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_convertedToInvoiceId_fkey" FOREIGN KEY ("convertedToInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaAdditionalCharge" ADD CONSTRAINT "ProformaAdditionalCharge_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaSettings" ADD CONSTRAINT "ProformaSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
