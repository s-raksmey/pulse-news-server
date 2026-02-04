#!/usr/bin/env tsx

import { db } from "../lib/db.js";

async function checkArticleCategories() {
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
    });
  }

  // Show available categories
  const categories = await db.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' }
  });

  categories.forEach((category, index) => {
  });
}

checkArticleCategories()
  .catch(() => {})
  .finally(() => process.exit(0));
