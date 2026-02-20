#!/usr/bin/env tsx
/**
 * Quick Registration Cleanup Script
 * 
 * This script provides quick cleanup options for common scenarios.
 * For more advanced options, use cleanup-old-registration-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showCurrentData() {
  console.log('📊 Current Registration Data:');
  console.log('============================');

  // Registration Requests
  const regRequests = await prisma.registrationRequest.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n📋 Registration Requests (${regRequests.length} total):`);
  if (regRequests.length === 0) {
    console.log('   No registration requests found');
  } else {
    regRequests.forEach((req, i) => {
      console.log(`   ${i + 1}. ${req.email} (${req.name}) - ${req.status} - ${req.createdAt.toISOString()}`);
    });
  }

  // Account Requests
  const accRequests = await prisma.accountRequest.findMany({
    select: {
      id: true,
      email: true,
      requesterName: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n📋 Account Requests (${accRequests.length} total):`);
  if (accRequests.length === 0) {
    console.log('   No account requests found');
  } else {
    accRequests.forEach((req, i) => {
      console.log(`   ${i + 1}. ${req.email} (${req.requesterName}) - ${req.status} - ${req.createdAt.toISOString()}`);
    });
  }

  return { regRequests, accRequests };
}

async function deleteAllRegistrationRequests() {
  const result = await prisma.registrationRequest.deleteMany({});
  console.log(`✅ Deleted ${result.count} registration requests`);
  return result.count;
}

async function deleteAllAccountRequests() {
  const result = await prisma.accountRequest.deleteMany({});
  console.log(`✅ Deleted ${result.count} account requests`);
  return result.count;
}

async function deletePendingVerificationRequests() {
  const result = await prisma.registrationRequest.deleteMany({
    where: { status: 'PENDING_VERIFICATION' }
  });
  console.log(`✅ Deleted ${result.count} PENDING_VERIFICATION registration requests`);
  return result.count;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('🧹 Quick Registration Cleanup');
  console.log('=============================\n');

  if (!command || command === 'show') {
    await showCurrentData();
    console.log('\n💡 Available commands:');
    console.log('   npm run quick-cleanup show                    # Show current data');
    console.log('   npm run quick-cleanup delete-all             # Delete all requests');
    console.log('   npm run quick-cleanup delete-registration    # Delete all registration requests');
    console.log('   npm run quick-cleanup delete-account         # Delete all account requests');
    console.log('   npm run quick-cleanup delete-pending         # Delete PENDING_VERIFICATION requests');
    return;
  }

  const { regRequests, accRequests } = await showCurrentData();

  switch (command) {
    case 'delete-all':
      console.log('\n⚠️  Deleting ALL registration data...');
      const regDeleted = await deleteAllRegistrationRequests();
      const accDeleted = await deleteAllAccountRequests();
      console.log(`\n🎉 Cleanup completed! Deleted ${regDeleted + accDeleted} total records.`);
      break;

    case 'delete-registration':
      console.log('\n⚠️  Deleting all registration requests...');
      const regCount = await deleteAllRegistrationRequests();
      console.log(`\n🎉 Cleanup completed! Deleted ${regCount} registration requests.`);
      break;

    case 'delete-account':
      console.log('\n⚠️  Deleting all account requests...');
      const accCount = await deleteAllAccountRequests();
      console.log(`\n🎉 Cleanup completed! Deleted ${accCount} account requests.`);
      break;

    case 'delete-pending':
      console.log('\n⚠️  Deleting PENDING_VERIFICATION registration requests...');
      const pendingCount = await deletePendingVerificationRequests();
      console.log(`\n🎉 Cleanup completed! Deleted ${pendingCount} pending verification requests.`);
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Available commands: show, delete-all, delete-registration, delete-account, delete-pending');
      process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
