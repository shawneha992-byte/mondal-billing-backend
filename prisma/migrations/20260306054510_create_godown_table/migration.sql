-- CreateTable
CREATE TABLE "Godown" (
    "godown_id" SERIAL NOT NULL,
    "godown_name" TEXT NOT NULL,
    "street_address" TEXT,
    "state_name" TEXT,
    "city_name" TEXT,
    "pincode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Godown_pkey" PRIMARY KEY ("godown_id")
);
