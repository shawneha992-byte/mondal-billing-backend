-- CreateTable
CREATE TABLE "InvoiceSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "enablePrefix" BOOLEAN NOT NULL DEFAULT false,
    "showPurchasePrice" BOOLEAN NOT NULL DEFAULT false,
    "showItemImage" BOOLEAN NOT NULL DEFAULT false,
    "enablePriceHistory" BOOLEAN NOT NULL DEFAULT false,
    "invoiceTheme" TEXT DEFAULT 'Advanced GST',
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoiceSettings" ADD CONSTRAINT "InvoiceSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
