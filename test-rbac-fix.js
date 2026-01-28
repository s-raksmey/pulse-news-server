/**
 * Test script to verify the RBAC article access fix
 * This script tests the role-based access control for articles
 */

const TEST_QUERIES = {
  debugAuth: `
    query DebugAuth {
      debugAuth {
        success
        message
        debug
      }
    }
  `,
  
  debugArticles: `
    query DebugArticles {
      debugArticles {
        success
        message
        debug
      }
    }
  `,
  
  getArticles: `
    query GetArticles {
      articles {
        id
        title
        status
        authorName
        createdAt
      }
    }
  `,
  
  getArticlesByStatus: `
    query GetArticlesByStatus($status: ArticleStatus) {
      articles(status: $status) {
        id
        title
        status
        authorName
        createdAt
      }
    }
  `
};

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

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
    body: JSON.stringify({
      query,
      variables,
    }),
  });
  
  const result = await response.json();
  
  if (result.errors) {
    console.error('GraphQL Errors:', result.errors);
  }
  
  return result;
}

async function loginUser(email, password) {
  const loginMutation = `
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
  `;
  
  const result = await graphqlRequest(loginMutation, { email, password });
  
  if (result.data?.login?.success) {
    return {
      token: result.data.login.token,
      user: result.data.login.user,
    };
  }
  
  throw new Error(`Login failed: ${result.data?.login?.message || 'Unknown error'}`);
}

async function testUserAccess(userType, email, password) {
  console.log(`\n🧪 Testing ${userType.toUpperCase()} access...`);
  console.log(`📧 Email: ${email}`);
  
  try {
    // Login
    const { token, user } = await loginUser(email, password);
    console.log(`✅ Login successful - Role: ${user.role}`);
    
    // Test debug auth
    const debugAuthResult = await graphqlRequest(TEST_QUERIES.debugAuth, {}, token);
    if (debugAuthResult.data?.debugAuth?.success) {
      const debug = debugAuthResult.data.debugAuth.debug;
      console.log(`🔍 Debug Auth - Role: ${debug.user?.role}, Permissions:`, debug.permissions);
    }
    
    // Test debug articles
    const debugArticlesResult = await graphqlRequest(TEST_QUERIES.debugArticles, {}, token);
    if (debugArticlesResult.data?.debugArticles?.success) {
      const debug = debugArticlesResult.data.debugArticles.debug;
      console.log(`🔍 Debug Articles - Visible: ${debug.articleCounts?.visibleToUser}/${debug.articleCounts?.total}`);
      console.log(`🔍 Article Counts:`, debug.articleCounts);
      console.log(`🔍 Query Filter:`, debug.queryFilter);
      
      if (debug.sampleArticles?.length > 0) {
        console.log(`🔍 Sample Articles:`, debug.sampleArticles.map(a => `${a.title} (${a.status})`));
      }
    }
    
    // Test actual articles query
    const articlesResult = await graphqlRequest(TEST_QUERIES.getArticles, {}, token);
    if (articlesResult.data?.articles) {
      const articles = articlesResult.data.articles;
      console.log(`📰 Articles Query - Found: ${articles.length} articles`);
      
      if (articles.length > 0) {
        console.log(`📰 Article Titles:`, articles.map(a => `${a.title} (${a.status})`));
      }
    }
    
    // Test articles by status
    for (const status of ['DRAFT', 'REVIEW', 'PUBLISHED']) {
      const statusResult = await graphqlRequest(TEST_QUERIES.getArticlesByStatus, { status }, token);
      if (statusResult.data?.articles) {
        const count = statusResult.data.articles.length;
        console.log(`📊 ${status} articles: ${count}`);
      }
    }
    
    return {
      success: true,
      user,
      token,
      articlesCount: articlesResult.data?.articles?.length || 0,
    };
    
  } catch (error) {
    console.error(`❌ ${userType} test failed:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🚀 Starting RBAC Article Access Tests');
  console.log(`🌐 GraphQL Endpoint: ${GRAPHQL_ENDPOINT}`);
  
  const testUsers = [
    { type: 'admin', email: 'admin@pulse-news.com', password: 'password123' },
    { type: 'editor', email: 'editor@pulse-news.com', password: 'password123' },
    { type: 'author', email: 'author@pulse-news.com', password: 'password123' },
  ];
  
  const results = {};
  
  for (const testUser of testUsers) {
    results[testUser.type] = await testUserAccess(testUser.type, testUser.email, testUser.password);
  }
  
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  
  for (const [userType, result] of Object.entries(results)) {
    if (result.success) {
      console.log(`✅ ${userType.toUpperCase()}: ${result.user.role} - ${result.articlesCount} articles visible`);
    } else {
      console.log(`❌ ${userType.toUpperCase()}: ${result.error}`);
    }
  }
  
  // Analyze results
  console.log('\n🔍 ANALYSIS');
  console.log('============');
  
  if (results.admin?.success && results.editor?.success && results.author?.success) {
    const adminCount = results.admin.articlesCount;
    const editorCount = results.editor.articlesCount;
    const authorCount = results.author.articlesCount;
    
    console.log(`Admin sees: ${adminCount} articles`);
    console.log(`Editor sees: ${editorCount} articles`);
    console.log(`Author sees: ${authorCount} articles`);
    
    if (adminCount === editorCount && adminCount > authorCount) {
      console.log('✅ RBAC working correctly: Admin and Editor see all articles, Author sees only their own');
    } else if (adminCount === editorCount && adminCount === authorCount) {
      console.log('⚠️  Potential issue: All users see the same number of articles');
    } else {
      console.log('❌ RBAC issue: Unexpected article visibility pattern');
    }
  } else {
    console.log('❌ Cannot analyze: Some user tests failed');
  }
  
  console.log('\n🎯 EXPECTED BEHAVIOR:');
  console.log('- ADMIN: Should see ALL articles (regardless of author)');
  console.log('- EDITOR: Should see ALL articles (regardless of author)');
  console.log('- AUTHOR: Should see ONLY their own articles');
}

// Run the tests
runTests().catch(console.error);
