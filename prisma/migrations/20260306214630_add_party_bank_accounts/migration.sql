/*
  Warnings:

  - You are about to drop the column `accountType` on the `PartyBankAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PartyBankAccount" DROP COLUMN "accountType",
ADD COLUMN     "upiId" TEXT;

-- DropEnum
DROP TYPE "BankAccountType";
