-- Create enum for breaking news request status
CREATE TYPE "BreakingNewsRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Create breaking news request table
CREATE TABLE "BreakingNewsRequest" (
  "id" TEXT NOT NULL,
  "status" "BreakingNewsRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "reviewComment" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "articleId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BreakingNewsRequest_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "BreakingNewsRequest"
ADD CONSTRAINT "BreakingNewsRequest_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BreakingNewsRequest"
ADD CONSTRAINT "BreakingNewsRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BreakingNewsRequest"
ADD CONSTRAINT "BreakingNewsRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "BreakingNewsRequest_articleId_idx" ON "BreakingNewsRequest"("articleId");
CREATE INDEX "BreakingNewsRequest_status_idx" ON "BreakingNewsRequest"("status");
CREATE INDEX "BreakingNewsRequest_createdAt_idx" ON "BreakingNewsRequest"("createdAt");
