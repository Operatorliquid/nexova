-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "dni" TEXT,
    "phone" TEXT,
    "insuranceProvider" TEXT,
    "consultReason" TEXT,
    "birthDate" DATETIME,
    "address" TEXT,
    "preferredDayISO" DATETIME,
    "preferredHour" INTEGER,
    "doctorId" INTEGER,
    "needsDni" BOOLEAN NOT NULL DEFAULT false,
    "needsName" BOOLEAN NOT NULL DEFAULT false,
    "needsBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "needsAddress" BOOLEAN NOT NULL DEFAULT false,
    "needsInsurance" BOOLEAN NOT NULL DEFAULT false,
    "needsConsultReason" BOOLEAN NOT NULL DEFAULT false,
    "pendingSlotISO" DATETIME,
    "pendingSlotHumanLabel" TEXT,
    "pendingSlotExpiresAt" DATETIME,
    "pendingSlotReason" TEXT,
    "conversationState" TEXT NOT NULL DEFAULT 'WELCOME',
    "conversationStateData" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("consultReason", "conversationState", "conversationStateData", "createdAt", "doctorId", "fullName", "id", "insuranceProvider", "needsConsultReason", "needsInsurance", "needsName", "pendingSlotExpiresAt", "pendingSlotHumanLabel", "pendingSlotISO", "pendingSlotReason", "phone", "preferredDayISO", "preferredHour") SELECT "consultReason", "conversationState", "conversationStateData", "createdAt", "doctorId", "fullName", "id", "insuranceProvider", "needsConsultReason", "needsInsurance", "needsName", "pendingSlotExpiresAt", "pendingSlotHumanLabel", "pendingSlotISO", "pendingSlotReason", "phone", "preferredDayISO", "preferredHour" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_dni_key" ON "Patient"("dni");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
