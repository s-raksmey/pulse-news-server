import { GraphQLContext } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';

const db = prisma as any;

export async function debugCreateCategory(input: any, context: GraphQLContext) {
  try {
    console.log('🔍 DEBUG: createCategory called with input:', JSON.stringify(input));
    console.log('🔍 DEBUG: context.user:', context.user ? { 
      id: context.user.id, 
      role: context.user.role,
      email: context.user.email,
      isActive: context.user.isActive 
    } : 'No user');

    // Test auth step by step
    console.log('🔍 DEBUG: Testing requireAuth...');
    requireAuth(context);
    console.log('✅ DEBUG: Auth check passed');
    
    console.log('🔍 DEBUG: Testing requireAdmin...');
    requireAdmin(context);
    console.log('✅ DEBUG: Admin check passed');

    // Test input validation
    console.log('🔍 DEBUG: Testing input validation...');
    const data = z
      .object({
        name: z.string().min(1, 'Name is required'),
        slug: z.string().min(1, 'Slug is required'),
        theme: z.enum(['DEFAULT', 'MINIMAL', 'MAGAZINE', 'GRID', 'TIMELINE', 'CARDS']).optional(),
        themeConfig: z.any().optional(), // JSON field
      })
      .parse(input);

    console.log('✅ DEBUG: Input validation passed:', data);

    // Test database connection
    console.log('🔍 DEBUG: Testing database connection...');
    const testQuery = await db.category.findMany({ take: 1 });
    console.log('✅ DEBUG: Database connection works, sample categories:', testQuery);

    // Check if slug already exists
    console.log('🔍 DEBUG: Checking for existing category with slug:', data.slug);
    const existingCategory = await db.category.findUnique({
      where: { slug: data.slug },
    });

    console.log('🔍 DEBUG: Existing category check result:', existingCategory ? 'Found existing' : 'No conflict');

    if (existingCategory) {
      console.log('❌ DEBUG: Category with slug already exists:', existingCategory);
      throw new Error('A category with this slug already exists');
    }

    // Test category creation
    console.log('🔍 DEBUG: About to create category in database...');
    console.log('🔍 DEBUG: Create data:', { name: data.name, slug: data.slug });
    
    const newCategory = await db.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        theme: data.theme || 'DEFAULT',
        themeConfig: data.themeConfig || null,
      },
    });

    console.log('✅ DEBUG: Category created successfully:', newCategory);
    return newCategory;
  } catch (error) {
    console.error('❌ DEBUG: Error in createCategory resolver:', error);
    console.error('❌ DEBUG: Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('❌ DEBUG: Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('❌ DEBUG: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Re-throw the error to maintain GraphQL error handling
    throw error;
  }
}
