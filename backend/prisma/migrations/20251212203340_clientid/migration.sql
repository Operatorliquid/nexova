-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "retailClientId" INTEGER;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_retailClientId_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
