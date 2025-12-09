-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DoctorAvailabilityStatus" AS ENUM ('available', 'unavailable', 'vacation');

-- CreateEnum
CREATE TYPE "WhatsappConnectionStatus" AS ENUM ('disconnected', 'pending', 'connected');

-- CreateEnum
CREATE TYPE "WhatsappNumberStatus" AS ENUM ('available', 'reserved', 'assigned');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HEALTH', 'BEAUTY', 'RETAIL');

-- CreateEnum
CREATE TYPE "PatientTagSeverity" AS ENUM ('critical', 'high', 'medium', 'info');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('incoming', 'outgoing');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'template', 'image', 'other');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('WELCOME', 'PROFILE_MENU', 'PROFILE_DNI', 'PROFILE_NAME', 'PROFILE_BIRTHDATE', 'PROFILE_ADDRESS', 'PROFILE_INSURANCE', 'PROFILE_REASON', 'BOOKING_MENU', 'BOOKING_CHOOSE_DAY', 'BOOKING_CHOOSE_SLOT', 'BOOKING_CONFIRM', 'FREE_CHAT', 'UPLOAD_WAITING');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('dashboard', 'whatsapp');

-- CreateTable
CREATE TABLE "Doctor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "businessType" "BusinessType" NOT NULL DEFAULT 'HEALTH',
    "appointmentSlotMinutes" INTEGER,
    "availabilityStatus" "DoctorAvailabilityStatus" NOT NULL DEFAULT 'available',
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
    "profileImageUrl" TEXT,
    "whatsappStatus" "WhatsappConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "whatsappBusinessNumber" TEXT,
    "whatsappConnectedAt" TIMESTAMP(3),

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppNumber" (
    "id" TEXT NOT NULL,
    "displayPhoneNumber" TEXT NOT NULL,
    "status" "WhatsappNumberStatus" NOT NULL DEFAULT 'available',
    "assignedDoctorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "dni" TEXT,
    "phone" TEXT,
    "insuranceProvider" TEXT,
    "consultReason" TEXT,
    "birthDate" TIMESTAMP(3),
    "address" TEXT,
    "occupation" TEXT,
    "maritalStatus" TEXT,
    "preferredDayISO" TIMESTAMP(3),
    "preferredHour" INTEGER,
    "doctorId" INTEGER,
    "needsDni" BOOLEAN NOT NULL DEFAULT false,
    "needsName" BOOLEAN NOT NULL DEFAULT false,
    "needsBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "needsAddress" BOOLEAN NOT NULL DEFAULT false,
    "needsInsurance" BOOLEAN NOT NULL DEFAULT false,
    "needsConsultReason" BOOLEAN NOT NULL DEFAULT false,
    "pendingSlotISO" TIMESTAMP(3),
    "pendingSlotHumanLabel" TEXT,
    "pendingSlotExpiresAt" TIMESTAMP(3),
    "pendingSlotReason" TEXT,
    "conversationState" "ConversationState" NOT NULL DEFAULT 'WELCOME',
    "conversationStateData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "chargedAmount" INTEGER,
    "source" "AppointmentSource" NOT NULL DEFAULT 'dashboard',
    "doctorId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientNote" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" SERIAL NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaContentType" TEXT,
    "caption" TEXT,
    "sourceMessageId" TEXT,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTag" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "severity" "PatientTagSeverity" NOT NULL DEFAULT 'medium',
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "waMessageId" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL,
    "body" TEXT,
    "rawPayload" JSONB,
    "patientId" INTEGER,
    "doctorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_displayPhoneNumber_key" ON "WhatsAppNumber"("displayPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_assignedDoctorId_key" ON "WhatsAppNumber"("assignedDoctorId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_dni_key" ON "Patient"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");

-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTag" ADD CONSTRAINT "PatientTag_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTag" ADD CONSTRAINT "PatientTag_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

