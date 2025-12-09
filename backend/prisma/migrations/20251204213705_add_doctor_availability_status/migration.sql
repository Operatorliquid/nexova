-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Doctor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'HEALTH',
    "appointmentSlotMinutes" INTEGER,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'available',
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
INSERT INTO "new_Doctor" ("appointmentSlotMinutes", "businessType", "clinicAddress", "clinicName", "consultFee", "contactPhone", "email", "emergencyFee", "extraNotes", "gender", "id", "name", "officeDays", "officeHours", "passwordHash", "specialty", "whatsappBusinessNumber", "whatsappConnectedAt", "whatsappStatus") SELECT "appointmentSlotMinutes", "businessType", "clinicAddress", "clinicName", "consultFee", "contactPhone", "email", "emergencyFee", "extraNotes", "gender", "id", "name", "officeDays", "officeHours", "passwordHash", "specialty", "whatsappBusinessNumber", "whatsappConnectedAt", "whatsappStatus" FROM "Doctor";
DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
