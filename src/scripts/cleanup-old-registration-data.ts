#!/usr/bin/env tsx
/**
 * Cleanup Old Registration Data Script
 * 
 * This script safely deletes old registration requests and account requests
 * from the database. Use this to clean up test data or old requests.
 * 
 * Usage:
 *   npm run cleanup-registrations [options]
 * 
 * Options:
 *   --dry-run          Show what would be deleted without actually deleting
 *   --all              Delete all registration and account requests
 *   --status=STATUS    Delete only requests with specific status
 *   --older-than=DAYS  Delete only requests older than X days
 *   --table=TABLE      Delete from specific table only (registrationRequest or accountRequest)
 * 
 * Examples:
 *   npm run cleanup-registrations --dry-run --all
 *   npm run cleanup-registrations --status=PENDING_VERIFICATION
 *   npm run cleanup-registrations --older-than=30
 *   npm run cleanup-registrations --table=accountRequest --all
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CleanupOptions {
  dryRun: boolean;
  all: boolean;
  status?: string;
  olderThanDays?: number;
  table?: 'registrationRequest' | 'accountRequest' | 'both';
}

function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    dryRun: false,
    all: false,
    table: 'both'
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg.startsWith('--status=')) {
      options.status = arg.split('=')[1];
    } else if (arg.startsWith('--older-than=')) {
      options.olderThanDays = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--table=')) {
      const table = arg.split('=')[1];
      if (table === 'registrationRequest' || table === 'accountRequest') {
        options.table = table;
      } else {
        console.error(`Invalid table: ${table}. Must be 'registrationRequest' or 'accountRequest'`);
        process.exit(1);
      }
    }
  }

  return options;
}

async function getRegistrationRequestsToDelete(options: CleanupOptions) {
  const where: any = {};

  if (options.status) {
    where.status = options.status;
  }

  if (options.olderThanDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.olderThanDays);
    where.createdAt = { lt: cutoffDate };
  }

  return await prisma.registrationRequest.findMany({
    where: options.all ? {} : where,
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      reviewedBy: true,
      reviewedAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function getAccountRequestsToDelete(options: CleanupOptions) {
  const where: any = {};

  if (options.status) {
    where.status = options.status;
  }

  if (options.olderThanDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.olderThanDays);
    where.createdAt = { lt: cutoffDate };
  }

  return await prisma.accountRequest.findMany({
    where: options.all ? {} : where,
    select: {
      id: true,
      email: true,
      requesterName: true,
      status: true,
      createdAt: true,
      userId: true,
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function deleteRegistrationRequests(ids: string[], dryRun: boolean) {
  if (ids.length === 0) return 0;

  if (dryRun) {
    console.log(`[DRY RUN] Would delete ${ids.length} registration requests`);
    return ids.length;
  }

  const result = await prisma.registrationRequest.deleteMany({
    where: { id: { in: ids } }
  });

  return result.count;
}

async function deleteAccountRequests(ids: string[], dryRun: boolean) {
  if (ids.length === 0) return 0;

  if (dryRun) {
    console.log(`[DRY RUN] Would delete ${ids.length} account requests`);
    return ids.length;
  }

  const result = await prisma.accountRequest.deleteMany({
    where: { id: { in: ids } }
  });

  return result.count;
}

function displayTable(title: string, data: any[]) {
  if (data.length === 0) {
    console.log(`\n${title}: No records found`);
    return;
  }

  console.log(`\n${title}:`);
  console.log('─'.repeat(100));
  
  data.forEach((record, index) => {
    console.log(`${index + 1}. ID: ${record.id}`);
    console.log(`   Email: ${record.email}`);
    console.log(`   Name: ${record.name || record.requesterName}`);
    console.log(`   Status: ${record.status}`);
    console.log(`   Created: ${record.createdAt.toISOString()}`);
    if (record.reviewedBy) {
      console.log(`   Reviewed By: ${record.reviewedBy} at ${record.reviewedAt?.toISOString()}`);
    }
    if (record.userId) {
      console.log(`   User ID: ${record.userId}`);
    }
    console.log('');
  });
}

async function main() {
  const options = parseArgs();

  console.log('🧹 Registration Data Cleanup Tool');
  console.log('================================');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will delete data)'}`);
  console.log(`Target: ${options.table === 'both' ? 'Both tables' : options.table}`);
  
  if (options.all) {
    console.log('Scope: ALL records');
  } else {
    const filters = [];
    if (options.status) filters.push(`Status: ${options.status}`);
    if (options.olderThanDays) filters.push(`Older than ${options.olderThanDays} days`);
    console.log(`Scope: ${filters.length > 0 ? filters.join(', ') : 'No filters (nothing will be deleted)'}`);
  }

  console.log('');

  let registrationRequests: any[] = [];
  let accountRequests: any[] = [];

  // Fetch data based on table selection
  if (options.table === 'registrationRequest' || options.table === 'both') {
    registrationRequests = await getRegistrationRequestsToDelete(options);
  }

  if (options.table === 'accountRequest' || options.table === 'both') {
    accountRequests = await getAccountRequestsToDelete(options);
  }

  // Display what will be deleted
  displayTable('📋 Registration Requests to Delete', registrationRequests);
  displayTable('📋 Account Requests to Delete', accountRequests);

  const totalToDelete = registrationRequests.length + accountRequests.length;

  if (totalToDelete === 0) {
    console.log('✅ No records match the criteria. Nothing to delete.');
    return;
  }

  // Confirmation prompt (skip in dry-run mode)
  if (!options.dryRun) {
    console.log(`\n⚠️  WARNING: This will permanently delete ${totalToDelete} records!`);
    console.log('This action cannot be undone.');
    
    // Simple confirmation - in a real script you might want to use a proper prompt library
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      readline.question('\nType "DELETE" to confirm: ', resolve);
    });

    readline.close();

    if (answer !== 'DELETE') {
      console.log('❌ Deletion cancelled.');
      return;
    }
  }

  // Perform deletions
  console.log('\n🗑️  Deleting records...');

  let deletedCount = 0;

  if (registrationRequests.length > 0) {
    const regIds = registrationRequests.map(r => r.id);
    const deleted = await deleteRegistrationRequests(regIds, options.dryRun);
    deletedCount += deleted;
    console.log(`✅ ${options.dryRun ? 'Would delete' : 'Deleted'} ${deleted} registration requests`);
  }

  if (accountRequests.length > 0) {
    const accIds = accountRequests.map(r => r.id);
    const deleted = await deleteAccountRequests(accIds, options.dryRun);
    deletedCount += deleted;
    console.log(`✅ ${options.dryRun ? 'Would delete' : 'Deleted'} ${deleted} account requests`);
  }

  console.log(`\n🎉 ${options.dryRun ? 'Dry run completed' : 'Cleanup completed'}! ${deletedCount} records ${options.dryRun ? 'would be' : 'were'} deleted.`);
}

main()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
