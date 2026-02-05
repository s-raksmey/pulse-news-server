#!/usr/bin/env node

import {
  promoteUserToAdminByEmail,
  listAdminUsers,
  getUserCountByRole,
  ensureAdminExists,
  UserRole,
} from '../utils/userRoleUtils.js';

/**
 * Admin Management Script
 *
 * This script provides utilities for managing admin users in the system.
 *
 * Usage:
 *   npx tsx src/scripts/createAdmin.ts --email admin@example.com
 *   npx tsx src/scripts/createAdmin.ts --ensure-admin
 *   npx tsx src/scripts/createAdmin.ts --list-admins
 *   npx tsx src/scripts/createAdmin.ts --stats
 *   npx tsx src/scripts/createAdmin.ts --help
 */

function showHelp() {
  console.log(`
🔧 Admin Management Script

This script helps you manage admin users in the pulse-news system.

📋 Available Commands:

  --email <email>     Promote a specific user to admin by email address
                      Example: --email admin@example.com

  --ensure-admin      Automatically ensure at least one admin exists
                      If no admins exist, promotes the first user to admin
                      Useful for initial system setup

  --list-admins       Display all current admin users with their details

  --stats             Show user role statistics (count of each role)

  --help              Display this help information

💡 Examples:

  # Promote a specific user to admin
  npx tsx src/scripts/createAdmin.ts --email admin@example.com

  # Ensure admin exists (useful for initial setup)
  npx tsx src/scripts/createAdmin.ts --ensure-admin

  # List all admins
  npx tsx src/scripts/createAdmin.ts --list-admins

  # Show statistics
  npx tsx src/scripts/createAdmin.ts --stats

⚠️  Important Notes:
  - Users must already be registered in the system
  - Only active users can be promoted to admin
  - This script requires database access
  `);
}

async function promoteUserByEmail(email: string) {
  console.log(`\n🔄 Attempting to promote user to admin: ${email}`);

  const success = await promoteUserToAdminByEmail(email);

  if (success) {
    console.log(`✅ Successfully promoted ${email} to admin role!`);
    process.exit(0);
  } else {
    console.log(`❌ Failed to promote ${email} to admin. Check if user exists and is active.`);
    process.exit(1);
  }
}

async function ensureAdmin() {
  console.log('\n🔄 Ensuring at least one admin user exists...');

  const success = await ensureAdminExists();

  if (success) {
    console.log('✅ Admin user verification complete!');
    process.exit(0);
  } else {
    console.log('❌ Failed to ensure admin exists. Check if any users are registered.');
    process.exit(1);
  }
}

async function listAdmins() {
  console.log('\n👑 Current Admin Users:');

  const admins = await listAdminUsers();

  if (admins.length === 0) {
    console.log('⚠️  No admin users found!');
    console.log('💡 Consider running: npx tsx src/scripts/createAdmin.ts --ensure-admin');
    return;
  }

  console.log(`\nFound ${admins.length} admin user(s):\n`);

  admins.forEach((admin, index) => {
    console.log(`${index + 1}. 👑 ${admin.name} (${admin.email})`);
    console.log(`   ID: ${admin.id}\n`);
  });
}

async function showStats() {
  console.log('\n📊 User Role Statistics:');

  const counts = await getUserCountByRole();

  console.log(`
👑 Admins:  ${counts[UserRole.ADMIN]}
✏️  Editors: ${counts[UserRole.EDITOR]}
📝 Authors: ${counts[UserRole.AUTHOR]}

Total Active Users: ${counts[UserRole.ADMIN] + counts[UserRole.EDITOR] + counts[UserRole.AUTHOR]}
  `);

  if (counts[UserRole.ADMIN] === 0) {
    console.log('⚠️  WARNING: No admin users found!');
    console.log('💡 Consider running: npx tsx src/scripts/createAdmin.ts --ensure-admin');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }

  try {
    if (args.includes('--email')) {
      const emailIndex = args.indexOf('--email');
      const email = args[emailIndex + 1];

      if (!email) {
        console.error('❌ Error: --email requires an email address');
        console.log('💡 Example: --email admin@example.com');
        process.exit(1);
      }

      await promoteUserByEmail(email);
    } else if (args.includes('--ensure-admin')) {
      await ensureAdmin();
    } else if (args.includes('--list-admins')) {
      await listAdmins();
    } else if (args.includes('--stats')) {
      await showStats();
    } else {
      console.error('❌ Unknown command. Use --help for usage information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
