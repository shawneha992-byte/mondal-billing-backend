-- CreateTable
CREATE TABLE "ProductStock" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "godownId" INTEGER NOT NULL,
    "openingStock" INTEGER NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductStock_productId_godownId_key" ON "ProductStock"("productId", "godownId");

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE RESTRICT ON UPDATE CASCADE;
