-- CreateTable
CREATE TABLE "WhatsAppNumber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayPhoneNumber" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "accessToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "assignedDoctorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppNumber_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
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
    "whatsappPhoneNumberId" TEXT,
    "whatsappAccessToken" TEXT,
    "whatsappConnectedAt" DATETIME
);
INSERT INTO "new_Doctor" ("clinicAddress", "clinicName", "consultFee", "contactPhone", "email", "emergencyFee", "extraNotes", "gender", "id", "name", "officeDays", "officeHours", "passwordHash", "specialty") SELECT "clinicAddress", "clinicName", "consultFee", "contactPhone", "email", "emergencyFee", "extraNotes", "gender", "id", "name", "officeDays", "officeHours", "passwordHash", "specialty" FROM "Doctor";
DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_phoneNumberId_key" ON "WhatsAppNumber"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_assignedDoctorId_key" ON "WhatsAppNumber"("assignedDoctorId");
