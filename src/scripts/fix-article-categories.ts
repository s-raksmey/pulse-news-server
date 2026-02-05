import { PrismaClient } from '@prisma/client';
import { MEGA_NAV } from '../data/mega-nav.js';

const prisma = new PrismaClient();

/**
 * Attempts to infer category from article topic
 */
function inferCategoryFromTopic(topic: string | null): string | null {
  if (!topic) return null;

  // Search through MEGA_NAV to find which category contains this topic
  for (const [categorySlug, config] of Object.entries(MEGA_NAV)) {
    const allItems = [...config.explore.items, ...config.shop.items, ...config.more.items];

    // Check if any item href contains this topic
    const hasTopicInHref = allItems.some(
      (item) => item.href.includes(`/${topic}`) || item.href.endsWith(`/${topic}`)
    );

    if (hasTopicInHref) {
      return categorySlug;
    }
  }

  return null;
}

/**
 * Assigns a default category based on common patterns
 */
function getDefaultCategory(): string {
  // Default to 'tech' as it's commonly used
  return 'tech';
}

async function fixArticleCategories(dryRun: boolean = true) {
  console.log(`🔧 ${dryRun ? 'DRY RUN:' : 'FIXING:'} Article categories...\n`);

  try {
    // 1. Ensure categories exist
    console.log('1️⃣ Checking categories in database...');
    const categories = await prisma.category.findMany({
      select: { id: true, slug: true, name: true },
    });

    if (categories.length === 0) {
      console.log('❌ No categories found! Run seed script first:');
      console.log('   npm run seed');
      return;
    }

    const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));
    console.log(`✅ Found ${categories.length} categories`);

    // 2. Find articles with null categories
    console.log('\n2️⃣ Finding articles with null categories...');
    const articlesWithNullCategory = await prisma.article.findMany({
      where: { categoryId: null },
      select: { id: true, title: true, slug: true, topic: true },
    });

    if (articlesWithNullCategory.length === 0) {
      console.log('✅ All articles already have categories assigned!');
      return;
    }

    console.log(`Found ${articlesWithNullCategory.length} articles with null categories`);

    // 3. Process each article
    const fixes: Array<{
      articleId: string;
      title: string;
      inferredCategory: string;
      reason: string;
    }> = [];

    for (const article of articlesWithNullCategory) {
      let inferredCategorySlug: string | null = null;
      let reason = '';

      // Try to infer from topic first
      if (article.topic) {
        inferredCategorySlug = inferCategoryFromTopic(article.topic);
        if (inferredCategorySlug) {
          reason = `inferred from topic "${article.topic}"`;
        }
      }

      // If no inference possible, use default
      if (!inferredCategorySlug) {
        inferredCategorySlug = getDefaultCategory();
        reason = `assigned default category (no topic or topic not found in MEGA_NAV)`;
      }

      // Verify category exists
      if (!categoryMap.has(inferredCategorySlug)) {
        console.log(
          `⚠️ Skipping "${article.title}" - inferred category "${inferredCategorySlug}" not found in database`
        );
        continue;
      }

      fixes.push({
        articleId: article.id,
        title: article.title,
        inferredCategory: inferredCategorySlug,
        reason,
      });
    }

    // 4. Show what would be fixed
    console.log(`\n3️⃣ ${dryRun ? 'Would fix' : 'Fixing'} ${fixes.length} articles:`);
    fixes.forEach((fix, index) => {
      console.log(`   ${index + 1}. "${fix.title}" → ${fix.inferredCategory} (${fix.reason})`);
    });

    // 5. Apply fixes if not dry run
    if (!dryRun && fixes.length > 0) {
      console.log('\n4️⃣ Applying fixes...');

      for (const fix of fixes) {
        const categoryId = categoryMap.get(fix.inferredCategory)!;

        await prisma.article.update({
          where: { id: fix.articleId },
          data: { categoryId },
        });

        console.log(`✅ Fixed "${fix.title}" → ${fix.inferredCategory}`);
      }

      console.log(`\n🎉 Successfully fixed ${fixes.length} articles!`);
    } else if (dryRun) {
      console.log(`\n💡 To apply these fixes, run: npm run fix-categories`);
    }
  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  const dryRun = !process.argv.includes('--apply');
  fixArticleCategories(dryRun);
}

export { fixArticleCategories };
