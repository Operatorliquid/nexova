-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaUrl" TEXT NOT NULL,
    "mediaContentType" TEXT,
    "caption" TEXT,
    "sourceMessageId" TEXT,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
