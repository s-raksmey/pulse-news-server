import { prisma } from '../lib/prisma';
import { z } from 'zod';

/**
 * Enhanced Related Articles Service for Pulse News
 * Implements multiple algorithms for finding related content with caching
 */

// Related articles input validation
export const RelatedArticlesInput = z.object({
  slug: z.string().min(1, 'Article slug is required'),
  limit: z.number().min(1).max(20).default(6),
  algorithm: z.enum(['hybrid', 'tags', 'category', 'content', 'popularity']).default('hybrid'),
  includeBreaking: z.boolean().default(false),
  excludeIds: z.array(z.string()).optional(),
});

export type RelatedArticlesInputType = z.infer<typeof RelatedArticlesInput>;

// Related articles result type
export interface RelatedArticlesResult {
  articles: any[];
  algorithm: string;
  totalFound: number;
  cacheHit: boolean;
  processingTime: number;
  scores?: { [articleId: string]: number };
}

// Article similarity score interface
interface ArticleSimilarity {
  id: string;
  score: number;
  reasons: string[];
}

// Cache interface (in production, use Redis)
interface CacheEntry {
  articles: any[];
  algorithm: string;
  totalFound: number;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache (replace with Redis in production)
const relatedArticlesCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Main function to get related articles using enhanced algorithms
 */
export async function getRelatedArticles(input: RelatedArticlesInputType): Promise<RelatedArticlesResult> {
  const startTime = Date.now();
  
  // Validate input
  const validatedInput = RelatedArticlesInput.parse(input);
  const { slug, limit, algorithm, includeBreaking, excludeIds } = validatedInput;

  // Check cache first
  const cacheKey = `related:${slug}:${algorithm}:${limit}:${includeBreaking}:${excludeIds?.join(',')}`;
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    return {
      ...cached,
      cacheHit: true,
      processingTime: Date.now() - startTime,
    };
  }

  try {
    // Get the source article
    const sourceArticle = await prisma.article.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        excerpt: true,
        categoryId: true,
        authorName: true,
        viewCount: true,
        publishedAt: true,
        isFeatured: true,
        isEditorsPick: true,
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                slug: true,
                name: true,
              }
            }
          }
        },
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
          }
        }
      }
    });

    if (!sourceArticle) {
      return {
        articles: [],
        algorithm,
        totalFound: 0,
        cacheHit: false,
        processingTime: Date.now() - startTime,
      };
    }

    let relatedArticles: any[] = [];
    let scores: { [articleId: string]: number } = {};

    // Apply the selected algorithm
    switch (algorithm) {
      case 'hybrid':
        const hybridResult = await getHybridRelatedArticles(sourceArticle, limit, excludeIds);
        relatedArticles = hybridResult.articles;
        scores = hybridResult.scores;
        break;
      
      case 'tags':
        relatedArticles = await getTagBasedRelatedArticles(sourceArticle, limit, excludeIds);
        break;
      
      case 'category':
        relatedArticles = await getCategoryBasedRelatedArticles(sourceArticle, limit, excludeIds);
        break;
      
      case 'content':
        relatedArticles = await getContentBasedRelatedArticles(sourceArticle, limit, excludeIds);
        break;
      
      case 'popularity':
        relatedArticles = await getPopularityBasedRelatedArticles(sourceArticle, limit, excludeIds);
        break;
      
      default:
        relatedArticles = await getHybridRelatedArticles(sourceArticle, limit, excludeIds).then(r => r.articles);
    }

    // Filter out breaking news if not requested
    if (!includeBreaking) {
      relatedArticles = relatedArticles.filter(article => !article.isBreaking);
    }

    // Ensure we don't exceed the limit
    relatedArticles = relatedArticles.slice(0, limit);

    const result: RelatedArticlesResult = {
      articles: relatedArticles,
      algorithm,
      totalFound: relatedArticles.length,
      cacheHit: false,
      processingTime: Date.now() - startTime,
      scores: Object.keys(scores).length > 0 ? scores : undefined,
    };

    // Cache the result
    setCache(cacheKey, result);

    return result;

  } catch (error) {
    console.error('Error getting related articles:', error);
    return {
      articles: [],
      algorithm,
      totalFound: 0,
      cacheHit: false,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Hybrid algorithm combining multiple factors for best results
 */
async function getHybridRelatedArticles(
  sourceArticle: any, 
  limit: number, 
  excludeIds?: string[]
): Promise<{ articles: any[], scores: { [articleId: string]: number } }> {
  
  const tagIds = sourceArticle.tags?.map((t: any) => t.tag.id) || [];
  const categoryId = sourceArticle.categoryId;
  
  // Build exclusion list
  const excludeList = [sourceArticle.id, ...(excludeIds || [])];

  // Get potential candidates from multiple sources
  const [tagMatches, categoryMatches, popularArticles] = await Promise.all([
    // Articles with shared tags
    tagIds.length > 0 ? prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        id: { notIn: excludeList },
        tags: { some: { tagId: { in: tagIds } } },
      },
      select: getArticleSelectFields(),
      take: limit * 3, // Get more candidates for scoring
    }) : [],

    // Articles in same category
    categoryId ? prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        id: { notIn: excludeList },
        categoryId: categoryId,
      },
      select: getArticleSelectFields(),
      take: limit * 2,
    }) : [],

    // Popular articles as fallback
    prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        id: { notIn: excludeList },
      },
      select: getArticleSelectFields(),
      orderBy: { viewCount: 'desc' },
      take: limit,
    })
  ]);

  // Combine and deduplicate candidates
  const candidatesMap = new Map<string, any>();
  [...tagMatches, ...categoryMatches, ...popularArticles].forEach(article => {
    if (!candidatesMap.has(article.id)) {
      candidatesMap.set(article.id, article);
    }
  });

  const candidates = Array.from(candidatesMap.values());

  // Calculate similarity scores for each candidate
  const scoredArticles: ArticleSimilarity[] = candidates.map(candidate => {
    const score = calculateHybridSimilarityScore(sourceArticle, candidate);
    return {
      id: candidate.id,
      score: score.total,
      reasons: score.reasons,
    };
  });

  // Sort by score and take top results
  scoredArticles.sort((a, b) => b.score - a.score);
  const topScoredIds = scoredArticles.slice(0, limit).map(s => s.id);
  
  // Get the final articles in the correct order
  const finalArticles = topScoredIds.map(id => candidatesMap.get(id)).filter(Boolean);

  // Create scores map
  const scores: { [articleId: string]: number } = {};
  scoredArticles.slice(0, limit).forEach(scored => {
    scores[scored.id] = scored.score;
  });

  return { articles: finalArticles, scores };
}

/**
 * Calculate hybrid similarity score between two articles
 */
function calculateHybridSimilarityScore(sourceArticle: any, candidateArticle: any): { total: number, reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Tag similarity (40% weight)
  const sourceTagIds = new Set(sourceArticle.tags?.map((t: any) => t.tag.id) || []);
  const candidateTagIds = new Set(candidateArticle.tags?.map((t: any) => t.tag.id) || []);
  const sharedTags = new Set([...sourceTagIds].filter(id => candidateTagIds.has(id)));
  
  if (sharedTags.size > 0) {
    const tagSimilarity = sharedTags.size / Math.max(sourceTagIds.size, candidateTagIds.size);
    const tagScore = tagSimilarity * 40;
    score += tagScore;
    reasons.push(`${sharedTags.size} shared tags (+${tagScore.toFixed(1)})`);
  }

  // Category similarity (25% weight)
  if (sourceArticle.categoryId === candidateArticle.categoryId) {
    score += 25;
    reasons.push('Same category (+25)');
  }

  // Author similarity (10% weight)
  if (sourceArticle.authorName === candidateArticle.authorName) {
    score += 10;
    reasons.push('Same author (+10)');
  }

  // Content quality indicators (15% weight)
  if (candidateArticle.isFeatured) {
    score += 8;
    reasons.push('Featured article (+8)');
  }
  if (candidateArticle.isEditorsPick) {
    score += 7;
    reasons.push('Editor\'s pick (+7)');
  }

  // Popularity factor (10% weight)
  const popularityScore = Math.min(candidateArticle.viewCount / 1000, 10);
  if (popularityScore > 1) {
    score += popularityScore;
    reasons.push(`Popular article (+${popularityScore.toFixed(1)})`);
  }

  // Recency bonus (small boost for recent articles)
  const daysSincePublished = (Date.now() - new Date(candidateArticle.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublished < 7) {
    const recencyBonus = (7 - daysSincePublished) / 7 * 5;
    score += recencyBonus;
    reasons.push(`Recent article (+${recencyBonus.toFixed(1)})`);
  }

  return { total: Math.round(score * 100) / 100, reasons };
}

/**
 * Tag-based related articles (original algorithm, improved)
 */
async function getTagBasedRelatedArticles(sourceArticle: any, limit: number, excludeIds?: string[]): Promise<any[]> {
  const tagIds = sourceArticle.tags?.map((t: any) => t.tag.id) || [];
  
  if (tagIds.length === 0) return [];

  const excludeList = [sourceArticle.id, ...(excludeIds || [])];

  return prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      id: { notIn: excludeList },
      tags: { some: { tagId: { in: tagIds } } },
    },
    select: getArticleSelectFields(),
    orderBy: [
      { isFeatured: 'desc' },
      { isEditorsPick: 'desc' },
      { viewCount: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: limit,
  });
}

/**
 * Category-based related articles
 */
async function getCategoryBasedRelatedArticles(sourceArticle: any, limit: number, excludeIds?: string[]): Promise<any[]> {
  if (!sourceArticle.categoryId) return [];

  const excludeList = [sourceArticle.id, ...(excludeIds || [])];

  return prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      id: { notIn: excludeList },
      categoryId: sourceArticle.categoryId,
    },
    select: getArticleSelectFields(),
    orderBy: [
      { isFeatured: 'desc' },
      { isEditorsPick: 'desc' },
      { viewCount: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: limit,
  });
}

/**
 * Content-based related articles (using title/excerpt similarity)
 */
async function getContentBasedRelatedArticles(sourceArticle: any, limit: number, excludeIds?: string[]): Promise<any[]> {
  const excludeList = [sourceArticle.id, ...(excludeIds || [])];
  
  // Extract keywords from title and excerpt for simple content matching
  const keywords = extractKeywords(sourceArticle.title + ' ' + (sourceArticle.excerpt || ''));
  
  if (keywords.length === 0) return [];

  // Use OR conditions to find articles with similar content
  const whereConditions = keywords.map(keyword => ({
    OR: [
      { title: { contains: keyword, mode: 'insensitive' as const } },
      { excerpt: { contains: keyword, mode: 'insensitive' as const } }
    ]
  }));

  return prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      id: { notIn: excludeList },
      OR: whereConditions,
    },
    select: getArticleSelectFields(),
    orderBy: [
      { isFeatured: 'desc' },
      { viewCount: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: limit,
  });
}

/**
 * Popularity-based related articles
 */
async function getPopularityBasedRelatedArticles(sourceArticle: any, limit: number, excludeIds?: string[]): Promise<any[]> {
  const excludeList = [sourceArticle.id, ...(excludeIds || [])];

  return prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      id: { notIn: excludeList },
    },
    select: getArticleSelectFields(),
    orderBy: [
      { viewCount: 'desc' },
      { isFeatured: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: limit,
  });
}

/**
 * Extract keywords from text for content-based matching
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Simple keyword extraction - in production, use more sophisticated NLP
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3) // Only words longer than 3 characters
    .filter(word => !isStopWord(word)); // Remove common stop words

  // Return unique words, limited to most important ones
  return Array.from(new Set(words)).slice(0, 10);
}

/**
 * Check if a word is a stop word (common words to ignore)
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'about', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now'
  ]);
  
  return stopWords.has(word);
}

/**
 * Get standard article select fields
 */
function getArticleSelectFields() {
  return {
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
    tags: {
      select: {
        tag: {
          select: {
            id: true,
            slug: true,
            name: true,
          }
        }
      }
    },
    category: {
      select: {
        id: true,
        slug: true,
        name: true,
      }
    }
  };
}

/**
 * Cache management functions
 */
function getFromCache(key: string): CacheEntry | null {
  const entry = relatedArticlesCache.get(key);
  
  if (!entry) return null;
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    relatedArticlesCache.delete(key);
    return null;
  }
  
  return entry;
}

function setCache(key: string, result: RelatedArticlesResult): void {
  const entry: CacheEntry = {
    articles: result.articles,
    algorithm: result.algorithm,
    totalFound: result.totalFound,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL,
  };
  
  relatedArticlesCache.set(key, entry);
  
  // Simple cache cleanup - remove expired entries periodically
  if (relatedArticlesCache.size > 1000) {
    cleanupCache();
  }
}

function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of relatedArticlesCache.entries()) {
    if (now > entry.expiresAt) {
      relatedArticlesCache.delete(key);
    }
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): { size: number, hitRate?: number } {
  return {
    size: relatedArticlesCache.size,
    // In production, you'd track hit rate properly
  };
}

/**
 * Clear the cache (useful for testing or manual cache invalidation)
 */
export function clearCache(): void {
  relatedArticlesCache.clear();
}

/**
 * Warm up cache for popular articles
 */
export async function warmUpCache(articleSlugs: string[]): Promise<void> {
  const promises = articleSlugs.map(slug => 
    getRelatedArticles({
      slug, limit: 6, algorithm: 'hybrid',
      includeBreaking: false
    })
  );
  
  await Promise.allSettled(promises);
}
