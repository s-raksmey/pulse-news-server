import { prisma } from '../lib/prisma';
import { z } from 'zod';

/**
 * Search Service for Pulse News
 * Implements full-text search with PostgreSQL and advanced filtering
 */

// Search input validation schema
export const SearchInput = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Search query too long'),
  categorySlug: z.string().optional(),
  tags: z.array(z.string()).optional(),
  authorName: z.string().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sortBy: z.enum(['relevance', 'date', 'views', 'title']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  take: z.number().min(1).max(100).default(20),
  skip: z.number().min(0).default(0),
});

export type SearchInputType = z.infer<typeof SearchInput>;

// Search result type
export interface SearchResult {
  articles: any[];
  totalCount: number;
  hasMore: boolean;
  searchMeta: {
    query: string;
    totalResults: number;
    searchTime: number;
    filters: {
      category?: string;
      tags?: string[];
      author?: string;
      status?: string;
      dateRange?: {
        from?: string;
        to?: string;
      };
    };
  };
}

// Search analytics type
export interface SearchAnalytics {
  id: string;
  query: string;
  resultsCount: number;
  searchTime: number;
  filters: any;
  userId?: string;
  createdAt: Date;
}

/**
 * Main search function with full-text search and filtering
 */
export async function searchArticles(
  input: SearchInputType,
  userId?: string
): Promise<SearchResult> {
  const startTime = Date.now();

  // Validate input
  const validatedInput = SearchInput.parse(input);
  const {
    query,
    categorySlug,
    tags,
    authorName,
    status,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
    take,
    skip,
  } = validatedInput;

  // Build where clause for filtering
  const whereClause: any = {};

  // Status filter (default to PUBLISHED for public searches)
  if (status) {
    whereClause.status = status;
  } else {
    whereClause.status = 'PUBLISHED';
  }

  // Category filter
  if (categorySlug) {
    whereClause.category = {
      slug: categorySlug,
    };
  }

  // Author filter
  if (authorName) {
    whereClause.authorName = {
      contains: authorName,
      mode: 'insensitive',
    };
  }

  // Date range filter
  if (dateFrom || dateTo) {
    whereClause.publishedAt = {};
    if (dateFrom) {
      whereClause.publishedAt.gte = new Date(dateFrom);
    }
    if (dateTo) {
      whereClause.publishedAt.lte = new Date(dateTo);
    }
  }

  // Tags filter
  if (tags && tags.length > 0) {
    whereClause.tags = {
      some: {
        tag: {
          slug: {
            in: tags,
          },
        },
      },
    };
  }

  // Build order by clause
  let orderBy: any = {};
  switch (sortBy) {
    case 'date':
      orderBy = { publishedAt: sortOrder };
      break;
    case 'views':
      orderBy = { viewCount: sortOrder };
      break;
    case 'title':
      orderBy = { title: sortOrder };
      break;
    case 'relevance':
    default:
      // For relevance, we'll use a combination of factors
      orderBy = [
        { isFeatured: 'desc' },
        { isEditorsPick: 'desc' },
        { viewCount: 'desc' },
        { publishedAt: 'desc' },
      ];
      break;
  }

  try {
    // For full-text search, we'll use PostgreSQL's built-in text search
    // This is a simplified version - in production, you might want to use
    // more advanced search solutions like Elasticsearch

    let articles: any[] = [];
    let totalCount = 0;

    if (query.trim()) {
      // For now, we'll use a simpler approach with LIKE queries
      // In production, you'd want to implement proper full-text search with PostgreSQL or Elasticsearch

      // Build search where clause
      const searchWhere = {
        ...whereClause,
        OR: [
          {
            title: {
              contains: query,
              mode: 'insensitive' as const,
            },
          },
          {
            excerpt: {
              contains: query,
              mode: 'insensitive' as const,
            },
          },
          {
            authorName: {
              contains: query,
              mode: 'insensitive' as const,
            },
          },
        ],
      };

      // Get search results with proper ordering
      let searchOrderBy: any = orderBy;
      if (sortBy === 'relevance') {
        // For relevance, prioritize title matches, then featured articles
        searchOrderBy = [
          { isFeatured: 'desc' },
          { isEditorsPick: 'desc' },
          { viewCount: 'desc' },
          { publishedAt: 'desc' },
        ];
      }

      const [searchResults, countResult] = await Promise.all([
        prisma.article.findMany({
          where: searchWhere,
          orderBy: searchOrderBy,
          take,
          skip,
          select: {
            id: true,
            title: true,
            slug: true,
            excerpt: true,
            status: true,
            topic: true,
            coverImageUrl: true,
            authorName: true,
            seoTitle: true,
            seoDescription: true,
            ogImageUrl: true,
            isFeatured: true,
            isEditorsPick: true,
            isBreaking: true,
            pinnedAt: true,
            viewCount: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            categoryId: true,
          },
        }),
        prisma.article.count({
          where: searchWhere,
        }),
      ]);

      articles = searchResults;
      totalCount = countResult;
    } else {
      // If no search query, just filter and sort
      const [articlesResult, countResult] = await Promise.all([
        prisma.article.findMany({
          where: whereClause,
          orderBy,
          take,
          skip,
          select: {
            id: true,
            title: true,
            slug: true,
            excerpt: true,
            status: true,
            topic: true,
            coverImageUrl: true,
            authorName: true,
            seoTitle: true,
            seoDescription: true,
            ogImageUrl: true,
            isFeatured: true,
            isEditorsPick: true,
            isBreaking: true,
            pinnedAt: true,
            viewCount: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            categoryId: true,
          },
        }),
        prisma.article.count({
          where: whereClause,
        }),
      ]);

      articles = articlesResult;
      totalCount = countResult;
    }

    const searchTime = Date.now() - startTime;

    // Log search analytics (optional - can be disabled in production)
    if (process.env.ENABLE_SEARCH_ANALYTICS !== 'false') {
      await logSearchAnalytics({
        query,
        resultsCount: totalCount,
        searchTime,
        filters: {
          category: categorySlug,
          tags,
          author: authorName,
          status,
          dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : undefined,
        },
        userId,
      });
    }

    return {
      articles,
      totalCount,
      hasMore: skip + take < totalCount,
      searchMeta: {
        query,
        totalResults: totalCount,
        searchTime,
        filters: {
          category: categorySlug,
          tags,
          author: authorName,
          status,
          dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : undefined,
        },
      },
    };
  } catch (error) {
    console.error('Search error:', error);
    throw new Error('Search failed. Please try again.');
  }
}

/**
 * Get popular search queries for analytics
 */
export async function getPopularSearchQueries(limit: number = 10): Promise<any[]> {
  try {
    // This would require a SearchAnalytics table - for now return empty
    // In a full implementation, you'd query the analytics table
    return [];
  } catch (error) {
    console.error('Error getting popular search queries:', error);
    return [];
  }
}

/**
 * Get search suggestions based on article titles and tags
 */
export async function getSearchSuggestions(query: string, limit: number = 5): Promise<string[]> {
  try {
    if (!query || query.length < 2) return [];

    const suggestions: string[] = [];

    // Get suggestions from article titles
    const titleSuggestions = await prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        title: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        title: true,
      },
      take: limit,
      orderBy: {
        viewCount: 'desc',
      },
    });

    suggestions.push(...titleSuggestions.map((a) => a.title));

    // Get suggestions from tags if we need more
    if (suggestions.length < limit) {
      const tagSuggestions = await prisma.tag.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
        select: {
          name: true,
        },
        take: limit - suggestions.length,
        orderBy: {
          name: 'asc',
        },
      });

      suggestions.push(...tagSuggestions.map((t) => t.name));
    }

    // Remove duplicates and return
    return Array.from(new Set(suggestions)).slice(0, limit);
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return [];
  }
}

/**
 * Log search analytics (simplified version)
 */
async function logSearchAnalytics(
  analytics: Omit<SearchAnalytics, 'id' | 'createdAt'>
): Promise<void> {
  try {
    // In a full implementation, you'd save this to a SearchAnalytics table
    // For now, just log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Search Analytics:', {
        query: analytics.query,
        resultsCount: analytics.resultsCount,
        searchTime: `${analytics.searchTime}ms`,
        filters: analytics.filters,
        userId: analytics.userId || 'anonymous',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error logging search analytics:', error);
    // Don't throw - analytics logging shouldn't break search
  }
}

/**
 * Clean and normalize search query
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 200); // Limit length
}

/**
 * Highlight search terms in text (for frontend use)
 */
export function highlightSearchTerms(text: string, query: string): string {
  if (!query || !text) return text;

  const terms = query.split(' ').filter((term) => term.length > 1);
  let highlightedText = text;

  terms.forEach((term) => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
  });

  return highlightedText;
}
