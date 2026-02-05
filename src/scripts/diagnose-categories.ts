import { PrismaClient } from '@prisma/client';
import { MEGA_NAV } from '../data/mega-nav.js';

const prisma = new PrismaClient();

async function diagnoseCategoryIssues() {
  console.log('🔍 Diagnosing category assignment issues...\n');

  try {
    // 1. Check if categories exist in database
    console.log('1️⃣ Checking categories in database:');
    const categories = await prisma.category.findMany({
      select: { id: true, slug: true, name: true, _count: { select: { articles: true } } },
    });

    if (categories.length === 0) {
      console.log('❌ NO CATEGORIES FOUND in database!');
      console.log("   → Run 'npm run seed' to create categories from MEGA_NAV");
    } else {
      console.log(`✅ Found ${categories.length} categories:`);
      categories.forEach((cat) => {
        console.log(`   - ${cat.slug} (${cat.name}) - ${cat._count.articles} articles`);
      });
    }

    // 2. Check MEGA_NAV configuration
    console.log('\n2️⃣ Checking MEGA_NAV configuration:');
    const megaNavSlugs = Object.keys(MEGA_NAV);
    console.log(`✅ MEGA_NAV has ${megaNavSlugs.length} categories: ${megaNavSlugs.join(', ')}`);

    // 3. Compare database vs MEGA_NAV
    console.log('\n3️⃣ Comparing database categories vs MEGA_NAV:');
    const dbSlugs = new Set(categories.map((c) => c.slug));
    const missingSlugs = megaNavSlugs.filter((slug) => !dbSlugs.has(slug));
    const extraSlugs = categories.filter((c) => !megaNavSlugs.includes(c.slug));

    if (missingSlugs.length > 0) {
      console.log(`❌ Missing categories in database: ${missingSlugs.join(', ')}`);
    }
    if (extraSlugs.length > 0) {
      console.log(`⚠️ Extra categories in database: ${extraSlugs.map((c) => c.slug).join(', ')}`);
    }
    if (missingSlugs.length === 0 && extraSlugs.length === 0) {
      console.log('✅ Database categories match MEGA_NAV perfectly');
    }

    // 4. Check articles with null categories
    console.log('\n4️⃣ Checking articles with null categories:');
    const articlesWithNullCategory = await prisma.article.findMany({
      where: { categoryId: null },
      select: { id: true, title: true, slug: true, topic: true, status: true },
    });

    if (articlesWithNullCategory.length > 0) {
      console.log(`❌ Found ${articlesWithNullCategory.length} articles with null categories:`);
      articlesWithNullCategory.forEach((article) => {
        console.log(
          `   - "${article.title}" (${article.slug}) - topic: ${article.topic || 'none'}`
        );
      });
    } else {
      console.log('✅ All articles have categories assigned');
    }

    // 5. Check total articles
    console.log('\n5️⃣ Article summary:');
    const totalArticles = await prisma.article.count();
    const articlesWithCategory = await prisma.article.count({
      where: { categoryId: { not: null } },
    });
    console.log(`📊 Total articles: ${totalArticles}`);
    console.log(`📊 Articles with categories: ${articlesWithCategory}`);
    console.log(`📊 Articles without categories: ${totalArticles - articlesWithCategory}`);

    // 6. Sample article data
    console.log('\n6️⃣ Sample article data:');
    const sampleArticles = await prisma.article.findMany({
      take: 3,
      select: {
        title: true,
        slug: true,
        topic: true,
        categoryId: true,
        category: { select: { slug: true, name: true } },
      },
    });

    sampleArticles.forEach((article) => {
      console.log(`   - "${article.title}"`);
      console.log(`     categoryId: ${article.categoryId || 'null'}`);
      console.log(
        `     category: ${article.category ? `${article.category.slug} (${article.category.name})` : 'null'}`
      );
      console.log(`     topic: ${article.topic || 'null'}`);
    });
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  diagnoseCategoryIssues();
}

export { diagnoseCategoryIssues };
