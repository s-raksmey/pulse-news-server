import { PrismaClient, ArticleStatus } from "@prisma/client";
import { MEGA_NAV } from "../src/data/mega-nav.js"; // ✅ ESM requires .js
import { SETTINGS_CONFIG } from "../src/data/settings-config.js"; // ✅ ESM requires .js

const prisma = new PrismaClient();

/* =========================
   Helpers
========================= */

/**
 * Extract valid topic slugs from MEGA_NAV
 * - ignores "latest"
 * - fully type-safe (string[])
 */
function extractTopics(categorySlug: string): string[] {
  const cfg = MEGA_NAV[categorySlug];
  if (!cfg) return [];

  const allItems = [
    ...cfg.explore.items,
    ...cfg.shop.items,
  ];

  return Array.from(
    new Set(
      allItems
        .map((i) => i.href.split("/").pop())
        .filter(
          (t): t is string =>
            typeof t === "string" && t.length > 0 && t !== "latest"
        )
    )
  );
}

/* =========================
   Seed
========================= */
async function main() {
  console.log("🌱 Seeding categories from MEGA_NAV...");

  const categoryMap: Record<string, string> = {};

  /* ---------- Categories ---------- */
  for (const slug of Object.keys(MEGA_NAV)) {
    const category = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: MEGA_NAV[slug].root.label,
      },
    });

    categoryMap[slug] = category.id;
  }

  console.log("✅ Categories seeded");

  /* ---------- Settings ---------- */
  console.log("🌱 Seeding default settings...");
  
  for (const config of SETTINGS_CONFIG) {
    await prisma.setting.upsert({
      where: { key: config.key },
      update: {}, // Don't overwrite existing settings
      create: {
        key: config.key,
        value: config.defaultValue,
        type: config.type,
        label: config.label,
        description: config.description,
        isPublic: config.isPublic ?? false,
        isRequired: config.isRequired ?? false,
      },
    });
  }
  
  console.log(`✅ ${SETTINGS_CONFIG.length} settings seeded`);

  /* ---------- Sample Article (Tech) ---------- */
  await prisma.article.upsert({
    where: { slug: "welcome-to-pulse-news" },
    update: {},
    create: {
      title: "Welcome to Pulse News",
      slug: "welcome-to-pulse-news",
      excerpt: "A starter article seeded into PostgreSQL via Prisma.",
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      categoryId: categoryMap["tech"],
      topic: extractTopics("tech")[0] ?? null,
      contentJson: {
        time: Date.now(),
        blocks: [
          { type: "header", data: { text: "Pulse News", level: 2 } },
          {
            type: "paragraph",
            data: {
              text: "This article is rendered from Editor.js JSON blocks.",
            },
          },
          {
            type: "quote",
            data: {
              text: "Build fast. Ship safely.",
              caption: "Pulse Team",
            },
          },
          {
            type: "list",
            data: {
              style: "unordered",
              items: [
                "Next.js App Router",
                "GraphQL API",
                "PostgreSQL + Prisma",
              ],
            },
          },
        ],
        version: "2.30.2",
      },
    },
  });

  /* ---------- Sample Article (World) ---------- */
  await prisma.article.upsert({
    where: { slug: "world-briefing-sample" },
    update: {},
    create: {
      title: "World Briefing Sample",
      slug: "world-briefing-sample",
      excerpt: "Sample article in the World category.",
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
      categoryId: categoryMap["world"],
      topic: extractTopics("world")[0] ?? null,
      contentJson: {
        time: Date.now(),
        blocks: [
          { type: "header", data: { text: "World Briefing", level: 2 } },
          {
            type: "paragraph",
            data: {
              text: "This is a sample World article. Replace it with real reporting.",
            },
          },
        ],
        version: "2.30.2",
      },
    },
  });

  console.log("✅ Sample articles seeded");
}

/* =========================
   Run
========================= */
main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
