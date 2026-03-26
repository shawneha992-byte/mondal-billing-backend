-- CreateEnum
CREATE TYPE "DeliveryChallanStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "StockRefType" ADD VALUE 'DELIVERY_CHALLAN';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "deliveryChallanId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "taxType" TEXT NOT NULL DEFAULT 'without_tax';

-- CreateTable
CREATE TABLE "DeliveryChallan" (
    "id" SERIAL NOT NULL,
    "challanNo" TEXT NOT NULL,
    "partyId" INTEGER NOT NULL,
    "branchCode" TEXT,
    "challanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eWayBillNo" TEXT,
    "challanNoRef" TEXT,
    "financedBy" TEXT,
    "salesman" TEXT,
    "emailId" TEXT,
    "warrantyPeriod" TEXT,
    "poNumber" TEXT,
    "vehicleNo" TEXT,
    "dispatchedThrough" TEXT,
    "transportName" TEXT,
    "shippingAddress" TEXT,
    "subTotal" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2),
    "additionalChargesTotal" DECIMAL(12,2),
    "roundOff" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "discountType" TEXT,
    "discountPct" DOUBLE PRECISION DEFAULT 0,
    "discountAmt" DOUBLE PRECISION DEFAULT 0,
    "autoRoundOff" BOOLEAN NOT NULL DEFAULT false,
    "roundOffAmt" DOUBLE PRECISION DEFAULT 0,
    "customFieldValues" JSONB DEFAULT '{}',
    "notes" TEXT,
    "termsConditions" TEXT,
    "showEmptySignatureBox" BOOLEAN NOT NULL DEFAULT false,
    "signatureUrl" TEXT,
    "status" "DeliveryChallanStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryChallanItem" (
    "id" SERIAL NOT NULL,
    "challanId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "hsnSac" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT DEFAULT 'PCS',
    "price" DECIMAL(10,2) NOT NULL,
    "discountPct" DOUBLE PRECISION DEFAULT 0,
    "discountAmt" DOUBLE PRECISION DEFAULT 0,
    "taxLabel" TEXT DEFAULT 'None',
    "taxRate" DOUBLE PRECISION DEFAULT 0,
    "taxAmount" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,
    "godownId" INTEGER,

    CONSTRAINT "DeliveryChallanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryChallanAdditionalCharge" (
    "id" SERIAL NOT NULL,
    "challanId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "taxLabel" TEXT DEFAULT 'No Tax Applicable',
    "taxAmount" DECIMAL(10,2),

    CONSTRAINT "DeliveryChallanAdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryChallanSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "enablePrefix" BOOLEAN NOT NULL DEFAULT false,
    "showItemImage" BOOLEAN NOT NULL DEFAULT true,
    "priceHistory" BOOLEAN NOT NULL DEFAULT true,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallanSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryChallan_challanNo_key" ON "DeliveryChallan"("challanNo");

-- CreateIndex
CREATE INDEX "DeliveryChallan_partyId_idx" ON "DeliveryChallan"("partyId");

-- CreateIndex
CREATE INDEX "DeliveryChallan_challanDate_idx" ON "DeliveryChallan"("challanDate");

-- CreateIndex
CREATE INDEX "DeliveryChallan_branchCode_idx" ON "DeliveryChallan"("branchCode");

-- CreateIndex
CREATE INDEX "DeliveryChallan_status_idx" ON "DeliveryChallan"("status");

-- CreateIndex
CREATE INDEX "DeliveryChallanItem_challanId_idx" ON "DeliveryChallanItem"("challanId");

-- CreateIndex
CREATE INDEX "DeliveryChallanItem_productId_idx" ON "DeliveryChallanItem"("productId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveryChallanId_fkey" FOREIGN KEY ("deliveryChallanId") REFERENCES "DeliveryChallan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "DeliveryChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanAdditionalCharge" ADD CONSTRAINT "DeliveryChallanAdditionalCharge_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "DeliveryChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanSettings" ADD CONSTRAINT "DeliveryChallanSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
