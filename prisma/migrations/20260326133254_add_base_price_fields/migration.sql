-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "basePurchasePrice" DECIMAL(10,2),
ADD COLUMN     "baseSalesPrice" DECIMAL(10,2),
ADD COLUMN     "purchasePriceInclTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salesPriceInclTax" BOOLEAN NOT NULL DEFAULT false;
