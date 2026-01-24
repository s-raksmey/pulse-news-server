# Category System Documentation

## Overview

The Pulse News category system manages article categorization using a hierarchical structure defined in `MEGA_NAV` configuration. This document explains how categories work, common issues, and troubleshooting steps.

## Architecture

### Components

1. **MEGA_NAV Configuration** (`src/data/mega-nav.ts`)
   - Defines all available categories and their topics
   - Source of truth for category structure
   - Used by both admin interface and seed script

2. **Database Schema** (`prisma/schema.prisma`)
   - `Category` model with `id`, `slug`, `name`
   - `Article` model with optional `categoryId` foreign key
   - One-to-many relationship: Category → Articles

3. **GraphQL API** (`src/graphql/schema.ts`)
   - `upsertArticle` mutation handles category assignment
   - Category lookup by slug during article creation/editing
   - Returns complete category object in article queries

4. **Admin Interface** (pulse-news-admin)
   - Category dropdown populated from MEGA_NAV
   - Sends `categorySlug` in article mutations
   - Displays category name in article listings

## Category Assignment Flow

```
1. Admin form sends categorySlug (e.g., "tech")
2. GraphQL mutation looks up category by slug
3. If found: assigns categoryId to article
4. If not found: logs warning, assigns null
5. Article saved with categoryId (or null)
6. GraphQL response includes category object
```

## Common Issues & Solutions

### Issue: Articles show "—" (null) for category in admin

**Symptoms:**
- Admin interface displays "—" instead of category name
- GraphQL responses show `"category": null`
- Public website shows "No articles for this topic"

**Diagnosis:**
```bash
npm run diagnose-categories
```

**Common Causes:**

1. **Categories not seeded in database**
   ```bash
   # Solution: Run seed script
   npm run seed
   ```

2. **MEGA_NAV file missing from server**
   - Ensure `src/data/mega-nav.ts` exists in server repository
   - Should match admin repository's MEGA_NAV structure

3. **Existing articles have null categories**
   ```bash
   # Check what would be fixed
   npm run fix-categories-dry-run
   
   # Apply fixes
   npm run fix-categories
   ```

4. **Category slug mismatch**
   - Admin sends categorySlug that doesn't exist in database
   - Check server logs for category lookup debug messages

### Issue: Seed script fails

**Error:** `Cannot find module '../src/data/mega-nav.js'`

**Solution:**
1. Ensure `src/data/mega-nav.ts` exists
2. Verify MEGA_NAV export is correct
3. Check file permissions

### Issue: New articles still get null categories

**Diagnosis:**
1. Check server logs during article creation
2. Look for category assignment debug messages
3. Verify categorySlug being sent from admin

**Solutions:**
1. Ensure categories are seeded: `npm run seed`
2. Check MEGA_NAV structure matches admin expectations
3. Verify GraphQL mutation receives correct categorySlug

## Maintenance Commands

### Diagnostic Commands
```bash
# Check current category system state
npm run diagnose-categories

# View database in browser
npm run prisma:studio
```

### Fix Commands
```bash
# See what articles would be fixed (safe)
npm run fix-categories-dry-run

# Actually fix articles with null categories
npm run fix-categories

# Re-seed categories (safe - uses upsert)
npm run seed
```

### Development Commands
```bash
# Reset database and re-seed
npm run prisma:migrate reset
npm run seed

# Generate Prisma client after schema changes
npm run prisma:generate
```

## Category Structure

Current categories defined in MEGA_NAV:

- **world** - Global news, Asia, Europe, Middle East, Africa
- **tech** - AI, Startups, Gadgets, Cybersecurity  
- **business** - Markets, Economy, Companies, Startups
- **politics** - Elections, Policy, Government
- **sports** - Football, Basketball, International
- **culture** - Arts, Movies, Music

## Troubleshooting Checklist

When categories aren't working:

- [ ] MEGA_NAV file exists in server: `src/data/mega-nav.ts`
- [ ] Categories seeded in database: `npm run diagnose-categories`
- [ ] Admin sends correct categorySlug values
- [ ] GraphQL mutation logs show successful category lookup
- [ ] Existing articles have been fixed: `npm run fix-categories`

## Adding New Categories

1. **Update MEGA_NAV** in both admin and server repositories
2. **Run seed script** to create new categories: `npm run seed`
3. **Fix existing articles** if needed: `npm run fix-categories`
4. **Test** article creation with new category

## Monitoring

Key log messages to watch for:

- `✅ Found category: tech (Tech)` - Successful assignment
- `❌ Category "invalid" not found` - Failed lookup
- `⚠️ CRITICAL: Failed to assign any category` - No fallback worked
- `🔍 Category assignment debug:` - Full assignment details

## API Examples

### GraphQL Query
```graphql
query GetArticles {
  articles {
    id
    title
    category {
      id
      slug
      name
    }
    topic
  }
}
```

### GraphQL Mutation
```graphql
mutation CreateArticle($input: ArticleInput!) {
  upsertArticle(input: $input) {
    id
    title
    category {
      slug
      name
    }
  }
}
```

### Input Example
```json
{
  "input": {
    "title": "AI Breakthrough",
    "slug": "ai-breakthrough",
    "categorySlug": "tech",
    "topic": "ai",
    "status": "PUBLISHED"
  }
}
```
