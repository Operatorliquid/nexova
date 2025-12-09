PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Doctor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "specialty" TEXT,
    "clinicName" TEXT,
    "clinicAddress" TEXT,
    "officeDays" TEXT,
    "officeHours" TEXT,
    "consultFee" TEXT,
    "emergencyFee" TEXT,
    "contactPhone" TEXT,
    "extraNotes" TEXT,
    "gender" TEXT,
    "whatsappStatus" TEXT NOT NULL DEFAULT 'disconnected',
    "whatsappBusinessNumber" TEXT,
    "whatsappConnectedAt" DATETIME
);

INSERT INTO "new_Doctor" (
    "id","name","email","passwordHash","specialty","clinicName","clinicAddress","officeDays","officeHours","consultFee","emergencyFee","contactPhone","extraNotes","gender","whatsappStatus","whatsappBusinessNumber","whatsappConnectedAt"
) SELECT
    "id","name","email","passwordHash","specialty","clinicName","clinicAddress","officeDays","officeHours","consultFee","emergencyFee","contactPhone","extraNotes","gender","whatsappStatus","whatsappBusinessNumber","whatsappConnectedAt"
FROM "Doctor";

DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");

CREATE TABLE "new_WhatsAppNumber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayPhoneNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "assignedDoctorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppNumber_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_WhatsAppNumber" (
    "id","displayPhoneNumber","status","assignedDoctorId","createdAt","updatedAt"
) SELECT
    "id","displayPhoneNumber","status","assignedDoctorId","createdAt","updatedAt"
FROM "WhatsAppNumber";

DROP TABLE "WhatsAppNumber";
ALTER TABLE "new_WhatsAppNumber" RENAME TO "WhatsAppNumber";
CREATE UNIQUE INDEX "WhatsAppNumber_displayPhoneNumber_key" ON "WhatsAppNumber"("displayPhoneNumber");
CREATE UNIQUE INDEX "WhatsAppNumber_assignedDoctorId_key" ON "WhatsAppNumber"("assignedDoctorId");

PRAGMA foreign_keys=ON;
