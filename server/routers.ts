import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getAllProducts,
  getProductById,
  getProductsByIds,
  getProductCount,
  getCategories,
  searchProductsByKeyword,
  createProduct,
  createProducts,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getActiveRankingWeights,
  updateRankingWeights,
  getAllRankingWeights,
  createSession,
  getSessionById,
  updateSessionActivity,
  recordInteraction,
  getSessionInteractions,
  getRecentlyViewedProducts,
  getSearchLogs,
  getSearchLogsWithResults,
  logSearch,
  saveSearchExplanations,
  getEvaluationMetrics,
  getEvaluationMetricsBySearchLogId,
  getSearchLogById,
  saveEvaluationMetric,
  createUploadJob,
  updateUploadJob,
  getUploadJob,
  getRecentUploadJobs,
  getEmbeddingCount,
  createEmbedding,
  getAllProductsWithOptionalEmbeddings,
  deleteCategory,
  getSearchSuggestions,
  getFilteredProducts,
  getFilteredProductCount,
  getReviewsByProduct,
  getReviewStats,
  createReview,
  updateReview as updateReviewDb,
  deleteReview as deleteReviewDb,
} from "./db";
import { semanticSearch, generateProductEmbedding, batchGenerateEmbeddings, resetCorpusCache } from "./semanticSearch";
import {
  checkAIServiceHealth,
  generateEmbedding as generateEmbeddingViaAI,
  generateBatchEmbeddings as generateBatchEmbeddingsViaAI,
  semanticSearchViaAI,
  findSimilarProductsViaAI,
  clearAIServiceCache,
  checkEmbeddingHealth,
  toAIProduct,
  fromDBWeights,
  type Product as AIProduct,
} from "./aiService";
import { getSessionRecommendations, getSimilarProducts, getTrendingProducts } from "./recommendations";
import { evaluateSearchQuery, calculateAllMetrics, generateAutoRelevanceJudgments, type SearchResult } from "./irMetrics";
import { notifyOwner } from "./_core/notification";
import { handleChatMessage } from "./chatbot";
import type { Product, SearchLog } from "../drizzle/schema";

// Session cookie name for anonymous tracking
const SESSION_COOKIE = "smartcart_session";

/**
 * Strip HTML tags and dangerous characters from user input to prevent stored XSS.
 * Preserves plain text content only.
 */
function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")          // strip HTML tags
    .replace(/&lt;/g, "<")            // decode common entities (then re-strip)
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")          // re-strip after decode
    .replace(/javascript:/gi, "")     // remove JS protocol
    .replace(/on\w+\s*=/gi, "")       // remove event handlers (onclick= etc.)
    .trim();
}

// Admin procedure that checks for admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// Helper to get or create session ID
function getOrCreateSessionId(ctx: { req: { headers: Record<string, string | string[] | undefined> }; res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void } }): string {
  const cookies = ctx.req.headers.cookie;
  if (cookies && typeof cookies === 'string') {
    const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match) return match[1];
  }
  
  const sessionId = nanoid(32);
  ctx.res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  });
  
  return sessionId;
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ==================== CHATBOT ====================
  chat: router({
    send: publicProcedure
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          conversationId: z.number().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        const userId = ctx.user?.id;
        const result = await handleChatMessage({
          message: input.message,
          sessionId,
          userId,
          conversationId: input.conversationId,
        });
        return result;
      }),
  }),

  // ==================== PRODUCT ROUTES ====================
  products: router({
    list: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        category: z.string().optional(),
        stock: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
      }).optional())
      .query(async ({ input }) => {
        const { limit = 20, offset = 0, search, category, stock, minPrice, maxPrice } = input || {};
        const hasFilters = search || category || stock || minPrice !== undefined || maxPrice !== undefined;
        if (hasFilters) {
          const [filteredProducts, filteredTotal] = await Promise.all([
            getFilteredProducts({ limit, offset, search, category, stock, minPrice, maxPrice }),
            getFilteredProductCount({ search, category, stock, minPrice, maxPrice }),
          ]);
          return { products: filteredProducts, total: filteredTotal, limit, offset };
        }
        const [allProds, total] = await Promise.all([
          getAllProducts(limit, offset),
          getProductCount(),
        ]);
        return { products: allProds, total, limit, offset };
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const product = await getProductById(input.id);
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        }
        return product;
      }),

    getByIds: publicProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .query(async ({ input }) => {
        return getProductsByIds(input.ids);
      }),

    categories: publicProcedure.query(async () => {
      return getCategories();
    }),

    featured: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
      .query(async ({ input }) => {
        return getFeaturedProducts(input?.limit || 10);
      }),

    keywordSearch: publicProcedure
      .input(z.object({
        keyword: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        return searchProductsByKeyword(input.keyword, input.limit);
      }),

    suggest: publicProcedure
      .input(z.object({ query: z.string().min(1), limit: z.number().min(1).max(10).default(8) }))
      .query(async ({ input }) => {
        return getSearchSuggestions(input.query, input.limit);
      }),
  }),

  // ==================== SEMANTIC SEARCH ROUTES ====================
  search: router({
    getBySearchLogId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const log = await getSearchLogById(input.id);
        if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Search log not found" });
        return log;
      }),

    // Hybrid semantic + keyword search using local Transformers.js embeddings
    semantic: publicProcedure
      .input(z.object({
        query: z.string().min(1).max(500),
        limit: z.number().min(1).max(50).default(20),
        minScore: z.number().min(0).max(1).default(0.1),
        category: z.string().optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        inStockOnly: z.boolean().default(false),
        useAIService: z.boolean().default(true), // kept for API compat, ignored
      }).refine(
        data => !(data.minPrice != null && data.maxPrice != null && data.minPrice > data.maxPrice),
        { message: "minPrice must be less than or equal to maxPrice" }
      ))
      .query(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);

        // Primary path: local hybrid semantic + keyword search (no external service)
        try {
          const result = await semanticSearch(input.query, {
            limit: input.limit,
            minScore: input.minScore,
            category: input.category,
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            inStockOnly: input.inStockOnly,
            sessionId,
          });

          if (result.results.length > 0) {
            return {
              results: result.results,
              searchLogId: result.searchLogId,
              responseTimeMs: result.responseTimeMs,
              query: input.query,
            };
          }
        } catch (semanticError) {
          console.warn(
            "[Search] Local semantic search failed, using keyword fallback:",
            semanticError instanceof Error ? semanticError.message : semanticError,
          );
        }

        // Fallback: pure keyword/title search (no embeddings needed)
        const keywordStartTime = Date.now();
        const keywordProducts = await searchProductsByKeyword(input.query, input.limit);

        const filteredKeywordProducts = keywordProducts.filter((product: Product) => {
          const productPrice = Number(product.price) || 0;

          if (input.category && product.category?.toLowerCase() !== input.category.toLowerCase()) {
            return false;
          }
          if (input.minPrice !== undefined && productPrice < input.minPrice) {
            return false;
          }
          if (input.maxPrice !== undefined && productPrice > input.maxPrice) {
            return false;
          }
          if (input.inStockOnly && product.availability === "out_of_stock") {
            return false;
          }

          return true;
        });

        return {
          results: filteredKeywordProducts.map((product: Product, index: number) => ({
            product,
            scores: {
              final: 0.5,
              semantic: 0,
              rating: product.rating ? Number(product.rating) / 5 : 0.5,
              price: 0.5,
              stock: product.availability === "out_of_stock" ? 0 : 1,
              recency: 0.5,
            },
            matchedTerms: [],
            explanation: "Keyword match (embedding model loading)",
            position: index + 1,
          })),
          searchLogId: 0,
          responseTimeMs: Date.now() - keywordStartTime,
          query: input.query,
          fallbackUsed: "keyword",
        };
      }),

    // Health check for local embedding model
    aiServiceHealth: publicProcedure.query(async () => {
      const healthy = await checkAIServiceHealth();
      return { healthy, service: "Local Transformers.js (BGE-small-en-v1.5)" };
    }),

    logs: adminProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }).optional())
      .query(async ({ input }) => {
        return getSearchLogs(input?.limit || 100);
      }),
  }),

  // ==================== RECOMMENDATIONS ROUTES ====================
  recommendations: router({
    forSession: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(20).default(8),
        excludeProductIds: z.array(z.number()).default([]),
      }).optional())
      .query(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        return getSessionRecommendations(sessionId, {
          limit: input?.limit || 8,
          excludeProductIds: input?.excludeProductIds || [],
        });
      }),

    similar: publicProcedure
      .input(z.object({
        productId: z.number(),
        limit: z.number().min(1).max(20).default(6),
      }))
      .query(async ({ input }) => {
        return getSimilarProducts(input.productId, input.limit);
      }),

    trending: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
      .query(async ({ input }) => {
        return getTrendingProducts(input?.limit || 10);
      }),
  }),

  // ==================== SESSION & INTERACTION ROUTES ====================
  session: router({
    recordInteraction: publicProcedure
      .input(z.object({
        productId: z.number(),
        interactionType: z.enum(["view", "click", "search_click", "add_to_cart", "wishlist_add", "purchase"]),
        searchQuery: z.string().optional(),
        position: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        
        // Ensure session exists
        const existingSession = await getSessionById(sessionId);
        if (!existingSession) {
          await createSession({
            sessionId,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        } else {
          await updateSessionActivity(sessionId);
        }

        await recordInteraction({
          sessionId,
          productId: input.productId,
          interactionType: input.interactionType,
          searchQuery: input.searchQuery,
          position: input.position,
        });

        return { success: true };
      }),

    recentlyViewed: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
      .query(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        return getRecentlyViewedProducts(sessionId, input?.limit || 10);
      }),

    interactions: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        return getSessionInteractions(sessionId, input?.limit || 50);
      }),
  }),

  // ==================== CHECKOUT / ORDER VALIDATION ====================
  checkout: router({
    /**
     * Server-side price validation. The client sends the cart items and
     * the server verifies each price against the database. This prevents
     * price manipulation via localStorage/DevTools.
     */
    validateCart: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive().max(100),
          clientPrice: z.number().positive(), // price the client thinks is correct
        })),
      }))
      .mutation(async ({ input }) => {
        if (input.items.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });
        }

        const productIds = input.items.map((i: { productId: number }) => i.productId);
        const dbProducts = await getProductsByIds(productIds);
        const productMap = new Map<number, typeof dbProducts[number]>();
        for (const p of dbProducts) productMap.set(p.id, p);

        let serverTotal = 0;
        const validatedItems: Array<{
          productId: number;
          title: string;
          quantity: number;
          unitPrice: number;
          lineTotal: number;
        }> = [];

        for (const item of input.items) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Product ${item.productId} not found`,
            });
          }

          if (product.availability === "out_of_stock") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${product.title} is out of stock`,
            });
          }

          const serverPrice = Number(product.price) || 0;
          const clientPrice = item.clientPrice;

          // Reject if client price doesn't match server price (tolerance of £0.01 for rounding)
          if (Math.abs(serverPrice - clientPrice) > 0.01) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Price mismatch for ${product.title}: expected £${serverPrice.toFixed(2)} but got £${clientPrice.toFixed(2)}. Please refresh your cart.`,
            });
          }

          if (product.stockQuantity != null && item.quantity > product.stockQuantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Only ${product.stockQuantity} units of ${product.title} available`,
            });
          }

          const lineTotal = serverPrice * item.quantity;
          serverTotal += lineTotal;
          validatedItems.push({
            productId: product.id,
            title: product.title,
            quantity: item.quantity,
            unitPrice: serverPrice,
            lineTotal,
          });
        }

        const shipping = serverTotal > 50 ? 0 : 5.99;

        return {
          valid: true,
          items: validatedItems,
          subtotal: Math.round(serverTotal * 100) / 100,
          shipping,
          total: Math.round((serverTotal + shipping) * 100) / 100,
        };
      }),
  }),

  // ==================== ADMIN ROUTES ====================
  admin: router({
    // Ranking weights management
    weights: router({
      get: adminProcedure.query(async () => {
        return getActiveRankingWeights();
      }),

      getAll: adminProcedure.query(async () => {
        return getAllRankingWeights();
      }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          alpha: z.string().optional(),
          beta: z.string().optional(),
          gamma: z.string().optional(),
          delta: z.string().optional(),
          epsilon: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...weights } = input;

          // Compute the resulting sum (use existing DB values for any fields
          // the client didn't supply) and reject > 1 ± 0.01 tolerance.
          const current = await getActiveRankingWeights();
          const effective = {
            alpha: parseFloat(weights.alpha ?? current.alpha),
            beta: parseFloat(weights.beta ?? current.beta),
            gamma: parseFloat(weights.gamma ?? current.gamma),
            delta: parseFloat(weights.delta ?? current.delta),
            epsilon: parseFloat(weights.epsilon ?? current.epsilon),
          };

          for (const [key, val] of Object.entries(effective)) {
            if (!Number.isFinite(val) || val < 0 || val > 1) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Weight ${key} must be between 0 and 1 (got ${val})`,
              });
            }
          }

          const total = Object.values(effective).reduce((a, b) => a + b, 0);
          if (total > 1.005) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Weights sum to ${total.toFixed(3)} — must not exceed 1.00`,
            });
          }
          if (total < 0.995) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Weights sum to ${total.toFixed(3)} — must equal 1.00`,
            });
          }

          await updateRankingWeights(id, { ...weights, updatedAt: new Date() });
          return { success: true };
        }),
    }),

    // System maintenance actions (cache flush, etc.)
    system: router({
      clearSearchCache: adminProcedure.mutation(async () => {
        const local = resetCorpusCache();
        const remote = await clearAIServiceCache();
        return {
          success: true,
          clearedEntries: local.entries + remote.entries,
          localCacheCleared: true,
          aiServiceCleared: remote.cleared,
          aiServiceEntries: remote.entries,
        };
      }),
    }),

    // Product management
    products: router({
      create: adminProcedure
        .input(z.object({
          title: z.string().min(1),
          description: z.string().min(1),
          category: z.string().min(1),
          subcategory: z.string().optional(),
          imageUrl: z.string().min(1),
          price: z.string().min(1),
          originalPrice: z.string().optional(),
          currency: z.string().default("GBP"),
          rating: z.string().min(1),
          reviewCount: z.number().default(0),
          stockQuantity: z.number().min(0),
          brand: z.string().min(1),
          features: z.array(z.string()).optional(),
          isFeatured: z.boolean().default(false),
          asin: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          // Auto-compute availability from stock
          const qty = input.stockQuantity;
          const availability = qty === 0 ? "out_of_stock" : qty <= 20 ? "low_stock" : "in_stock";
          const productId = await createProduct({ ...input, availability });
          await generateProductEmbedding(productId);
          return { id: productId };
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          subcategory: z.string().optional(),
          imageUrl: z.string().optional(),
          price: z.string().optional(),
          originalPrice: z.string().optional(),
          rating: z.string().optional(),
          reviewCount: z.number().optional(),
          stockQuantity: z.number().optional(),
          brand: z.string().optional(),
          features: z.array(z.string()).optional(),
          isFeatured: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          // Auto-compute availability when stock quantity is provided
          if (updates.stockQuantity !== undefined) {
            const qty = updates.stockQuantity;
            (updates as any).availability = qty === 0 ? "out_of_stock" : qty <= 20 ? "low_stock" : "in_stock";
          }
          await updateProduct(id, updates);
          if (updates.title || updates.description || updates.category || updates.features) {
            await generateProductEmbedding(id);
          }
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await deleteProduct(input.id);
          return { success: true };
        }),

      generateEmbedding: adminProcedure
        .input(z.object({ productId: z.number() }))
        .mutation(async ({ input }) => {
          const success = await generateProductEmbedding(input.productId);
          return { success };
        }),

      generateSelectedEmbeddings: adminProcedure
        .input(z.object({ productIds: z.array(z.number()).min(1).max(500) }))
        .mutation(async ({ input }) => {
          const result = await batchGenerateEmbeddings(input.productIds);
          return result;
        }),

      deleteMany: adminProcedure
        .input(z.object({ ids: z.array(z.number()).min(1) }))
        .mutation(async ({ input }) => {
          let deleted = 0;
          for (const id of input.ids) {
            try {
              await deleteProduct(id);
              deleted++;
            } catch (e) {
              console.error(`[Admin] Failed to delete product ${id}:`, e);
            }
          }
          return { deleted, total: input.ids.length };
        }),

      deleteCategory: adminProcedure
        .input(z.object({ category: z.string().min(1) }))
        .mutation(async ({ input }) => {
          const count = await deleteCategory(input.category);
          return { uncategorized: count };
        }),

      // Sanity-check what's actually in the product_embeddings table. Picks
      // a small sample, sends the text+stored vector to Python, and reports
      // whether the stored vectors actually come from the current live model.
      // Used by the admin dashboard to diagnose "regenerate succeeded but
      // search still looks wrong" situations.
      embeddingHealth: adminProcedure.query(async () => {
        const sampleRows = await getAllProductsWithOptionalEmbeddings(10, 0);
        const samples = sampleRows
          .filter((row: { product: Product; embedding: number[] | null }) => Array.isArray(row.embedding) && (row.embedding as number[]).length > 0)
          .map((row: { product: Product; embedding: number[] | null }) => ({
            id: row.product.id,
            text: [
              row.product.title,
              row.product.description,
              row.product.category,
              row.product.subcategory,
              row.product.brand,
              ...((row.product.features as string[] | null) || []),
            ].filter(Boolean).join(" "),
            embedding: row.embedding as number[],
          }));
        if (samples.length === 0) {
          return {
            model_name: "n/a",
            verdict: "broken" as const,
            ok_count: 0,
            total: 0,
            samples: [],
            hint: "No embeddings in product_embeddings. Click 'Regenerate All Embeddings'.",
          };
        }
        const report = await checkEmbeddingHealth(samples);
        return {
          ...report,
          hint:
            report.verdict === "healthy"
              ? "Stored embeddings match the live BGE model."
              : report.verdict === "broken"
              ? "Stored embeddings are NOT from the current BGE model (likely stale TF-IDF). Click 'Regenerate All Embeddings' while the Python service is running."
              : report.verdict === "mixed"
              ? "Some products have correct embeddings, others don't. Regenerate to fix the stragglers."
              : "AI service unreachable. Start the Python service and retry.",
        };
      }),

      testEmail: adminProcedure
        .input(z.object({ to: z.string().email() }))
        .mutation(async ({ input }) => {
          const { sendVerificationEmail } = await import("./emailService");
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;

          if (!smtpUser || !smtpPass) {
            return {
              success: false,
              error: `SMTP not configured. SMTP_USER=${smtpUser ? "SET" : "MISSING"}, SMTP_PASS=${smtpPass ? "SET" : "MISSING"}`,
            };
          }

          try {
            const result = await sendVerificationEmail(input.to, "Test User", "test-token-12345");
            return {
              success: result.success,
              messageId: result.messageId,
              error: result.error,
              config: { smtpUser, baseUrl: process.env.BASE_URL || "not set" },
            };
          } catch (err: any) {
            return {
              success: false,
              error: err.message || String(err),
              config: { smtpUser, baseUrl: process.env.BASE_URL || "not set" },
            };
          }
        }),

      generateAllEmbeddings: adminProcedure.mutation(async () => {
        const products = await getAllProducts(10000, 0);
        const productIds = products.map((p: Product) => p.id);
        const errors: string[] = [];

        try {
          // First try batch mode (faster)
          let result = await batchGenerateEmbeddings(productIds);

          // If batch failed entirely, retry one-by-one and capture actual errors
          if (result.success === 0 && result.failed > 0) {
            console.warn(`[Embeddings] Batch mode failed all ${result.failed}. Retrying one-by-one...`);
            let soloSuccess = 0;
            let soloFailed = 0;
            for (const pid of productIds) {
              try {
                const ok = await generateProductEmbedding(pid);
                if (ok) soloSuccess++; else soloFailed++;
              } catch (e: any) {
                soloFailed++;
                const msg = e?.message || String(e);
                if (errors.length < 5 && !errors.some(m => m === msg)) {
                  errors.push(msg);
                }
              }
            }
            result = { success: soloSuccess, failed: soloFailed };
          }

          await notifyOwner({
            title: "🧠 Pick N Take: Embedding Generation Complete",
            content: `Successfully generated embeddings for ${result.success} products.\n\nTotal products: ${productIds.length}\nSuccessful: ${result.success}\nFailed: ${result.failed}`,
          }).catch(err => console.warn("[Notification] Failed to notify owner:", err));

          return { ...result, errors };
        } catch (error: any) {
          await notifyOwner({
            title: "❌ Pick N Take: Embedding Generation Failed",
            content: `Failed to generate embeddings.\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
          }).catch(err => console.warn("[Notification] Failed to notify owner:", err));

          throw error;
        }
      }),

    }),

    // Catalog upload management
    catalog: router({
      upload: adminProcedure
        .input(z.object({
          products: z.array(z.object({
            asin: z.string().optional(),
            title: z.string(),
            description: z.string().optional(),
            category: z.string().optional(),
            subcategory: z.string().optional(),
            imageUrl: z.string().optional(),
            price: z.string().optional(),
            originalPrice: z.string().optional(),
            currency: z.string().default("GBP"),
            rating: z.string().optional(),
            reviewCount: z.number().default(0),
            availability: z.enum(["in_stock", "low_stock", "out_of_stock"]).default("in_stock"),
            stockQuantity: z.number().default(100),
            brand: z.string().optional(),
            features: z.array(z.string()).optional(),
            isFeatured: z.boolean().default(false),
          })),
          generateEmbeddings: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create upload job (best effort for legacy DB schemas)
          let jobId: number | undefined;
          try {
            jobId = await createUploadJob({
              filename: `batch_upload_${Date.now()}`,
              status: "processing",
              totalRows: input.products.length,
              uploadedBy: ctx.user.id,
              startedAt: new Date(),
            });
          } catch (error) {
            console.warn("[Catalog Upload] Failed to create upload job, continuing without job tracking:", error);
          }

          const updateJobIfPresent = async (updates: Parameters<typeof updateUploadJob>[1]) => {
            if (!jobId) return;
            await updateUploadJob(jobId, updates);
          };

          try {
            // Insert products
            await createProducts(input.products);
            
            await updateJobIfPresent({
              processedRows: input.products.length,
              status: input.generateEmbeddings ? "embedding" : "completed",
            });

            // Generate embeddings if requested
            if (input.generateEmbeddings) {
              const allProducts = await getAllProducts(10000, 0);
              const newProductIds = allProducts
                .filter((p: Product) => input.products.some((ip: { title: string }) => ip.title === p.title))
                .map((p: Product) => p.id);
              
              const embeddingResult = await batchGenerateEmbeddings(newProductIds);
              
              await updateJobIfPresent({
                embeddedRows: embeddingResult.success,
                status: "completed",
                completedAt: new Date(),
              });

              // Notify owner of successful upload with embeddings
              await notifyOwner({
                title: "📦 Pick N Take: Catalog Upload Complete",
                content: `Successfully uploaded ${input.products.length} products and generated ${embeddingResult.success} embeddings.${jobId ? `\n\nJob ID: ${jobId}` : ""}\nFailed embeddings: ${embeddingResult.failed}`,
              }).catch(err => console.warn("[Notification] Failed to notify owner:", err));
            } else {
              await updateJobIfPresent({
                completedAt: new Date(),
              });

              // Notify owner of successful upload without embeddings
              await notifyOwner({
                title: "📦 Pick N Take: Catalog Upload Complete",
                content: `Successfully uploaded ${input.products.length} products.${jobId ? `\n\nJob ID: ${jobId}` : ""}\nNote: Embeddings were not generated. Run 'Regenerate All Embeddings' from the admin dashboard to enable semantic search.`,
              }).catch(err => console.warn("[Notification] Failed to notify owner:", err));
            }

            return { jobId: jobId ?? null, success: true };
          } catch (error) {
            await updateJobIfPresent({
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });

            // Notify owner of upload failure
            await notifyOwner({
              title: "❌ Pick N Take: Catalog Upload Failed",
              content: `Failed to upload catalog.${jobId ? `\n\nJob ID: ${jobId}` : ""}\nError: ${error instanceof Error ? error.message : "Unknown error"}\n\nPlease check the admin dashboard for details.`,
            }).catch(err => console.warn("[Notification] Failed to notify owner:", err));

            throw error;
          }
        }),

      jobs: adminProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
        .query(async ({ input }) => {
          return getRecentUploadJobs(input?.limit || 10);
        }),

      jobStatus: adminProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          return getUploadJob(input.id);
        }),
    }),

    // Stats and metrics
    stats: router({
      overview: adminProcedure.query(async () => {
        const [productCount, embeddingCount, searchLogs] = await Promise.all([
          getProductCount(),
          getEmbeddingCount(),
          getSearchLogs(100),
        ]);

        const avgResponseTime = searchLogs.length > 0
          ? searchLogs.reduce((sum: number, log: SearchLog) => sum + (log.responseTimeMs || 0), 0) / searchLogs.length
          : 0;

        return {
          productCount,
          embeddingCount,
          searchCount: searchLogs.length,
          avgResponseTimeMs: Math.round(avgResponseTime),
        };
      }),

      metrics: adminProcedure
        .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
        .query(async ({ input }) => {
          return getEvaluationMetrics(input?.limit || 50);
        }),

      bySearchLogId: adminProcedure
        .input(z.object({ searchLogId: z.number() }))
        .query(async ({ input }) => {
          return getEvaluationMetricsBySearchLogId(input.searchLogId);
        }),

      saveMetric: adminProcedure
        .input(z.object({
          metricType: z.enum(["ndcg@10", "recall@10", "precision@10", "mrr", "custom"]),
          value: z.string(),
          queryCount: z.number().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          await saveEvaluationMetric(input);
          return { success: true };
        }),

      // Calculate IR metrics for recent searches
      calculateIRMetrics: adminProcedure.mutation(async () => {
        const searchLogs = await getSearchLogsWithResults(50);
        const products = await getAllProducts(1000, 0);
        
        if (searchLogs.length === 0) {
          return {
            avgNdcg: 0,
            avgRecall: 0,
            avgPrecision: 0,
            avgMrr: 0,
            queryCount: 0,
            message: "No search logs available for evaluation",
          };
        }

        let totalNdcg = 0;
        let totalRecall = 0;
        let totalPrecision = 0;
        let totalMrr = 0;
        let validQueries = 0;

        for (const log of searchLogs) {
          if (!log.query || !log.topResults) continue;
          
          try {
            const topResults = typeof log.topResults === 'string' 
              ? JSON.parse(log.topResults) 
              : log.topResults;
            
            if (!Array.isArray(topResults) || topResults.length === 0) continue;

            // Convert to SearchResult format
            const searchResults: SearchResult[] = topResults.map((r: { productId: number; finalScore?: number }, i: number) => ({
              productId: r.productId,
              position: i + 1,
              finalScore: r.finalScore || 0,
            }));

            // Generate relevance judgments based on query
            const judgments = generateAutoRelevanceJudgments(log.query, products);
            
            // Calculate metrics
            const metrics = calculateAllMetrics(searchResults, judgments, 10);
            
            totalNdcg += metrics.ndcg;
            totalRecall += metrics.recall;
            totalPrecision += metrics.precision;
            totalMrr += metrics.mrr;
            validQueries++;
          } catch (e) {
            console.error("Error calculating metrics for query:", log.query, e);
          }
        }

        if (validQueries === 0) {
          return {
            avgNdcg: 0,
            avgRecall: 0,
            avgPrecision: 0,
            avgMrr: 0,
            queryCount: 0,
            message: "No valid search logs for evaluation",
          };
        }

        const avgNdcg = totalNdcg / validQueries;
        const avgRecall = totalRecall / validQueries;
        const avgPrecision = totalPrecision / validQueries;
        const avgMrr = totalMrr / validQueries;

        // Save individual query metrics for better tracking
        for (const log of searchLogs) {
          if (!log.query || !log.topResults) continue;
          try {
            const topResults = typeof log.topResults === 'string' ? JSON.parse(log.topResults) : log.topResults;
            const searchResults: SearchResult[] = topResults.map((r: any, i: number) => ({
              productId: r.productId,
              position: i + 1,
              finalScore: r.finalScore || 0,
            }));
            const judgments = generateAutoRelevanceJudgments(log.query, products);
            const metrics = calculateAllMetrics(searchResults, judgments, 10);
            
            await saveEvaluationMetric({
              metricType: "ndcg@10",
              value: metrics.ndcg.toFixed(4),
              notes: `SearchLogId: ${log.id}`,
            });
          } catch (e) {}
        }

        // Save the aggregate metrics
        await saveEvaluationMetric({
          metricType: "ndcg@10",
          value: avgNdcg.toFixed(4),
          queryCount: validQueries,
          notes: `Aggregate: Calculated from ${validQueries} queries`,
        });
        await saveEvaluationMetric({
          metricType: "recall@10",
          value: avgRecall.toFixed(4),
          queryCount: validQueries,
        });
        await saveEvaluationMetric({
          metricType: "precision@10",
          value: avgPrecision.toFixed(4),
          queryCount: validQueries,
        });
        await saveEvaluationMetric({
          metricType: "mrr",
          value: avgMrr.toFixed(4),
          queryCount: validQueries,
        });

        return {
          avgNdcg: Number(avgNdcg.toFixed(4)),
          avgRecall: Number(avgRecall.toFixed(4)),
          avgPrecision: Number(avgPrecision.toFixed(4)),
          avgMrr: Number(avgMrr.toFixed(4)),
          queryCount: validQueries,
          message: `Calculated IR metrics from ${validQueries} search queries`,
        };
      }),
    }),
  }),

  // ==================== REVIEWS ====================
  reviews: router({
    list: publicProcedure
      .input(z.object({
        productId: z.number(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        return getReviewsByProduct(input.productId, input.limit, input.offset);
      }),

    stats: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        return getReviewStats(input.productId);
      }),

    create: protectedProcedure
      .input(z.object({
        productId: z.number(),
        rating: z.number().min(1).max(5),
        comment: z.string().min(1, "Comment is required").max(5000),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
        const sanitizedComment = sanitizeInput(input.comment);
        if (sanitizedComment.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Comment cannot be empty" });
        }
        const id = await createReview({ ...input, comment: sanitizedComment, userId: ctx.user.id });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        rating: z.number().min(1).max(5).optional(),
        comment: z.string().min(1).max(5000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { id, ...data } = input;
        if (data.comment) {
          data.comment = sanitizeInput(data.comment);
          if (data.comment.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Comment cannot be empty" });
          }
        }
        await updateReviewDb(id, ctx.user.id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteReviewDb(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
