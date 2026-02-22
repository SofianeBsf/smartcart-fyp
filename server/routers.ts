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
} from "./db";
import { semanticSearch, generateProductEmbedding, batchGenerateEmbeddings } from "./semanticSearch";
import { 
  checkAIServiceHealth, 
  generateEmbedding as generateEmbeddingViaAI,
  generateBatchEmbeddings as generateBatchEmbeddingsViaAI,
  semanticSearchViaAI,
  findSimilarProductsViaAI,
  toAIProduct,
  fromDBWeights,
  type Product as AIProduct,
} from "./aiService";
import { getSessionRecommendations, getSimilarProducts, getTrendingProducts } from "./recommendations";
import { evaluateSearchQuery, calculateAllMetrics, generateAutoRelevanceJudgments, type SearchResult } from "./irMetrics";
import { notifyOwner } from "./_core/notification";

// Session cookie name for anonymous tracking
const SESSION_COOKIE = "smartcart_session";

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

  // ==================== PRODUCT ROUTES ====================
  products: router({
    list: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        const { limit = 20, offset = 0 } = input || {};
        const [products, total] = await Promise.all([
          getAllProducts(limit, offset),
          getProductCount(),
        ]);
        return { products, total, limit, offset };
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

    // AI-powered semantic search using FastAPI + Sentence-BERT
    semantic: publicProcedure
      .input(z.object({
        query: z.string().min(1).max(500),
        limit: z.number().min(1).max(50).default(20),
        minScore: z.number().min(0).max(1).default(0.1),
        category: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        inStockOnly: z.boolean().default(false),
        useAIService: z.boolean().default(true), // Use Python AI service by default
      }))
      .query(async ({ input, ctx }) => {
        const sessionId = getOrCreateSessionId(ctx as any);
        const startTime = Date.now();
        
        // Check if AI service is available and requested
        const aiServiceAvailable = input.useAIService ? await checkAIServiceHealth() : false;
        
        if (aiServiceAvailable) {
          try {
            // Get all products with embeddings from database
            const products = await getAllProducts(1000, 0);
            const weights = await getActiveRankingWeights();
            
            // Convert products to AI service format
            const aiProducts: AIProduct[] = products.map(p => toAIProduct(p));
            
            // Call FastAPI AI service for semantic search
            const aiResult = await semanticSearchViaAI(
              input.query,
              aiProducts,
              weights ? fromDBWeights(weights) : undefined,
              {
                limit: input.limit,
                minPrice: input.minPrice,
                maxPrice: input.maxPrice,
                category: input.category,
              }
            );
            
            // Filter by stock if requested
            let results = aiResult.results;
            if (input.inStockOnly) {
              results = results.filter(r => 
                r.product.availability === "in_stock" || r.product.availability === "low_stock"
              );
            }
            
            // Filter by minimum score
            results = results.filter(r => r.score_breakdown.final_score >= input.minScore);
            
            if (results.length > 0) {
              // Transform results to match existing frontend format
              const transformedResults = results.map(r => ({
                product: {
                  id: r.product.id,
                  title: r.product.title,
                  description: r.product.description,
                  category: r.product.category,
                  imageUrl: products.find(p => p.id === r.product.id)?.imageUrl || null,
                  price: r.product.price?.toString() || null,
                  rating: r.product.rating?.toString() || null,
                  reviewCount: r.product.review_count || 0,
                  availability: (r.product.availability as "in_stock" | "low_stock" | "out_of_stock" | null) || "in_stock",
                },
                score: r.score_breakdown.final_score,
                scoreBreakdown: {
                  semanticScore: r.score_breakdown.semantic_score,
                  ratingScore: r.score_breakdown.rating_score,
                  priceScore: r.score_breakdown.price_score,
                  stockScore: r.score_breakdown.stock_score,
                  recencyScore: r.score_breakdown.recency_score,
                },
                explanation: r.score_breakdown.explanation,
                matchedTerms: r.score_breakdown.matched_terms,
                rank: r.rank,
              }));
              
              // Log search to database
              const searchLogId = await logSearch({
                query: input.query,
                sessionId,
                resultsCount: transformedResults.length,
                responseTimeMs: aiResult.response_time_ms,
              });

              // Save result explanations
              if (searchLogId > 0) {
                const explanations = transformedResults.map((r, i) => ({
                  searchLogId,
                  productId: r.product.id,
                  position: i + 1,
                  semanticScore: r.scoreBreakdown.semanticScore.toString(),
                  ratingScore: r.scoreBreakdown.ratingScore.toString(),
                  priceScore: r.scoreBreakdown.priceScore.toString(),
                  stockScore: r.scoreBreakdown.stockScore.toString(),
                  recencyScore: r.scoreBreakdown.recencyScore.toString(),
                  finalScore: r.score.toString(),
                  explanation: r.explanation,
                  matchedTerms: r.matchedTerms,
                }));
                await saveSearchExplanations(explanations);
              }

              return {
                results: transformedResults,
                searchLogId,
                responseTimeMs: aiResult.response_time_ms,
                query: input.query,
              };
            }
            console.log("[Search] AI service returned 0 results, falling back to local search");
          } catch (error) {
            console.warn("[Search] AI service error, falling back to local search:", error);
            // Fall through to local search
          }
        }
        
        // Fallback to local semantic search
        const result = await semanticSearch(input.query, {
          limit: input.limit,
          minScore: input.minScore,
          category: input.category,
          minPrice: input.minPrice,
          maxPrice: input.maxPrice,
          inStockOnly: input.inStockOnly,
          sessionId,
        });

        if (result.results.length === 0) {
          const keywordProducts = await searchProductsByKeyword(input.query, input.limit);

          const filteredKeywordProducts = keywordProducts.filter((product) => {
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
            results: filteredKeywordProducts.map((product, index) => ({
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
              explanation: "Keyword match fallback",
              position: index + 1,
            })),
            searchLogId: result.searchLogId,
            responseTimeMs: result.responseTimeMs,
            query: input.query,
            aiServiceUsed: false,
            fallbackUsed: "keyword",
          };
        }

        return {
          results: result.results,
          searchLogId: result.searchLogId,
          responseTimeMs: result.responseTimeMs,
          query: input.query,
          aiServiceUsed: false,
        };
      }),
    
    // Health check for AI service
    aiServiceHealth: publicProcedure.query(async () => {
      const healthy = await checkAIServiceHealth();
      return { healthy, service: "FastAPI + Sentence-BERT" };
    }),

    logs: publicProcedure
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
        interactionType: z.enum(["view", "click", "search_click", "add_to_cart", "purchase"]),
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
          await updateRankingWeights(id, weights);
          return { success: true };
        }),
    }),

    // Product management
    products: router({
      create: adminProcedure
        .input(z.object({
          title: z.string().min(1),
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
        }))
        .mutation(async ({ input }) => {
          const productId = await createProduct(input);
          // Generate embedding for new product
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
          availability: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
          stockQuantity: z.number().optional(),
          brand: z.string().optional(),
          features: z.array(z.string()).optional(),
          isFeatured: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          await updateProduct(id, updates);
          // Regenerate embedding if text fields changed
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

      generateAllEmbeddings: adminProcedure.mutation(async () => {
        const products = await getAllProducts(10000, 0);
        const productIds = products.map(p => p.id);
        
        try {
          const result = await batchGenerateEmbeddings(productIds);
          
          // Notify owner of embedding generation completion
          await notifyOwner({
            title: "🧠 SmartCart: Embedding Generation Complete",
            content: `Successfully generated embeddings for ${result.success} products.\n\nTotal products: ${productIds.length}\nSuccessful: ${result.success}\nFailed: ${result.failed}`,
          }).catch(err => console.warn("[Notification] Failed to notify owner:", err));
          
          return result;
        } catch (error) {
          // Notify owner of embedding generation failure
          await notifyOwner({
            title: "❌ SmartCart: Embedding Generation Failed",
            content: `Failed to generate embeddings.\n\nError: ${error instanceof Error ? error.message : "Unknown error"}\n\nPlease check the server logs for details.`,
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
          // Create upload job
          const jobId = await createUploadJob({
            filename: `batch_upload_${Date.now()}`,
            status: "processing",
            totalRows: input.products.length,
            uploadedBy: ctx.user.id,
            startedAt: new Date(),
          });

          try {
            // Insert products
            await createProducts(input.products);
            
            await updateUploadJob(jobId, {
              processedRows: input.products.length,
              status: input.generateEmbeddings ? "embedding" : "completed",
            });

            // Generate embeddings if requested
            if (input.generateEmbeddings) {
              const allProducts = await getAllProducts(10000, 0);
              const newProductIds = allProducts
                .filter(p => input.products.some(ip => ip.title === p.title))
                .map(p => p.id);
              
              const embeddingResult = await batchGenerateEmbeddings(newProductIds);
              
            await updateUploadJob(jobId, {
              embeddedRows: embeddingResult.success,
              status: "completed",
              completedAt: new Date(),
            });

              // Notify owner of successful upload with embeddings
              await notifyOwner({
                title: "📦 SmartCart: Catalog Upload Complete",
                content: `Successfully uploaded ${input.products.length} products and generated ${embeddingResult.success} embeddings.\n\nJob ID: ${jobId}\nFailed embeddings: ${embeddingResult.failed}`,
              }).catch(err => console.warn("[Notification] Failed to notify owner:", err));
            } else {
              await updateUploadJob(jobId, {
                completedAt: new Date(),
              });

              // Notify owner of successful upload without embeddings
              await notifyOwner({
                title: "📦 SmartCart: Catalog Upload Complete",
                content: `Successfully uploaded ${input.products.length} products.\n\nJob ID: ${jobId}\nNote: Embeddings were not generated. Run 'Regenerate All Embeddings' from the admin dashboard to enable semantic search.`,
              }).catch(err => console.warn("[Notification] Failed to notify owner:", err));
            }

            return { jobId, success: true };
          } catch (error) {
            await updateUploadJob(jobId, {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });

            // Notify owner of upload failure
            await notifyOwner({
              title: "❌ SmartCart: Catalog Upload Failed",
              content: `Failed to upload catalog.\n\nJob ID: ${jobId}\nError: ${error instanceof Error ? error.message : "Unknown error"}\n\nPlease check the admin dashboard for details.`,
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
          ? searchLogs.reduce((sum, log) => sum + (log.responseTimeMs || 0), 0) / searchLogs.length
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
});

export type AppRouter = typeof appRouter;
