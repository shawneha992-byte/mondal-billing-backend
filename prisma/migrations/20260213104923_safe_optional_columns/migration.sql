/*
  Warnings:

  - You are about to drop the column `invoiceNumber` on the `Invoice` table. All the data in the column will be lost.
  - You are about to alter the column `totalAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `subTotal` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `taxAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `branch` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[invoiceNo]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `invoiceNo` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outstandingAmount` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partyName` to the `Party` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partyType` to the `Party` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balance` to the `PartyLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refType` to the `PartyLedger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `User` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `role` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'cashier', 'accountant');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('Customer', 'Supplier');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('ToCollect', 'ToPay');

-- CreateEnum
CREATE TYPE "LedgerRefType" AS ENUM ('Invoice', 'Return', 'Opening', 'Payment');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('Cash', 'UPI', 'Card', 'Bank', 'EMI');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "PartyLedger" DROP CONSTRAINT "PartyLedger_partyId_fkey";

-- DropIndex
DROP INDEX "Invoice_invoiceNumber_key";

-- AlterTable
ALTER TABLE "Invoice"
DROP COLUMN "invoiceNumber",

ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

ADD COLUMN "invoiceNo" TEXT,
ADD COLUMN "outstandingAmount" DECIMAL(12,2),  -- ✅ REMOVED NOT NULL

ADD COLUMN "status" "InvoiceStatus" DEFAULT 'OPEN',

ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),

ALTER COLUMN "subTotal" DROP NOT NULL,
ALTER COLUMN "subTotal" SET DATA TYPE DECIMAL(12,2),

ALTER COLUMN "taxAmount" DROP NOT NULL,
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creditLimit" DECIMAL(12,2),
ADD COLUMN     "creditPeriod" INTEGER,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "openingBalance" DECIMAL(12,2),
ADD COLUMN     "openingBalanceType" "BalanceType",
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "partyName" TEXT NOT NULL,
ADD COLUMN     "partyType" "PartyType" NOT NULL,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "PartyLedger" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "credit" DECIMAL(12,2),
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "debit" DECIMAL(12,2),
ADD COLUMN     "refId" INTEGER,
ADD COLUMN     "refType" "LedgerRefType" NOT NULL,
ALTER COLUMN "amount" DROP NOT NULL,
ALTER COLUMN "reference" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "branch",
DROP COLUMN "password",
ADD COLUMN     "branch_code" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'active',
DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL;

-- CreateTable
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "address" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "last_login" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIn" (
    "id" SERIAL NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "partyId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyContact" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyAddress" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "addressType" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_branch_code_key" ON "Branch"("branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIn_paymentNo_key" ON "PaymentIn"("paymentNo");

-- CreateIndex
CREATE INDEX "PaymentIn_partyId_idx" ON "PaymentIn"("partyId");

-- CreateIndex
CREATE INDEX "PaymentIn_date_idx" ON "PaymentIn"("date");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PartyContact_partyId_idx" ON "PartyContact"("partyId");

-- CreateIndex
CREATE INDEX "PartyAddress_partyId_idx" ON "PartyAddress"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branch_code_fkey" FOREIGN KEY ("branch_code") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLedger" ADD CONSTRAINT "PartyLedger_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIn" ADD CONSTRAINT "PaymentIn_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyContact" ADD CONSTRAINT "PartyContact_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
