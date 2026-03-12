-- CreateIndex
CREATE INDEX "Invoice_partyId_idx" ON "Invoice"("partyId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_branchCode_idx" ON "Invoice"("branchCode");
