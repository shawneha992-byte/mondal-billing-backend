/*
  Warnings:

  - A unique constraint covering the columns `[itemCode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "itemCode" TEXT,
ADD COLUMN     "lowStockAlert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lowStockQty" INTEGER,
ADD COLUMN     "mrp" DECIMAL(10,2),
ADD COLUMN     "mrpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchasePrice" DECIMAL(10,2),
ADD COLUMN     "sacCode" TEXT,
ADD COLUMN     "salesDiscountPercent" DOUBLE PRECISION,
ADD COLUMN     "trackBatchExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wholesaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wholesalePrice" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PartyWisePrice" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "partyId" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PartyWisePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCustomField" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartyWisePrice_productId_partyId_key" ON "PartyWisePrice"("productId", "partyId");

-- CreateIndex
CREATE INDEX "ProductCustomField_productId_idx" ON "ProductCustomField"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_itemCode_key" ON "Product"("itemCode");

-- AddForeignKey
ALTER TABLE "PartyWisePrice" ADD CONSTRAINT "PartyWisePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyWisePrice" ADD CONSTRAINT "PartyWisePrice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCustomField" ADD CONSTRAINT "ProductCustomField_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
