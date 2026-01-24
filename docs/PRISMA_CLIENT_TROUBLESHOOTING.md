# Prisma Client Troubleshooting

## Common Issue: Property 'setting' does not exist on type 'PrismaClient'

### Problem
When integrating the new system settings feature in the admin application, you may encounter TypeScript errors like:

```typescript
Property 'setting' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'.ts(2339)
```

### Root Cause
This error occurs when the Prisma client has not been regenerated after schema changes. The Prisma schema includes the new `Setting` model, but the generated TypeScript types in `@prisma/client` are outdated.

### Solution

**Step 1: Regenerate Prisma Client**
```bash
npm run prisma:generate
```

**Step 2: Verify the Fix**
After running the command, you should see:
```
✔ Generated Prisma Client (v5.22.0) to ./node_modules/@prisma/client
```

**Step 3: Restart TypeScript Server**
In your IDE (VS Code, etc.), restart the TypeScript language server:
- VS Code: `Ctrl/Cmd + Shift + P` → "TypeScript: Restart TS Server"

### Prevention

**Automatic Generation**
The `package.json` now includes a `postinstall` script that automatically runs `prisma generate` after `npm install`:

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

**Manual Generation**
Always run `npm run prisma:generate` after:
- Pulling schema changes from git
- Modifying `prisma/schema.prisma`
- Adding new models or fields

### Verification

To verify the Setting model is available, you can check in your code:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// This should now work without TypeScript errors
const settings = await prisma.setting.findMany();
```

### Related Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Push schema changes to database
npm run db:push

# Seed database with default settings
npm run seed

# Open Prisma Studio to view data
npm run prisma:studio
```

### When This Issue Occurs

This issue typically happens when:

1. **New team members** clone the repository
2. **Schema changes** are pulled from git
3. **Database models** are added or modified
4. **CI/CD deployments** without proper build steps
5. **Package updates** that affect Prisma

### Best Practices

1. **Always run `npm run prisma:generate` after schema changes**
2. **Include Prisma generation in your build process**
3. **Document schema changes in pull requests**
4. **Use the postinstall script for automatic generation**
5. **Restart your development server after generation**

### Additional Resources

- [Prisma Client Generation Docs](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/generating-prisma-client)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [System Settings Documentation](../README.md#system-settings)
