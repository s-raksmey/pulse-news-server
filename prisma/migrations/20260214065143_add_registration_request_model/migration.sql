-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestedRole" "UserRole" NOT NULL DEFAULT 'AUTHOR',
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" TEXT,
    "verificationTokenExpiry" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationRequest_email_key" ON "RegistrationRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationRequest_verificationToken_key" ON "RegistrationRequest"("verificationToken");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_idx" ON "RegistrationRequest"("status");

-- CreateIndex
CREATE INDEX "RegistrationRequest_email_idx" ON "RegistrationRequest"("email");

-- CreateIndex
CREATE INDEX "RegistrationRequest_verificationToken_idx" ON "RegistrationRequest"("verificationToken");

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
