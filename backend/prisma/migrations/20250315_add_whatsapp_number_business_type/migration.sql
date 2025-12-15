-- Add businessType segregation for WhatsApp numbers
ALTER TABLE "WhatsAppNumber"
ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'HEALTH';
