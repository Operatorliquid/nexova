-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "productIds" DROP DEFAULT,
ALTER COLUMN "productTagLabels" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RetailClient" ADD COLUMN     "manualChatHold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "_OrderPromotions" ADD CONSTRAINT "_OrderPromotions_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_OrderPromotions_AB_unique";

-- RenameForeignKey
ALTER TABLE "RetailClientNote" RENAME CONSTRAINT "RetailClientNote_client_fkey" TO "RetailClientNote_retailClientId_fkey";

-- RenameForeignKey
ALTER TABLE "RetailClientNote" RENAME CONSTRAINT "RetailClientNote_doctor_fkey" TO "RetailClientNote_doctorId_fkey";

-- RenameForeignKey
ALTER TABLE "RetailClientTag" RENAME CONSTRAINT "RetailClientTag_client_fkey" TO "RetailClientTag_clientId_fkey";

-- RenameForeignKey
ALTER TABLE "RetailClientTag" RENAME CONSTRAINT "RetailClientTag_doctor_fkey" TO "RetailClientTag_doctorId_fkey";
