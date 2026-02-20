# Registration Requests Troubleshooting Guide

## Issue Description
User registration requests are not appearing in the admin panel despite users successfully registering. This guide provides diagnostic tools and steps to identify and fix the root cause.

## Diagnostic Tools Created

### 1. Database Diagnostic Script
**File:** `src/scripts/diagnose-registration-requests.ts`
**Purpose:** Check database state and service methods directly
**Usage:**
```bash
npx tsx src/scripts/diagnose-registration-requests.ts
```

This script will:
- Test database connection
- Count registration requests by status
- Show recent requests
- Test service methods
- Check for data inconsistencies

### 2. GraphQL Endpoint Test Script
**File:** `src/scripts/test-graphql-registration-requests.ts`
**Purpose:** Test the GraphQL API directly with admin authentication
**Usage:**
```bash
# First get an admin JWT token from browser dev tools
ADMIN_TOKEN="your_jwt_token_here" npx tsx src/scripts/test-graphql-registration-requests.ts --run
```

This script will:
- Test authentication
- Query registration stats
- List requests with different filters
- Identify GraphQL-specific issues

### 3. Test Data Creator
**File:** `src/scripts/create-test-registration.ts`
**Purpose:** Create test registration requests with different statuses
**Usage:**
```bash
npx tsx src/scripts/create-test-registration.ts
```

This script will create test requests with statuses:
- PENDING_VERIFICATION
- PENDING_APPROVAL
- APPROVED
- REJECTED

### 4. Enhanced Logging
**Files Modified:**
- `src/services/registrationWorkflowService.ts`
- `src/resolvers/registrationRequest.ts`

Added detailed console logging to trace:
- Service method calls and parameters
- Database query results
- GraphQL resolver execution
- Authentication checks

## Troubleshooting Steps

### Step 1: Check Database State
1. Run the database diagnostic script:
   ```bash
   npx tsx src/scripts/diagnose-registration-requests.ts
   ```

2. Look for:
   - Database connection issues
   - Zero registration requests (indicates registration isn't working)
   - Requests stuck in PENDING_VERIFICATION status
   - Service method failures

### Step 2: Test GraphQL API
1. Start the server: `npm run dev`
2. Log into admin panel as admin user
3. Open browser dev tools → Network tab
4. Try to load registration requests page
5. Copy the JWT token from Authorization header
6. Run GraphQL test:
   ```bash
   ADMIN_TOKEN="your_token" npx tsx src/scripts/test-graphql-registration-requests.ts --run
   ```

### Step 3: Check Server Logs
1. Start server with: `npm run dev`
2. Try to load admin registration requests page
3. Check console for the enhanced logging output:
   - `🔍 [GraphQL Resolver] listRegistrationRequests called with:`
   - `🔍 [RegistrationWorkflowService] getRegistrationRequests called with:`
   - `🔍 [RegistrationWorkflowService] Database query results:`

### Step 4: Verify Environment Configuration
1. **Server (.env):**
   - Check `DATABASE_URL` points to correct database
   - Verify database is running and accessible

2. **Admin Panel:**
   - Check `NEXT_PUBLIC_API_URL` in environment
   - Default: `http://localhost:4000/graphql`
   - Verify admin panel can reach the server

### Step 5: Test with Known Data
1. Create test data:
   ```bash
   npx tsx src/scripts/create-test-registration.ts
   ```
2. Check if test requests appear in admin panel
3. If test requests appear but real ones don't, the issue is in the registration process

## Common Issues and Solutions

### Issue 1: No Registration Requests in Database
**Symptoms:** Database diagnostic shows 0 requests
**Cause:** Registration process isn't saving to database
**Solution:** Check registration form submission and `submitRegistrationRequest` function

### Issue 2: Authentication Failure
**Symptoms:** GraphQL test returns "Admin access required"
**Cause:** Invalid JWT token or user doesn't have admin role
**Solution:** 
- Verify admin user exists and has ADMIN role
- Get fresh JWT token from browser
- Check token expiration

### Issue 3: Database Connection Issues
**Symptoms:** "Can't reach database server" errors
**Cause:** Database not running or wrong connection string
**Solution:**
- Start PostgreSQL database
- Verify `DATABASE_URL` in .env
- Check database credentials

### Issue 4: Environment Mismatch
**Symptoms:** Admin panel loads but shows no data
**Cause:** Admin panel connecting to wrong server
**Solution:**
- Check `NEXT_PUBLIC_API_URL` in admin panel
- Verify server is running on expected port
- Check network connectivity

### Issue 5: Status Filter Issues
**Symptoms:** Some statuses show data, others don't
**Cause:** Data inconsistencies or filter logic issues
**Solution:**
- Run database diagnostic to check status distribution
- Verify status enum values match between server and admin
- Check for typos in status strings

## Monitoring and Prevention

### Enable Debug Logging
Add to admin panel `.env`:
```
NEXT_PUBLIC_DEBUG_GRAPHQL=true
```

### Regular Health Checks
1. Monitor registration request counts
2. Check for stuck PENDING_VERIFICATION requests
3. Verify email verification is working
4. Monitor admin approval workflow

### Database Maintenance
1. Clean up expired requests regularly:
   ```bash
   npx tsx src/scripts/cleanup-expired-requests.ts
   ```
2. Monitor database performance
3. Check for orphaned records

## Getting Help

If the issue persists after following this guide:

1. **Collect Diagnostic Information:**
   - Run all diagnostic scripts
   - Capture server logs
   - Note any error messages
   - Document steps that reproduce the issue

2. **Check Recent Changes:**
   - Database schema migrations
   - Environment variable changes
   - Code deployments
   - Infrastructure changes

3. **Verify System Requirements:**
   - PostgreSQL version compatibility
   - Node.js version
   - Package versions

The enhanced logging and diagnostic tools should help identify the exact point where the registration request flow breaks down.

