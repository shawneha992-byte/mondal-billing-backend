/*
  Warnings:

  - You are about to alter the column `openingStock` on the `ProductStock` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `currentStock` on the `ProductStock` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantityIn` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantityOut` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.

*/
-- AlterTable
ALTER TABLE "ProductStock" ALTER COLUMN "openingStock" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "currentStock" SET DEFAULT 0,
ALTER COLUMN "currentStock" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "StockLedger" ALTER COLUMN "quantityIn" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "quantityOut" SET DATA TYPE DECIMAL(10,3);
