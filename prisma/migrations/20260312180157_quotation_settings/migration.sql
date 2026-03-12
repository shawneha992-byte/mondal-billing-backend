-- CreateTable
CREATE TABLE "QuotationSettings" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "branchCode" TEXT,

    CONSTRAINT "QuotationSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "QuotationSettings" ADD CONSTRAINT "QuotationSettings_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "Branch"("branch_code") ON DELETE SET NULL ON UPDATE CASCADE;
