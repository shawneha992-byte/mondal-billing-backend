-- CreateTable
CREATE TABLE "PaymentOutSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "enablePrefix" BOOLEAN NOT NULL DEFAULT false,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOutSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentOutSettings" ADD CONSTRAINT "PaymentOutSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
