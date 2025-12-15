-- Sync schema additions for retail features and ticket logo

-- Doctor: logo en boletas
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "ticketLogoUrl" TEXT;

-- Order: flags de confirmación y pagos
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "inventoryDeductedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- OrderAttachment
CREATE TABLE IF NOT EXISTS "OrderAttachment" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "filename" TEXT,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='OrderAttachment' AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE "OrderAttachment"
    ADD CONSTRAINT "OrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- Promotion
CREATE TABLE IF NOT EXISTS "Promotion" (
  "id" SERIAL PRIMARY KEY,
  "doctorId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "discountType" TEXT NOT NULL,
  "discountValue" INTEGER NOT NULL,
  "productIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "productTagLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "imageUrl" TEXT,
  "durationDays" INTEGER,
  "untilStockOut" BOOLEAN NOT NULL DEFAULT false,
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='Promotion' AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE "Promotion"
    ADD CONSTRAINT "Promotion_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- RetailClientNote
CREATE TABLE IF NOT EXISTS "RetailClientNote" (
  "id" SERIAL PRIMARY KEY,
  "retailClientId" INTEGER NOT NULL,
  "doctorId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='RetailClientNote' AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE "RetailClientNote"
    ADD CONSTRAINT "RetailClientNote_client_fkey" FOREIGN KEY ("retailClientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "RetailClientNote"
    ADD CONSTRAINT "RetailClientNote_doctor_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- RetailClientTag
CREATE TABLE IF NOT EXISTS "RetailClientTag" (
  "id" SERIAL PRIMARY KEY,
  "label" TEXT NOT NULL,
  "severity" "PatientTagSeverity" NOT NULL DEFAULT 'medium',
  "clientId" INTEGER NOT NULL,
  "doctorId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='RetailClientTag' AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE "RetailClientTag"
    ADD CONSTRAINT "RetailClientTag_client_fkey" FOREIGN KEY ("clientId") REFERENCES "RetailClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "RetailClientTag"
    ADD CONSTRAINT "RetailClientTag_doctor_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- _OrderPromotions join table
CREATE TABLE IF NOT EXISTS "_OrderPromotions" (
  "A" INTEGER NOT NULL,
  "B" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "_OrderPromotions_AB_unique" ON "_OrderPromotions"("A", "B");
CREATE INDEX IF NOT EXISTS "_OrderPromotions_B_index" ON "_OrderPromotions"("B");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='_OrderPromotions' AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE "_OrderPromotions"
    ADD CONSTRAINT "_OrderPromotions_A_fkey" FOREIGN KEY ("A") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_OrderPromotions"
    ADD CONSTRAINT "_OrderPromotions_B_fkey" FOREIGN KEY ("B") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
