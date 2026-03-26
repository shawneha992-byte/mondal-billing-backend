-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reset_token" TEXT,
ADD COLUMN     "reset_token_expiry" TIMESTAMP(3);
