import { z } from 'zod';

/**
 * Pagination query parameters schema
 * Includes automatic type coercion from query string to numbers
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0)
});

/**
 * Generic ID parameter schema for numeric IDs
 */
export const numericIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be numeric')
});

/**
 * Generic ID parameter schema for UUID IDs
 */
export const uuidIdParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format')
});

/**
 * Common search query schema
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  ...paginationQuerySchema.shape
});

/**
 * TypeScript types inferred from schemas
 */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type NumericIdParam = z.infer<typeof numericIdParamSchema>;
export type UuidIdParam = z.infer<typeof uuidIdParamSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
