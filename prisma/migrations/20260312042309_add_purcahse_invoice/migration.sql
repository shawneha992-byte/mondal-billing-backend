-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "LedgerRefType" ADD VALUE 'PurchaseInvoice';

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" SERIAL NOT NULL,
    "purchaseInvNo" TEXT NOT NULL,
    "originalInvNo" TEXT,
    "partyId" INTEGER NOT NULL,
    "branchCode" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "ewayBillNo" TEXT,
    "challanNo" TEXT,
    "financedBy" TEXT,
    "salesman" TEXT,
    "emailId" TEXT,
    "warrantyPeriod" TEXT,
    "notes" TEXT,
    "termsConditions" TEXT,
    "subTotal" DECIMAL(12,2),
    "taxableAmount" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2),
    "additionalChargesTotal" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "roundOff" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2),
    "balanceAmount" DECIMAL(12,2),
    "paymentMode" "PaymentMode",
    "applyTcs" BOOLEAN NOT NULL DEFAULT false,
    "applyTds" BOOLEAN NOT NULL DEFAULT false,
    "autoRoundOff" BOOLEAN NOT NULL DEFAULT false,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceItem" (
    "id" SERIAL NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "hsnSac" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2),
    "taxRate" DOUBLE PRECISION,
    "taxAmount" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PurchaseInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceAdditionalCharge" (
    "id" SERIAL NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PurchaseInvoiceAdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_purchaseInvNo_key" ON "PurchaseInvoice"("purchaseInvNo");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_partyId_idx" ON "PurchaseInvoice"("partyId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_invoiceDate_idx" ON "PurchaseInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_branchCode_idx" ON "PurchaseInvoice"("branchCode");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItem" ADD CONSTRAINT "PurchaseInvoiceItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceItem" ADD CONSTRAINT "PurchaseInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceAdditionalCharge" ADD CONSTRAINT "PurchaseInvoiceAdditionalCharge_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
