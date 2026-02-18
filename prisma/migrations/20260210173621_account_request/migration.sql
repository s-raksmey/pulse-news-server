/*
  Warnings:

  - You are about to drop the column `hashedPassword` on the `AccountRequest` table. All the data in the column will be lost.
  - You are about to drop the column `verificationCode` on the `AccountRequest` table. All the data in the column will be lost.
  - You are about to drop the column `verificationCodeExpiry` on the `AccountRequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AccountRequest" DROP COLUMN "hashedPassword",
DROP COLUMN "verificationCode",
DROP COLUMN "verificationCodeExpiry";
