-- CreateEnum
CREATE TYPE "StockRefType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'SALES_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "godownId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refType" "StockRefType" NOT NULL,
    "refId" INTEGER,
    "quantityIn" INTEGER,
    "quantityOut" INTEGER,
    "balance" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLedger_productId_idx" ON "StockLedger"("productId");

-- CreateIndex
CREATE INDEX "StockLedger_date_idx" ON "StockLedger"("date");

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE SET NULL ON UPDATE CASCADE;
