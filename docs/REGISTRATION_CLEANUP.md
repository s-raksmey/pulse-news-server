# Registration Data Cleanup Guide

This guide explains how to safely delete old user registration requests and account requests from the Pulse News database.

## Overview

The Pulse News system has two types of registration data:

1. **Registration Requests** (`registrationRequest` table) - The correct system used by the admin panel
2. **Account Requests** (`accountRequest` table) - The old system that was incorrectly used by the frontend

After fixing the registration workflow, you may want to clean up old test data or invalid requests.

## Quick Cleanup (Recommended)

For common cleanup scenarios, use the quick cleanup script:

```bash
# Show current registration data
npm run quick-cleanup show

# Delete all registration and account requests
npm run quick-cleanup delete-all

# Delete only registration requests
npm run quick-cleanup delete-registration

# Delete only account requests  
npm run quick-cleanup delete-account

# Delete only PENDING_VERIFICATION requests (old workflow)
npm run quick-cleanup delete-pending
```

## Advanced Cleanup

For more control over what gets deleted, use the advanced cleanup script:

```bash
# Show what would be deleted without actually deleting (dry run)
npm run cleanup-registrations --dry-run --all

# Delete all requests
npm run cleanup-registrations --all

# Delete only requests with specific status
npm run cleanup-registrations --status=PENDING_VERIFICATION
npm run cleanup-registrations --status=PENDING_APPROVAL
npm run cleanup-registrations --status=REJECTED

# Delete only requests older than X days
npm run cleanup-registrations --older-than=30

# Delete from specific table only
npm run cleanup-registrations --table=accountRequest --all
npm run cleanup-registrations --table=registrationRequest --status=EXPIRED

# Combine filters
npm run cleanup-registrations --status=PENDING_VERIFICATION --older-than=7
```

## Common Cleanup Scenarios

### After Fixing Registration Workflow

If you've just deployed the registration workflow fixes, you may want to clean up old data:

```bash
# 1. First, see what data exists
npm run quick-cleanup show

# 2. Delete all old account requests (wrong system)
npm run quick-cleanup delete-account

# 3. Delete old PENDING_VERIFICATION requests (old workflow)
npm run quick-cleanup delete-pending
```

### Before Production Deployment

Clean up all test data:

```bash
# Delete everything
npm run quick-cleanup delete-all
```

### Regular Maintenance

Clean up old rejected or expired requests:

```bash
# Delete rejected requests older than 30 days
npm run cleanup-registrations --status=REJECTED --older-than=30

# Delete expired requests
npm run cleanup-registrations --status=EXPIRED
```

## Safety Features

### Dry Run Mode

Always test your cleanup commands with `--dry-run` first:

```bash
npm run cleanup-registrations --dry-run --all
```

This shows exactly what would be deleted without making any changes.

### Confirmation Prompts

The advanced cleanup script requires typing "DELETE" to confirm destructive operations.

### Data Display

Both scripts show detailed information about what will be deleted:
- Record IDs
- Email addresses
- Names
- Status
- Creation dates
- Review information

## Database Tables

### Registration Requests Table

```sql
-- Current correct system used by admin panel
SELECT id, email, name, status, "createdAt" 
FROM "RegistrationRequest" 
ORDER BY "createdAt" DESC;
```

**Status Values:**
- `PENDING_APPROVAL` - Waiting for admin review (new workflow)
- `APPROVED` - Admin approved, user can verify email
- `REJECTED` - Admin rejected
- `EXPIRED` - Verification token expired
- `PENDING_VERIFICATION` - Old workflow status (should be cleaned up)

### Account Requests Table

```sql
-- Old incorrect system (should be cleaned up)
SELECT id, email, "requesterName", status, "createdAt" 
FROM "AccountRequest" 
ORDER BY "createdAt" DESC;
```

**Status Values:**
- `pending` - Waiting for review
- `approved` - Approved
- `rejected` - Rejected
- `awaiting_verification` - Waiting for email verification
- `active` - Account activated

## Related Information

- **Registration Workflow Fix**: See [PR #56](https://github.com/s-raksmey/pulse-news-server/pull/56)
- **Frontend Fix**: See [PR #132](https://github.com/s-raksmey/pulse-news-admin/pull/132)
- **Diagnostic Scripts**: Use `src/scripts/diagnose-registration-requests.ts` to analyze data

## Troubleshooting

### Script Permissions

If you get permission errors, make sure the scripts are executable:

```bash
chmod +x src/scripts/cleanup-old-registration-data.ts
chmod +x src/scripts/quick-cleanup-registrations.ts
```

### Database Connection

Ensure your `.env` file has the correct `DATABASE_URL` configured.

### TypeScript Errors

If you get TypeScript compilation errors, try:

```bash
npm run prisma:generate
```

## Warning ⚠️

**These operations permanently delete data and cannot be undone.**

Always:
1. **Backup your database** before running cleanup operations in production
2. **Use dry-run mode** first to verify what will be deleted
3. **Test on a development environment** before running in production
4. **Coordinate with your team** before deleting data that others might be working with

## Examples

### Example 1: Clean Development Environment

```bash
# See what exists
npm run quick-cleanup show

# Output:
# 📊 Current Registration Data:
# ============================
# 
# 📋 Registration Requests (3 total):
#    1. test@example.com (Test User) - PENDING_VERIFICATION - 2024-01-15T10:30:00.000Z
#    2. user@test.com (Another User) - PENDING_APPROVAL - 2024-01-15T11:00:00.000Z
#    3. old@request.com (Old Request) - REJECTED - 2024-01-10T09:00:00.000Z
# 
# 📋 Account Requests (2 total):
#    1. wrong@system.com (Wrong System) - pending - 2024-01-14T15:30:00.000Z
#    2. another@wrong.com (Another Wrong) - approved - 2024-01-13T12:00:00.000Z

# Clean up old account requests (wrong system)
npm run quick-cleanup delete-account

# Clean up old PENDING_VERIFICATION requests
npm run quick-cleanup delete-pending
```

### Example 2: Production Maintenance

```bash
# Dry run to see what would be deleted
npm run cleanup-registrations --dry-run --status=REJECTED --older-than=90

# If satisfied with the results, run for real
npm run cleanup-registrations --status=REJECTED --older-than=90
```
