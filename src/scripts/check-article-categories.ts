#!/usr/bin/env tsx

import { db } from "../lib/db.js";

async function checkArticleCategories() {
  console.log("🔍 Checking article categories...\n");

  // Count total articles
  const totalArticles = await db.article.count();
  console.log(`📊 Total articles: ${totalArticles}`);

  // Count articles with null categories
  const nullCategoryCount = await db.article.count({
    where: { categoryId: null }
  });
  console.log(`❌ Articles with null categories: ${nullCategoryCount}`);

  // Count articles with valid categories
  const validCategoryCount = totalArticles - nullCategoryCount;
  console.log(`✅ Articles with valid categories: ${validCategoryCount}`);

  if (nullCategoryCount > 0) {
    console.log("\n📋 Articles with null categories:");
    const nullCategoryArticles = await db.article.findMany({
      where: { categoryId: null },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10 // Show first 10
    });

    nullCategoryArticles.forEach((article, index) => {
      console.log(`  ${index + 1}. "${article.title}" (${article.slug}) - ${article.status} - ${article.createdAt.toISOString().split('T')[0]}`);
    });

    if (nullCategoryCount > 10) {
      console.log(`  ... and ${nullCategoryCount - 10} more`);
    }
  }

  // Show available categories
  console.log("\n📂 Available categories:");
  const categories = await db.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' }
  });

  categories.forEach((category, index) => {
    console.log(`  ${index + 1}. ${category.name} (${category.slug}) - ID: ${category.id}`);
  });

  console.log("\n✅ Category check complete!");
}

checkArticleCategories()
  .catch(console.error)
  .finally(() => process.exit(0));
