-- DropForeignKey
ALTER TABLE "ProductStock" DROP CONSTRAINT "ProductStock_godownId_fkey";

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("godown_id") ON DELETE CASCADE ON UPDATE CASCADE;
