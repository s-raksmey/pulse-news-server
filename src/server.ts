import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { schema } from './graphql/schema.js';
import { createAuthContext } from './middleware/auth.js';

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
  context: async ({ request }) => {
    // Create authentication context for each request
    return await createAuthContext(request);
  },
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Allow admin and web apps
    credentials: true,
  },
  // Add better error handling and logging
  maskedErrors: false, // Show detailed errors in development
  logging: {
    debug: (...args) => console.log('🔍 GraphQL Debug:', ...args),
    info: (...args) => console.log('ℹ️ GraphQL Info:', ...args),
    warn: (...args) => console.warn('⚠️ GraphQL Warning:', ...args),
    error: (...args) => console.error('❌ GraphQL Error:', ...args),
  },
});

createServer(yoga).listen(4000, () => {
  console.log('Pulse News GraphQL API running at http://localhost:4000/graphql');
  console.log('🔐 JWT Authentication middleware enabled');
  console.log('🌐 CORS enabled for localhost:3000 and localhost:3001');
});
