-- Add enum for article-level breaking news request status
CREATE TYPE "ArticleBreakingNewsRequestStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- Add request tracking fields to Article
ALTER TABLE "Article"
ADD COLUMN "breakingNewsRequestStatus" "ArticleBreakingNewsRequestStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "breakingNewsRequestedAt" TIMESTAMP(3),
ADD COLUMN "breakingNewsRequestedById" TEXT;

-- Foreign key for requested-by
ALTER TABLE "Article"
ADD CONSTRAINT "Article_breakingNewsRequestedById_fkey"
FOREIGN KEY ("breakingNewsRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for request status
CREATE INDEX "Article_breakingNewsRequestStatus_idx" ON "Article"("breakingNewsRequestStatus");
