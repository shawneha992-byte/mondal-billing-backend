-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customFieldValues" JSONB DEFAULT '{}',
ADD COLUMN     "dispatchedThrough" TEXT,
ADD COLUMN     "financeDetails" JSONB,
ADD COLUMN     "paymentDetails" JSONB,
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "transportName" TEXT,
ADD COLUMN     "vehicleNo" TEXT;

-- AlterTable
ALTER TABLE "InvoiceAdditionalCharge" ADD COLUMN     "taxAmount" DECIMAL(10,2),
ADD COLUMN     "taxLabel" TEXT DEFAULT 'No Tax Applicable';

-- CreateTable
CREATE TABLE "InvoiceDetailsSettings" (
    "id" SERIAL NOT NULL,
    "branchCode" TEXT,
    "showChallan" BOOLEAN NOT NULL DEFAULT true,
    "showDispatchedThrough" BOOLEAN NOT NULL DEFAULT false,
    "showEmailId" BOOLEAN NOT NULL DEFAULT true,
    "showFinancedBy" BOOLEAN NOT NULL DEFAULT true,
    "showSalesman" BOOLEAN NOT NULL DEFAULT true,
    "showTransportName" BOOLEAN NOT NULL DEFAULT false,
    "showWarranty" BOOLEAN NOT NULL DEFAULT true,
    "showPO" BOOLEAN NOT NULL DEFAULT false,
    "showEwayBill" BOOLEAN NOT NULL DEFAULT true,
    "showVehicle" BOOLEAN NOT NULL DEFAULT false,
    "customFields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDetailsSettings_pkey" PRIMARY KEY ("id")
);
