// src/scripts/diagnose-registration-requests.ts
import { prisma } from '../lib/prisma';
import { RegistrationWorkflowService } from '../services/registrationWorkflowService';

async function diagnoseRegistrationRequests() {
  console.log('🔍 Starting Registration Request Diagnosis...\n');

  try {
    // 1. Check database connection
    console.log('1. Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful\n');

    // 2. Check if RegistrationRequest table exists and get count
    console.log('2. Checking RegistrationRequest table...');
    const totalCount = await prisma.registrationRequest.count();
    console.log(`📊 Total registration requests in database: ${totalCount}\n`);

    // 3. Get breakdown by status
    console.log('3. Registration requests by status:');
    const statusCounts = await Promise.all([
      prisma.registrationRequest.count({ where: { status: 'PENDING_VERIFICATION' } }),
      prisma.registrationRequest.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.registrationRequest.count({ where: { status: 'APPROVED' } }),
      prisma.registrationRequest.count({ where: { status: 'REJECTED' } }),
      prisma.registrationRequest.count({ where: { status: 'EXPIRED' } }),
    ]);

    console.log(`   PENDING_VERIFICATION: ${statusCounts[0]}`);
    console.log(`   PENDING_APPROVAL: ${statusCounts[1]}`);
    console.log(`   APPROVED: ${statusCounts[2]}`);
    console.log(`   REJECTED: ${statusCounts[3]}`);
    console.log(`   EXPIRED: ${statusCounts[4]}\n`);

    // 4. Get recent registration requests (last 10)
    console.log('4. Recent registration requests (last 10):');
    const recentRequests = await prisma.registrationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        requestedRole: true,
        emailVerifiedAt: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    if (recentRequests.length === 0) {
      console.log('   ❌ No registration requests found in database');
    } else {
      recentRequests.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req.email} (${req.name})`);
        console.log(`      Status: ${req.status}`);
        console.log(`      Role: ${req.requestedRole}`);
        console.log(`      Created: ${req.createdAt.toISOString()}`);
        console.log(`      Email Verified: ${req.emailVerifiedAt ? req.emailVerifiedAt.toISOString() : 'No'}`);
        console.log(`      Reviewed: ${req.reviewedAt ? req.reviewedAt.toISOString() : 'No'}`);
        console.log('');
      });
    }

    // 5. Test the service method directly
    console.log('5. Testing RegistrationWorkflowService.getRegistrationRequests()...');
    const serviceResult = await RegistrationWorkflowService.getRegistrationRequests();
    console.log(`   Service success: ${serviceResult.success}`);
    console.log(`   Service message: ${serviceResult.message || 'N/A'}`);
    console.log(`   Service returned ${serviceResult.requests.length} requests`);
    console.log(`   Service total count: ${serviceResult.totalCount}`);
    console.log(`   Service has more: ${serviceResult.hasMore}\n`);

    // 6. Test with different status filters
    console.log('6. Testing service with status filters:');
    const statuses = ['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED'];
    
    for (const status of statuses) {
      const result = await RegistrationWorkflowService.getRegistrationRequests(status as any);
      console.log(`   ${status}: ${result.requests.length} requests (success: ${result.success})`);
    }

    // 7. Check for any data inconsistencies
    console.log('\n7. Checking for data inconsistencies...');
    
    // Check for requests with invalid verification tokens
    const invalidTokens = await prisma.registrationRequest.count({
      where: {
        status: 'PENDING_VERIFICATION',
        OR: [
          { verificationToken: null },
          { verificationTokenExpiry: { lt: new Date() } }
        ]
      }
    });
    console.log(`   Requests with invalid/expired tokens: ${invalidTokens}`);

    // Check for approved requests without reviewedBy
    const approvedWithoutReviewer = await prisma.registrationRequest.count({
      where: {
        status: 'APPROVED',
        reviewedBy: null
      }
    });
    console.log(`   Approved requests without reviewer: ${approvedWithoutReviewer}`);

    // 8. Get registration stats using the service method
    console.log('\n8. Testing getRegistrationStats() service method...');
    const stats = await RegistrationWorkflowService.getRegistrationStats();
    console.log('   Stats result:', JSON.stringify(stats, null, 2));

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔍 Diagnosis complete!');
  }
}

// Run the diagnosis
diagnoseRegistrationRequests().catch(console.error);

