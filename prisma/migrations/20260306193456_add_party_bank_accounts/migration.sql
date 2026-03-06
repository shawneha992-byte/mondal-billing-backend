-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('Savings', 'Current', 'OD');

-- CreateTable
CREATE TABLE "PartyBankAccount" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "branchName" TEXT,
    "accountType" "BankAccountType" NOT NULL DEFAULT 'Current',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyCustomField" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyBankAccount_partyId_idx" ON "PartyBankAccount"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyBankAccount_partyId_accountNumber_key" ON "PartyBankAccount"("partyId", "accountNumber");

-- CreateIndex
CREATE INDEX "PartyCustomField_partyId_idx" ON "PartyCustomField"("partyId");

-- AddForeignKey
ALTER TABLE "PartyBankAccount" ADD CONSTRAINT "PartyBankAccount_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyCustomField" ADD CONSTRAINT "PartyCustomField_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
