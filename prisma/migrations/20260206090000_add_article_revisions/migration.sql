-- Create enums for revision workflow
CREATE TYPE "ArticleRevisionStatus" AS ENUM ('NONE', 'REQUESTED');
CREATE TYPE "RevisionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Add revision status tracking to articles
ALTER TABLE "Article"
ADD COLUMN "revisionStatus" "ArticleRevisionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "revisionRequestedAt" TIMESTAMP(3);

-- Create revision request table
CREATE TABLE "ArticleRevisionRequest" (
  "id" TEXT NOT NULL,
  "status" "RevisionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "proposedChanges" JSONB NOT NULL,
  "reviewComment" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "articleId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ArticleRevisionRequest_pkey" PRIMARY KEY ("id")
);

-- Create revision history table
CREATE TABLE "ArticleRevision" (
  "id" TEXT NOT NULL,
  "summary" TEXT,
  "changes" JSONB NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "articleId" TEXT NOT NULL,
  "revisionRequestId" TEXT,
  "appliedById" TEXT NOT NULL,

  CONSTRAINT "ArticleRevision_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "ArticleRevisionRequest"
ADD CONSTRAINT "ArticleRevisionRequest_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleRevisionRequest"
ADD CONSTRAINT "ArticleRevisionRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArticleRevisionRequest"
ADD CONSTRAINT "ArticleRevisionRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleRevision"
ADD CONSTRAINT "ArticleRevision_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleRevision"
ADD CONSTRAINT "ArticleRevision_revisionRequestId_fkey"
FOREIGN KEY ("revisionRequestId") REFERENCES "ArticleRevisionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleRevision"
ADD CONSTRAINT "ArticleRevision_appliedById_fkey"
FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ArticleRevisionRequest_articleId_idx" ON "ArticleRevisionRequest"("articleId");
CREATE INDEX "ArticleRevisionRequest_status_idx" ON "ArticleRevisionRequest"("status");
CREATE INDEX "ArticleRevisionRequest_createdAt_idx" ON "ArticleRevisionRequest"("createdAt");

CREATE INDEX "ArticleRevision_articleId_idx" ON "ArticleRevision"("articleId");
CREATE INDEX "ArticleRevision_appliedAt_idx" ON "ArticleRevision"("appliedAt");
