-- CreateTable
CREATE TABLE "PaymentOut" (
    "id" SERIAL NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "partyId" INTEGER NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2),
    "paymentMode" "PaymentMode" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOutInvoice" (
    "id" SERIAL NOT NULL,
    "paymentOutId" INTEGER NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "invoiceAmount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2),
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "balanceAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PaymentOutInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOut_paymentNumber_key" ON "PaymentOut"("paymentNumber");

-- AddForeignKey
ALTER TABLE "PaymentOut" ADD CONSTRAINT "PaymentOut_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOutInvoice" ADD CONSTRAINT "PaymentOutInvoice_paymentOutId_fkey" FOREIGN KEY ("paymentOutId") REFERENCES "PaymentOut"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOutInvoice" ADD CONSTRAINT "PaymentOutInvoice_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
