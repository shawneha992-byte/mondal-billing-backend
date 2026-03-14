-- CreateTable
CREATE TABLE "PurchaseInvoiceSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "enablePrefix" BOOLEAN NOT NULL DEFAULT false,
    "showItemImage" BOOLEAN NOT NULL DEFAULT false,
    "enablePriceHistory" BOOLEAN NOT NULL DEFAULT false,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoiceSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceSettings" ADD CONSTRAINT "PurchaseInvoiceSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
