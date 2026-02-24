import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { schema } from './graphql/schema.js';
import { createAuthContext } from './middleware/auth.js';
import { RegistrationWorkflowService } from './services/registrationWorkflowService.js';

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
  // Add custom request handler for email verification
  fetchAPI: {
    Request: globalThis.Request,
    Response: globalThis.Response,
  },
  plugins: [
    {
      onRequest: async ({ request, fetchAPI }) => {
        const url = new URL(request.url);
        
        // Handle email verification endpoint
        if (url.pathname === '/verify-email') {
          const token = url.searchParams.get('token');
          const email = url.searchParams.get('email');
          
          if (!token || !email) {
            return new fetchAPI.Response(
              `<!DOCTYPE html>
              <html>
                <head><title>Verification Error</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                  <h1 style="color: #dc3545;">❌ Verification Error</h1>
                  <p>Invalid verification link. Missing token or email parameter.</p>
                  <p><a href="http://localhost:3001">← Back to Admin</a></p>
                </body>
              </html>`,
              { 
                status: 400, 
                headers: { 'Content-Type': 'text/html' } 
              }
            );
          }
          
          try {
            const result = await RegistrationWorkflowService.verifyEmail(token, email);
            
            if (result.success) {
              return new fetchAPI.Response(
                `<!DOCTYPE html>
                <html>
                  <head><title>Email Verified</title></head>
                  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h1 style="color: #28a745;">✅ Email Verified Successfully!</h1>
                    <p>Your email has been verified. Your account is now active and you can log in.</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><a href="http://localhost:3001" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Admin Login</a></p>
                  </body>
                </html>`,
                { 
                  status: 200, 
                  headers: { 'Content-Type': 'text/html' } 
                }
              );
            } else {
              return new fetchAPI.Response(
                `<!DOCTYPE html>
                <html>
                  <head><title>Verification Failed</title></head>
                  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h1 style="color: #dc3545;">❌ Verification Failed</h1>
                    <p>${result.message || 'Verification failed. The token may be expired or invalid.'}</p>
                    <p><a href="http://localhost:3001">← Back to Admin</a></p>
                  </body>
                </html>`,
                { 
                  status: 400, 
                  headers: { 'Content-Type': 'text/html' } 
                }
              );
            }
          } catch (error) {
            console.error('Email verification error:', error);
            return new fetchAPI.Response(
              `<!DOCTYPE html>
              <html>
                <head><title>Verification Error</title></head>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                  <h1 style="color: #dc3545;">❌ Verification Error</h1>
                  <p>An error occurred during verification. Please try again or contact support.</p>
                  <p><a href="http://localhost:3001">← Back to Admin</a></p>
                </body>
              </html>`,
              { 
                status: 500, 
                headers: { 'Content-Type': 'text/html' } 
              }
            );
          }
        }
        
        // Continue with normal GraphQL processing
        return undefined;
      }
    }
  ]
});

createServer(yoga).listen(4000, () => {
  console.log('Pulse News GraphQL API running at http://localhost:4000/graphql');
  console.log('📧 Email verification endpoint: http://localhost:4000/verify-email');
  console.log('🔐 JWT Authentication middleware enabled');
  console.log('🌐 CORS enabled for localhost:3000 and localhost:3001');
});
