/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Article` table. All the data in the column will be lost.
  - Made the column `categoryId` on table `Article` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_categoryId_fkey";

-- AlterTable
ALTER TABLE "Article" DROP COLUMN "updatedAt",
ADD COLUMN     "topic" TEXT,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "contentJson" DROP DEFAULT,
ALTER COLUMN "categoryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
