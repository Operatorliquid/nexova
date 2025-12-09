/*
  Warnings:

  - You are about to drop the column `bio` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `consultationPrice` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `emergencyConsultationPrice` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `officeAddress` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `officeCity` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `officeMapsUrl` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Doctor` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappBusinessNumber` on the `Doctor` table. All the data in the column will be lost.

*/
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
    "extraNotes" TEXT
);
INSERT INTO "new_Doctor" ("contactPhone", "email", "id", "name", "passwordHash", "specialty") SELECT "contactPhone", "email", "id", "name", "passwordHash", "specialty" FROM "Doctor";
DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
