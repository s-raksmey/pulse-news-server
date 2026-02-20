// src/scripts/test-graphql-registration-requests.ts
// This script can be used to test the GraphQL endpoint directly
// Run this when the server is running to test the registration requests functionality

import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

// GraphQL queries
const LIST_REGISTRATION_REQUESTS_QUERY = `
  query ListRegistrationRequests($input: ListRegistrationRequestsInput) {
    listRegistrationRequests(input: $input) {
      success
      message
      requests {
        id
        email
        name
        requestedRole
        status
        emailVerifiedAt
        reviewedBy
        reviewedAt
        reviewNotes
        ipAddress
        userAgent
        createdAt
        updatedAt
        reviewer {
          id
          name
          email
        }
      }
      totalCount
      hasMore
    }
  }
`;

const GET_REGISTRATION_STATS_QUERY = `
  query GetRegistrationStats {
    getRegistrationStats {
      totalRequests
      pendingVerification
      pendingApproval
      approved
      rejected
      expired
    }
  }
`;

async function testGraphQLEndpoint() {
  console.log('🧪 Testing GraphQL Registration Requests Endpoint...\n');
  console.log(`📡 Endpoint: ${GRAPHQL_ENDPOINT}\n`);

  // You'll need to replace this with a valid admin JWT token
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_JWT_TOKEN_HERE';
  
  if (ADMIN_TOKEN === 'YOUR_ADMIN_JWT_TOKEN_HERE') {
    console.log('❌ Please set ADMIN_TOKEN environment variable with a valid admin JWT token');
    console.log('   You can get this token by logging in as an admin user in the admin panel');
    console.log('   and checking the Authorization header in the browser dev tools.\n');
    return;
  }

  const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  });

  try {
    // Test 1: Get registration stats
    console.log('1. Testing getRegistrationStats query...');
    const statsResult = await client.request(GET_REGISTRATION_STATS_QUERY);
    console.log('✅ Stats query successful:');
    console.log(JSON.stringify(statsResult, null, 2));
    console.log('');

    // Test 2: List all registration requests
    console.log('2. Testing listRegistrationRequests query (all requests)...');
    const allRequestsResult = await client.request(LIST_REGISTRATION_REQUESTS_QUERY, {
      input: {
        limit: 50,
        offset: 0
      }
    });
    console.log('✅ All requests query successful:');
    console.log(`   Success: ${allRequestsResult.listRegistrationRequests.success}`);
    console.log(`   Message: ${allRequestsResult.listRegistrationRequests.message || 'N/A'}`);
    console.log(`   Total Count: ${allRequestsResult.listRegistrationRequests.totalCount}`);
    console.log(`   Returned: ${allRequestsResult.listRegistrationRequests.requests.length} requests`);
    console.log(`   Has More: ${allRequestsResult.listRegistrationRequests.hasMore}`);
    
    if (allRequestsResult.listRegistrationRequests.requests.length > 0) {
      console.log('\n   Sample requests:');
      allRequestsResult.listRegistrationRequests.requests.slice(0, 3).forEach((req: any, index: number) => {
        console.log(`     ${index + 1}. ${req.email} (${req.name})`);
        console.log(`        Status: ${req.status}`);
        console.log(`        Role: ${req.requestedRole}`);
        console.log(`        Created: ${req.createdAt}`);
      });
    }
    console.log('');

    // Test 3: List pending approval requests specifically
    console.log('3. Testing listRegistrationRequests query (PENDING_APPROVAL only)...');
    const pendingResult = await client.request(LIST_REGISTRATION_REQUESTS_QUERY, {
      input: {
        status: 'PENDING_APPROVAL',
        limit: 50,
        offset: 0
      }
    });
    console.log('✅ Pending approval query successful:');
    console.log(`   Success: ${pendingResult.listRegistrationRequests.success}`);
    console.log(`   Returned: ${pendingResult.listRegistrationRequests.requests.length} pending requests`);
    console.log('');

    // Test 4: Test other status filters
    console.log('4. Testing different status filters...');
    const statuses = ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'EXPIRED'];
    
    for (const status of statuses) {
      try {
        const result = await client.request(LIST_REGISTRATION_REQUESTS_QUERY, {
          input: { status, limit: 10, offset: 0 }
        });
        console.log(`   ${status}: ${result.listRegistrationRequests.requests.length} requests`);
      } catch (error) {
        console.log(`   ${status}: Error - ${error}`);
      }
    }

  } catch (error) {
    console.error('❌ GraphQL Error:', error);
    
    if (error && typeof error === 'object' && 'response' in error) {
      const graphqlError = error as any;
      if (graphqlError.response?.errors) {
        console.log('\n📋 GraphQL Error Details:');
        graphqlError.response.errors.forEach((err: any, index: number) => {
          console.log(`   ${index + 1}. ${err.message}`);
          if (err.extensions) {
            console.log(`      Extensions:`, err.extensions);
          }
        });
      }
    }
  }

  console.log('\n🧪 GraphQL testing complete!');
}

// Instructions for running this script
console.log(`
📋 INSTRUCTIONS FOR RUNNING THIS TEST:

1. Make sure the pulse-news-server is running:
   npm run dev

2. Get an admin JWT token:
   - Log into the admin panel as an admin user
   - Open browser dev tools (F12)
   - Go to Network tab
   - Make any GraphQL request (like loading the registration requests page)
   - Find the GraphQL request and copy the Authorization header value
   - The token is the part after "Bearer "

3. Run this script with the token:
   ADMIN_TOKEN="your_jwt_token_here" npx tsx src/scripts/test-graphql-registration-requests.ts

4. Or set the environment variable:
   export ADMIN_TOKEN="your_jwt_token_here"
   npx tsx src/scripts/test-graphql-registration-requests.ts

This will help identify if the issue is:
- Authentication/authorization problems
- GraphQL resolver issues  
- Database connectivity problems
- Data filtering issues
`);

// Only run the test if we're not just showing instructions
if (process.argv.includes('--run')) {
  testGraphQLEndpoint().catch(console.error);
}

