#!/usr/bin/env tsx
/**
 * Disable Email Notifications Script
 * 
 * This script disables email notifications to prevent the cms-news.gmail.com
 * DNS resolution error from blocking article workflow actions.
 * 
 * Usage:
 *   npm run disable-email-notifications
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Disabling email notifications to fix article workflow...\n');

  try {
    // Disable email notifications
    await prisma.setting.upsert({
      where: { key: 'email.notifications_enabled' },
      update: { value: 'false' },
      create: {
        key: 'email.notifications_enabled',
        value: 'false',
        type: 'EMAIL'
      }
    });

    console.log('✅ Email notifications have been disabled');
    console.log('✅ Article workflow actions will now complete successfully');
    console.log('✅ Users can create and save articles without DNS errors\n');
    
    console.log('📋 What this fixes:');
    console.log('   - Prevents "getaddrinfo ENOTFOUND cms-news.gmail.com" error');
    console.log('   - Allows article creation/submission to complete');
    console.log('   - Workflow actions no longer blocked by email issues\n');
    
    console.log('🔄 To re-enable email notifications later:');
    console.log('   1. Go to Settings > Email in the admin panel');
    console.log('   2. Configure valid SMTP settings');
    console.log('   3. Enable email notifications');
    
  } catch (error) {
    console.error('❌ Failed to disable email notifications:', error);
    process.exit(1);
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
