-- New retail models for commerce orders
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE "RetailClient" (
  "id" SERIAL PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "dni" TEXT,
  "businessAddress" TEXT,
  "phone" TEXT,
  "doctorId" INTEGER NOT NULL REFERENCES "Doctor"("id") ON DELETE CASCADE,
  "patientId" INTEGER UNIQUE REFERENCES "Patient"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Order" (
  "id" SERIAL PRIMARY KEY,
  "sequenceNumber" INTEGER NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'pending',
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "customerName" TEXT NOT NULL,
  "customerAddress" TEXT,
  "customerDni" TEXT,
  "doctorId" INTEGER NOT NULL REFERENCES "Doctor"("id") ON DELETE CASCADE,
  "clientId" INTEGER REFERENCES "RetailClient"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrderItem" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL
);

-- Basic index to help doctor scoping
CREATE INDEX "Order_doctorId_idx" ON "Order"("doctorId");
CREATE INDEX "Order_sequenceNumber_doctor_idx" ON "Order"("doctorId", "sequenceNumber");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
