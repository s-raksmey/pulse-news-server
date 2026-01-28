/**
 * Test script to verify the "My Articles" feature fix
 * This script tests the authorId parameter functionality
 */

const fetch = require('node-fetch');

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

// Test credentials (created by seed-users.ts)
const TEST_USERS = {
  admin: { email: 'admin@pulse-news.com', password: 'password123' },
  editor: { email: 'editor@pulse-news.com', password: 'password123' },
  author: { email: 'author@pulse-news.com', password: 'password123' }
};

const QUERIES = {
  login: `
    mutation Login($email: String!, $password: String!) {
      login(email: $email, password: $password) {
        success
        message
        token
        user {
          id
          email
          name
          role
        }
      }
    }
  `,
  
  // Test general articles query (no authorId - should use RBAC)
  getArticles: `
    query GetArticles {
      articles {
        id
        title
        status
        authorName
        authorId
      }
    }
  `,
  
  // Test "My Articles" query (with authorId - should filter by author)
  getMyArticles: `
    query GetMyArticles($authorId: ID!) {
      articles(authorId: $authorId) {
        id
        title
        status
        authorName
        authorId
      }
    }
  `
};

async function graphqlRequest(query, variables = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  
  return await response.json();
}

async function loginUser(email, password) {
  const result = await graphqlRequest(QUERIES.login, { email, password });
  if (result.data?.login?.success) {
    return {
      token: result.data.login.token,
      user: result.data.login.user
    };
  }
  throw new Error(`Login failed: ${result.data?.login?.message || 'Unknown error'}`);
}

async function testMyArticlesFeature() {
  console.log('🧪 Testing "My Articles" Feature Fix\n');
  
  try {
    // Test with each user role
    for (const [roleName, credentials] of Object.entries(TEST_USERS)) {
      console.log(`\n📋 Testing with ${roleName.toUpperCase()} user (${credentials.email})`);
      
      // Login
      const { token, user } = await loginUser(credentials.email, credentials.password);
      console.log(`✅ Logged in as: ${user.name} (${user.role})`);
      
      // Test general articles query (RBAC filtering)
      const generalArticles = await graphqlRequest(QUERIES.getArticles, {}, token);
      const generalCount = generalArticles.data?.articles?.length || 0;
      console.log(`📰 General articles query: ${generalCount} articles`);
      
      // Test "My Articles" query (explicit authorId filtering)
      const myArticles = await graphqlRequest(QUERIES.getMyArticles, { authorId: user.id }, token);
      const myCount = myArticles.data?.articles?.length || 0;
      console.log(`👤 My articles query: ${myCount} articles`);
      
      // Analyze results
      if (user.role === 'ADMIN' || user.role === 'EDITOR') {
        console.log(`🔍 Expected: General articles >= My articles (${generalCount} >= ${myCount})`);
        if (generalCount >= myCount) {
          console.log('✅ RBAC working correctly - Admin/Editor can see all articles');
        } else {
          console.log('❌ RBAC issue - Admin/Editor should see more articles in general view');
        }
      } else if (user.role === 'AUTHOR') {
        console.log(`🔍 Expected: General articles = My articles (${generalCount} = ${myCount})`);
        if (generalCount === myCount) {
          console.log('✅ RBAC working correctly - Author sees only own articles');
        } else {
          console.log('❌ RBAC issue - Author should see same count in both views');
        }
      }
      
      // Show sample articles
      if (myArticles.data?.articles?.length > 0) {
        console.log('📄 Sample "My Articles":');
        myArticles.data.articles.slice(0, 3).forEach(article => {
          console.log(`   - ${article.title} (${article.status}) by ${article.authorName}`);
        });
      }
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testMyArticlesFeature();

