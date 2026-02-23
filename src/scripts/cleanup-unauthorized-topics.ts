#!/usr/bin/env tsx
/**
 * Cleanup script to remove unauthorized topics from the database
 * 
 * This script removes topics that were not created through the admin panel,
 * specifically targeting topics like "Latest", "KP", "SR", "Takeo" that
 * appear in dropdowns but were never authorized by admins.
 * 
 * Usage:
 *   npm run cleanup-topics -- --dry-run  # Preview what will be deleted
 *   npm run cleanup-topics -- --apply    # Actually delete the topics
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List of unauthorized topic slugs that should be removed
const UNAUTHORIZED_TOPICS = [
  'latest',
  'kp', 
  'sr',
  'takeo',
  'trending',
  'featured-stories',
  'view-all-topics',
  'all-nation'
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isApply = process.argv.includes('--apply');

  if (!isDryRun && !isApply) {
    console.log('❌ Please specify either --dry-run or --apply');
    console.log('Usage:');
    console.log('  tsx src/scripts/cleanup-unauthorized-topics.ts --dry-run');
    console.log('  tsx src/scripts/cleanup-unauthorized-topics.ts --apply');
    process.exit(1);
  }

  console.log('🔍 Scanning for unauthorized topics...\n');

  // Find all topics that match unauthorized slugs
  const unauthorizedTopics = await prisma.topic.findMany({
    where: {
      slug: {
        in: UNAUTHORIZED_TOPICS
      }
    },
    include: {
      category: true
    }
  });

  if (unauthorizedTopics.length === 0) {
    console.log('✅ No unauthorized topics found in database');
    return;
  }

  console.log(`Found ${unauthorizedTopics.length} unauthorized topics:`);
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ ID       │ Slug         │ Title        │ Category         │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  
  for (const topic of unauthorizedTopics) {
    const id = topic.id.substring(0, 8);
    const slug = topic.slug.padEnd(12);
    const title = (topic.title || 'N/A').padEnd(12);
    const category = topic.category.name.padEnd(15);
    console.log(`│ ${id} │ ${slug} │ ${title} │ ${category} │`);
  }
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Also find topics that are marked as NOT admin-created
  const nonAdminTopics = await prisma.topic.findMany({
    where: {
      isAdminCreated: false
    },
    include: {
      category: true
    }
  });

  if (nonAdminTopics.length > 0) {
    console.log(`Found ${nonAdminTopics.length} topics marked as NOT admin-created:`);
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ ID       │ Slug         │ Title        │ Category         │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    
    for (const topic of nonAdminTopics) {
      const id = topic.id.substring(0, 8);
      const slug = topic.slug.padEnd(12);
      const title = (topic.title || 'N/A').padEnd(12);
      const category = topic.category.name.padEnd(15);
      console.log(`│ ${id} │ ${slug} │ ${title} │ ${category} │`);
    }
    console.log('└─────────────────────────────────────────────────────────────┘\n');
  }

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('💡 To actually delete these topics, run with --apply flag');
    return;
  }

  if (isApply) {
    console.log('🗑️  APPLYING CLEANUP - Deleting unauthorized topics...\n');

    // Delete unauthorized topics by slug
    const deleteResult = await prisma.topic.deleteMany({
      where: {
        slug: {
          in: UNAUTHORIZED_TOPICS
        }
      }
    });

    console.log(`✅ Deleted ${deleteResult.count} unauthorized topics`);

    // Optionally, also delete all topics marked as NOT admin-created
    console.log('\n❓ Do you also want to delete ALL topics marked as isAdminCreated=false?');
    console.log('   This includes topics not in the unauthorized list above.');
    console.log('   Run this command separately if needed:');
    console.log('   DELETE FROM "Topic" WHERE "isAdminCreated" = false;');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

