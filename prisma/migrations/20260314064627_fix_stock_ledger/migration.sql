/*
  Warnings:

  - You are about to alter the column `balance` on the `StockLedger` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - Made the column `godownId` on table `StockLedger` required. This step will fail if there are existing NULL values in that column.
  - Made the column `quantityIn` on table `StockLedger` required. This step will fail if there are existing NULL values in that column.
  - Made the column `quantityOut` on table `StockLedger` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_godownId_fkey";

-- AlterTable
ALTER TABLE "StockLedger" ALTER COLUMN "godownId" SET NOT NULL,
ALTER COLUMN "quantityIn" SET NOT NULL,
ALTER COLUMN "quantityIn" SET DEFAULT 0,
ALTER COLUMN "quantityOut" SET NOT NULL,
ALTER COLUMN "quantityOut" SET DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(10,3);

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE RESTRICT ON UPDATE CASCADE;
