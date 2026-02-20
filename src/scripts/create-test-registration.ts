// src/scripts/create-test-registration.ts
// This script creates test registration requests to help debug the issue

import { prisma } from '../lib/prisma';
import { RegistrationWorkflowService } from '../services/registrationWorkflowService';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

async function createTestRegistrationRequests() {
  console.log('🧪 Creating test registration requests...\n');

  try {
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Create test registration requests with different statuses
    const testRequests = [
      {
        email: 'test-pending-verification@example.com',
        name: 'Test User Pending Verification',
        status: 'PENDING_VERIFICATION',
        needsToken: true
      },
      {
        email: 'test-pending-approval@example.com',
        name: 'Test User Pending Approval',
        status: 'PENDING_APPROVAL',
        needsToken: false
      },
      {
        email: 'test-approved@example.com',
        name: 'Test User Approved',
        status: 'APPROVED',
        needsToken: false
      },
      {
        email: 'test-rejected@example.com',
        name: 'Test User Rejected',
        status: 'REJECTED',
        needsToken: false
      }
    ];

    console.log('Creating test registration requests...\n');

    for (const testReq of testRequests) {
      try {
        // Check if request already exists
        const existing = await prisma.registrationRequest.findUnique({
          where: { email: testReq.email }
        });

        if (existing) {
          console.log(`⚠️  Request for ${testReq.email} already exists, skipping...`);
          continue;
        }

        // Hash a test password
        const hashedPassword = await bcrypt.hash('testpassword123', 12);

        // Create the registration request
        const data: any = {
          email: testReq.email,
          password: hashedPassword,
          name: testReq.name,
          requestedRole: 'AUTHOR',
          status: testReq.status,
          ipAddress: '127.0.0.1',
          userAgent: 'Test Script',
        };

        // Add verification token if needed
        if (testReq.needsToken) {
          data.verificationToken = crypto.randomBytes(32).toString('hex');
          data.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        }

        // Add email verified timestamp for non-verification statuses
        if (testReq.status !== 'PENDING_VERIFICATION') {
          data.emailVerifiedAt = new Date();
        }

        // Add review data for approved/rejected requests
        if (testReq.status === 'APPROVED' || testReq.status === 'REJECTED') {
          // Try to find an admin user to use as reviewer
          const adminUser = await prisma.user.findFirst({
            where: { role: 'ADMIN' }
          });

          if (adminUser) {
            data.reviewedBy = adminUser.id;
            data.reviewedAt = new Date();
            data.reviewNotes = `Test ${testReq.status.toLowerCase()} by script`;
          }
        }

        const created = await prisma.registrationRequest.create({ data });
        console.log(`✅ Created ${testReq.status} request for ${testReq.email} (ID: ${created.id})`);

      } catch (error) {
        console.error(`❌ Failed to create request for ${testReq.email}:`, error);
      }
    }

    console.log('\n📊 Testing service methods...\n');

    // Test the service method
    const allRequests = await RegistrationWorkflowService.getRegistrationRequests();
    console.log(`Service returned ${allRequests.requests.length} total requests (success: ${allRequests.success})`);

    // Test with status filter
    const pendingApproval = await RegistrationWorkflowService.getRegistrationRequests('PENDING_APPROVAL');
    console.log(`Service returned ${pendingApproval.requests.length} PENDING_APPROVAL requests`);

    // Test stats
    const stats = await RegistrationWorkflowService.getRegistrationStats();
    console.log('\nRegistration stats:', JSON.stringify(stats, null, 2));

    console.log('\n✅ Test registration requests created successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Check the admin panel to see if these requests appear');
    console.log('2. Check server logs when loading the admin panel');
    console.log('3. Use the GraphQL test script to verify the API');

  } catch (error) {
    console.error('❌ Error creating test requests:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Instructions
console.log(`
📋 TEST REGISTRATION REQUEST CREATOR

This script creates test registration requests with different statuses
to help debug why requests aren't appearing in the admin panel.

Run with: npx tsx src/scripts/create-test-registration.ts

The script will create:
- PENDING_VERIFICATION request (with verification token)
- PENDING_APPROVAL request (email verified)
- APPROVED request (with reviewer info)
- REJECTED request (with reviewer info)

After running this script:
1. Check the admin panel registration requests page
2. Look at server logs when loading the page
3. Use the GraphQL test script to verify API responses
`);

// Run the script
createTestRegistrationRequests().catch(console.error);

