import { PrismaClient, UserRole, ArticleStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed script to create test users with different roles
 * and test articles to verify the role-based access control
 */
async function main() {
  console.log("🌱 Seeding test users and articles...");

  // Hash password for all test users
  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create Admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@pulse-news.com" },
    update: {
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      email: "admin@pulse-news.com",
      password: hashedPassword,
      name: "Admin User",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  // Create Editor user
  const editor = await prisma.user.upsert({
    where: { email: "editor@pulse-news.com" },
    update: {
      role: UserRole.EDITOR,
      isActive: true,
    },
    create: {
      email: "editor@pulse-news.com",
      password: hashedPassword,
      name: "Editor User",
      role: UserRole.EDITOR,
      isActive: true,
    },
  });

  // Create Author user
  const author = await prisma.user.upsert({
    where: { email: "author@pulse-news.com" },
    update: {
      role: UserRole.AUTHOR,
      isActive: true,
    },
    create: {
      email: "author@pulse-news.com",
      password: hashedPassword,
      name: "Author User",
      role: UserRole.AUTHOR,
      isActive: true,
    },
  });

  console.log("✅ Test users created:");
  console.log(`  - Admin: ${admin.email} (${admin.role})`);
  console.log(`  - Editor: ${editor.email} (${editor.role})`);
  console.log(`  - Author: ${author.email} (${author.role})`);

  // Get or create a category for test articles
  const techCategory = await prisma.category.upsert({
    where: { slug: "tech" },
    update: {},
    create: {
      slug: "tech",
      name: "Technology",
    },
  });

  // Create test articles by the author
  const authorArticles = [
    {
      title: "Author's Draft Article",
      slug: "author-draft-article",
      excerpt: "This is a draft article created by an author",
      status: ArticleStatus.DRAFT,
      topic: "ai",
    },
    {
      title: "Author's Article for Review",
      slug: "author-review-article",
      excerpt: "This article is ready for editor review",
      status: ArticleStatus.REVIEW,
      topic: "startups",
    },
    {
      title: "Author's Published Article",
      slug: "author-published-article",
      excerpt: "This article was published by an editor",
      status: ArticleStatus.PUBLISHED,
      topic: "innovation",
      publishedAt: new Date(),
    },
  ];

  for (const articleData of authorArticles) {
    await prisma.article.upsert({
      where: { slug: articleData.slug },
      update: {
        authorId: author.id,
        authorName: author.name,
        status: articleData.status,
        publishedAt: articleData.publishedAt || null,
      },
      create: {
        title: articleData.title,
        slug: articleData.slug,
        excerpt: articleData.excerpt,
        status: articleData.status,
        topic: articleData.topic,
        authorId: author.id,
        authorName: author.name,
        categoryId: techCategory.id,
        publishedAt: articleData.publishedAt || null,
        contentJson: {
          time: Date.now(),
          blocks: [
            { 
              type: "header", 
              data: { text: articleData.title, level: 1 } 
            },
            {
              type: "paragraph",
              data: {
                text: articleData.excerpt,
              },
            },
            {
              type: "paragraph",
              data: {
                text: "This is test content for the article. It demonstrates the role-based access control system.",
              },
            },
          ],
          version: "2.30.2",
        },
      },
    });
  }

  // Create an article by the editor
  await prisma.article.upsert({
    where: { slug: "editor-featured-article" },
    update: {
      authorId: editor.id,
      authorName: editor.name,
    },
    create: {
      title: "Editor's Featured Article",
      slug: "editor-featured-article",
      excerpt: "This is a featured article created by an editor",
      status: ArticleStatus.PUBLISHED,
      topic: "featured",
      authorId: editor.id,
      authorName: editor.name,
      categoryId: techCategory.id,
      publishedAt: new Date(),
      isFeatured: true,
      isEditorsPick: true,
      contentJson: {
        time: Date.now(),
        blocks: [
          { 
            type: "header", 
            data: { text: "Editor's Featured Article", level: 1 } 
          },
          {
            type: "paragraph",
            data: {
              text: "This article was created by an editor and marked as featured.",
            },
          },
        ],
        version: "2.30.2",
      },
    },
  });

  console.log("✅ Test articles created:");
  console.log("  - Author's Draft Article (DRAFT)");
  console.log("  - Author's Article for Review (REVIEW)");
  console.log("  - Author's Published Article (PUBLISHED)");
  console.log("  - Editor's Featured Article (PUBLISHED, FEATURED)");

  // Verify the data
  const userCount = await prisma.user.count();
  const articleCount = await prisma.article.count();
  
  console.log(`\n📊 Database Summary:`);
  console.log(`  - Total Users: ${userCount}`);
  console.log(`  - Total Articles: ${articleCount}`);
  
  // Show articles by status for verification
  const draftCount = await prisma.article.count({ where: { status: ArticleStatus.DRAFT } });
  const reviewCount = await prisma.article.count({ where: { status: ArticleStatus.REVIEW } });
  const publishedCount = await prisma.article.count({ where: { status: ArticleStatus.PUBLISHED } });
  
  console.log(`  - Draft Articles: ${draftCount}`);
  console.log(`  - Review Articles: ${reviewCount}`);
  console.log(`  - Published Articles: ${publishedCount}`);

  console.log("\n🔐 Test Login Credentials:");
  console.log("  Admin:  admin@pulse-news.com / password123");
  console.log("  Editor: editor@pulse-news.com / password123");
  console.log("  Author: author@pulse-news.com / password123");
}

main()
  .catch((e) => {
    console.error("❌ User seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
