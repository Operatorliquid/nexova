-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('unassigned', 'assigned', 'duplicate', 'needs_review');

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" SERIAL NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "messageSid" TEXT,
    "mediaIndex" INTEGER,
    "fileName" TEXT,
    "contentType" TEXT,
    "bytesSha256" TEXT NOT NULL,
    "imageDhash" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "reference" TEXT,
    "proofDate" TIMESTAMP(3),
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'unassigned',
    "duplicateOfId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProof_doctorId_clientId_idx" ON "PaymentProof"("doctorId", "clientId");
CREATE INDEX "PaymentProof_doctorId_orderId_idx" ON "PaymentProof"("doctorId", "orderId");
CREATE INDEX "PaymentProof_bytesSha256_idx" ON "PaymentProof"("bytesSha256");
CREATE INDEX "PaymentProof_imageDhash_idx" ON "PaymentProof"("imageDhash");

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "PaymentProof"("id") ON DELETE SET NULL ON UPDATE CASCADE;
