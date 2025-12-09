-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "doctorId" INTEGER,
    "needsName" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("fullName", "id", "needsName", "phone") SELECT "fullName", "id", "needsName", "phone" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
