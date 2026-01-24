# Pulse News Server

GraphQL API server for the Pulse News application built with Node.js, Prisma, and PostgreSQL.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

3. **Setup database:**
   ```bash
   # Push schema to database
   npm run db:push
   
   # Seed with initial data
   npm run seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Important: Prisma Client Generation

After any schema changes in `prisma/schema.prisma`, you must regenerate the Prisma client:

```bash
npm run prisma:generate
```

**Common Issue:** If you see TypeScript errors like:
```
Property 'setting' does not exist on type 'PrismaClient'
```

This means the Prisma client needs to be regenerated after schema changes. Run:
```bash
npm run prisma:generate
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run prisma:generate` - Generate Prisma client after schema changes
- `npm run prisma:migrate` - Create and apply database migrations
- `npm run prisma:studio` - Open Prisma Studio database browser
- `npm run db:push` - Push schema changes to database
- `npm run seed` - Seed database with initial data
- `npm run diagnose-categories` - Diagnose category system issues
- `npm run fix-categories` - Fix articles with missing categories
- `npm run fix-categories-dry-run` - Preview category fixes without applying

## Database Schema

The application uses PostgreSQL with the following main models:

- **User** - User accounts with role-based access
- **Category** - Article categories (Tech, World, Politics, etc.)
- **Article** - News articles with content, status, and metadata
- **Setting** - System configuration settings
- **ArticleTag** - Tags for articles

## GraphQL API

The server provides a GraphQL API with queries and mutations for:

- **Articles** - CRUD operations, search, filtering
- **Categories** - Category management
- **Users** - Authentication, user management
- **Settings** - System configuration (admin only)

## Environment Variables

Create a `.env` file with:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/pulse_news"
JWT_SECRET="your-jwt-secret"
```

## System Settings

The application includes a comprehensive settings system with 34 configurable options across 8 categories:

- **SITE** - Site name, description, contact info
- **EMAIL** - SMTP configuration, notifications
- **SEO** - Meta tags, analytics, sitemap
- **CONTENT** - Article policies, limits, features
- **USER_MANAGEMENT** - Registration, roles, sessions
- **API** - Rate limiting, CORS, public access
- **THEME** - Colors, dark mode, custom CSS
- **MAINTENANCE** - Maintenance mode, backups, logs

Settings can be managed through GraphQL mutations (admin access required).
