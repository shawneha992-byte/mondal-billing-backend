/*
  Warnings:

  - You are about to drop the column `openingStock` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "openingStock",
ALTER COLUMN "gstRate" SET DATA TYPE TEXT,
ALTER COLUMN "salesPrice" DROP NOT NULL;
