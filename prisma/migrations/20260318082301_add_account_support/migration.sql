/*
  Warnings:

  - The values [Cash,Card,Bank,EMI] on the enum `PaymentMode` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'UPI');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMode_new" AS ENUM ('CASH', 'UPI', 'CARD', 'NETBANKING', 'BANK_TRANSFER', 'CHEQUE');
ALTER TABLE "PaymentIn" ALTER COLUMN "mode" TYPE "PaymentMode_new" USING ("mode"::text::"PaymentMode_new");
ALTER TABLE "Invoice" ALTER COLUMN "paymentMode" TYPE "PaymentMode_new" USING ("paymentMode"::text::"PaymentMode_new");
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "paymentMode" TYPE "PaymentMode_new" USING ("paymentMode"::text::"PaymentMode_new");
ALTER TABLE "PaymentOut" ALTER COLUMN "paymentMode" TYPE "PaymentMode_new" USING ("paymentMode"::text::"PaymentMode_new");
ALTER TYPE "PaymentMode" RENAME TO "PaymentMode_old";
ALTER TYPE "PaymentMode_new" RENAME TO "PaymentMode";
DROP TYPE "PaymentMode_old";
COMMIT;

-- DropIndex
DROP INDEX "PaymentIn_date_idx";

-- DropIndex
DROP INDEX "PaymentIn_partyId_idx";

-- AlterTable
ALTER TABLE "PaymentIn" ADD COLUMN     "accountId" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "showEmptySignatureBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signatureUrl" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "branchName" TEXT,
    "upiId" TEXT,
    "type" "AccountType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentIn" ADD CONSTRAINT "PaymentIn_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
