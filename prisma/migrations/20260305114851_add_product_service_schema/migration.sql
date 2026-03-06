/*
  Warnings:

  - You are about to drop the column `price` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Product` table. All the data in the column will be lost.
  - Added the required column `itemType` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salesPrice` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('Product', 'Service');

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "price",
DROP COLUMN "stock",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "enableSerial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstRate" DOUBLE PRECISION,
ADD COLUMN     "itemType" "ItemType" NOT NULL,
ADD COLUMN     "openingStock" INTEGER,
ADD COLUMN     "salesPrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "serviceCode" TEXT,
ADD COLUMN     "showOnlineStore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'active',
ADD COLUMN     "unit" TEXT;
