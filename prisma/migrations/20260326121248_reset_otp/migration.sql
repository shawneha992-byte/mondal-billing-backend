/*
  Warnings:

  - You are about to drop the column `reset_token` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `reset_token_expiry` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "reset_token",
DROP COLUMN "reset_token_expiry",
ADD COLUMN     "reset_otp" TEXT,
ADD COLUMN     "reset_otp_expiry" TIMESTAMP(3);
