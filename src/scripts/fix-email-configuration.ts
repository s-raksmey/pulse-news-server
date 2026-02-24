#!/usr/bin/env tsx
/**
 * Fix Email Configuration Script
 * 
 * This script helps fix common email configuration issues, particularly
 * the "cms-news.gmail.com" DNS resolution error that prevents article
 * workflow actions from completing.
 * 
 * Usage:
 *   npm run fix-email-config -- --check        # Check current configuration
 *   npm run fix-email-config -- --disable      # Disable email notifications
 *   npm run fix-email-config -- --fix-gmail    # Fix Gmail configuration
 *   npm run fix-email-config -- --reset        # Reset to defaults
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isDisable = args.includes('--disable');
  const isFixGmail = args.includes('--fix-gmail');
  const isReset = args.includes('--reset');

  if (!isCheck && !isDisable && !isFixGmail && !isReset) {
    console.log('❌ Please specify an action:');
    console.log('Usage:');
    console.log('  tsx src/scripts/fix-email-configuration.ts --check        # Check current configuration');
    console.log('  tsx src/scripts/fix-email-configuration.ts --disable      # Disable email notifications');
    console.log('  tsx src/scripts/fix-email-configuration.ts --fix-gmail    # Fix Gmail configuration');
    console.log('  tsx src/scripts/fix-email-configuration.ts --reset        # Reset to defaults');
    process.exit(1);
  }

  console.log('🔧 Email Configuration Tool\n');

  if (isCheck) {
    await checkConfiguration();
  } else if (isDisable) {
    await disableEmailNotifications();
  } else if (isFixGmail) {
    await fixGmailConfiguration();
  } else if (isReset) {
    await resetConfiguration();
  }
}

async function checkConfiguration() {
  console.log('📋 Current Email Configuration:\n');

  const settings = await prisma.setting.findMany({
    where: {
      key: {
        startsWith: 'email.'
      }
    },
    orderBy: {
      key: 'asc'
    }
  });

  if (settings.length === 0) {
    console.log('✅ No email settings found in database (using defaults)');
    return;
  }

  console.log('┌─────────────────────────────────┬─────────────────────────────────┐');
  console.log('│ Setting                         │ Value                           │');
  console.log('├─────────────────────────────────┼─────────────────────────────────┤');

  for (const setting of settings) {
    const key = setting.key.padEnd(31);
    let value = '';
    
    if (setting.key.includes('password')) {
      value = setting.value ? '[SET]' : '[NOT SET]';
    } else {
      value = setting.value || '[EMPTY]';
    }
    
    value = value.toString().padEnd(31);
    console.log(`│ ${key} │ ${value} │`);
  }
  console.log('└─────────────────────────────────┴─────────────────────────────────┘\n');

  // Check for problematic configurations
  const smtpHost = settings.find(s => s.key === 'email.smtp_host')?.value;
  if (smtpHost === 'cms-news.gmail.com') {
    console.log('❌ PROBLEM DETECTED: Invalid SMTP host "cms-news.gmail.com"');
    console.log('   This hostname does not exist and will cause DNS resolution errors.');
    console.log('   Run with --fix-gmail to correct this issue.\n');
  } else if (smtpHost && !smtpHost.includes('.')) {
    console.log('⚠️  WARNING: SMTP host may be invalid:', smtpHost);
  } else if (smtpHost) {
    console.log('✅ SMTP host appears valid:', smtpHost);
  }

  const notificationsEnabled = settings.find(s => s.key === 'email.notifications_enabled')?.value;
  if (notificationsEnabled === 'false' || notificationsEnabled === false) {
    console.log('ℹ️  Email notifications are currently disabled');
  } else {
    console.log('ℹ️  Email notifications are enabled');
  }
}

async function disableEmailNotifications() {
  console.log('🔇 Disabling email notifications...\n');

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
  console.log('   Article workflow actions will now complete without sending emails');
  console.log('   You can re-enable them later in Settings > Email\n');
}

async function fixGmailConfiguration() {
  console.log('📧 Fixing Gmail SMTP configuration...\n');

  const updates = [
    { key: 'email.smtp_host', value: 'smtp.gmail.com' },
    { key: 'email.smtp_port', value: '587' },
    { key: 'email.notifications_enabled', value: 'true' }
  ];

  for (const update of updates) {
    await prisma.setting.upsert({
      where: { key: update.key },
      update: { value: update.value },
      create: {
        key: update.key,
        value: update.value,
        type: 'EMAIL'
      }
    });
  }

  console.log('✅ Gmail SMTP configuration updated:');
  console.log('   - SMTP Host: smtp.gmail.com');
  console.log('   - SMTP Port: 587');
  console.log('   - Notifications: Enabled');
  console.log('\n⚠️  IMPORTANT: You still need to configure:');
  console.log('   - SMTP Username (your Gmail address)');
  console.log('   - SMTP Password (Gmail App Password)');
  console.log('   - From Address (your Gmail address)');
  console.log('   Go to Settings > Email in the admin panel to complete setup\n');
}

async function resetConfiguration() {
  console.log('🔄 Resetting email configuration to defaults...\n');

  // Delete all email settings to use defaults
  const deleted = await prisma.setting.deleteMany({
    where: {
      key: {
        startsWith: 'email.'
      }
    }
  });

  console.log(`✅ Deleted ${deleted.count} email settings`);
  console.log('   Email configuration has been reset to defaults');
  console.log('   Email notifications are now disabled (default behavior)\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
