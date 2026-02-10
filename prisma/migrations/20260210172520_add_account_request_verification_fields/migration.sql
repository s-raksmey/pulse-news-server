-- AlterTable
ALTER TABLE "AccountRequest" ADD COLUMN     "hashedPassword" TEXT,
ADD COLUMN     "verificationCode" TEXT,
ADD COLUMN     "verificationCodeExpiry" TIMESTAMP(3);
