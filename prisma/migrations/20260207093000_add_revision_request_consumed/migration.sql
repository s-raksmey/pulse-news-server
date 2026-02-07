ALTER TABLE "ArticleRevisionRequest"
ADD COLUMN "consumedAt" TIMESTAMP(3),
ADD COLUMN "consumedById" TEXT;

ALTER TABLE "ArticleRevisionRequest"
ADD CONSTRAINT "ArticleRevisionRequest_consumedById_fkey"
FOREIGN KEY ("consumedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
