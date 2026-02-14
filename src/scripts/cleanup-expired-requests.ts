#!/usr/bin/env tsx
// src/scripts/cleanup-expired-requests.ts

import { RegistrationWorkflowService } from '../services/registrationWorkflowService';

/**
 * Cleanup script for expired registration requests
 * This script should be run periodically (e.g., daily via cron job)
 */
async function cleanupExpiredRequests() {
  console.log('🧹 Starting cleanup of expired registration requests...');
  
  try {
    const deletedCount = await RegistrationWorkflowService.cleanupExpiredRequests();
    
    if (deletedCount > 0) {
      console.log(`✅ Successfully cleaned up ${deletedCount} expired registration requests`);
    } else {
      console.log('✅ No expired registration requests found');
    }
    
    // Get current stats after cleanup
    const stats = await RegistrationWorkflowService.getRegistrationStats();
    console.log('📊 Current registration request statistics:');
    console.log(`   Total requests: ${stats.totalRequests}`);
    console.log(`   Pending verification: ${stats.pendingVerification}`);
    console.log(`   Pending approval: ${stats.pendingApproval}`);
    console.log(`   Approved: ${stats.approved}`);
    console.log(`   Rejected: ${stats.rejected}`);
    console.log(`   Expired: ${stats.expired}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupExpiredRequests();
}

export { cleanupExpiredRequests };
