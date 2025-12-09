-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "needsName" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Patient" ("fullName", "id", "phone") SELECT "fullName", "id", "phone" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
