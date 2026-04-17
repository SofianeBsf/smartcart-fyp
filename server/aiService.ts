/**
 * AI Service — Local Embedding Module
 *
 * All embedding and scoring is done in-process using Hugging Face Transformers.js
 * (BAAI/bge-small-en-v1.5). No external Python service required.
 *
 * Ported from the Python FastAPI service (ai-service/main.py) to eliminate
 * the network hop, cold-start latency, and operational dependency on a
 * separate process.
 */

import * as localEmbedding from "./localEmbedding";

// ============================================================================
// Types (unchanged — same contract as before)
// ============================================================================

export interface EmbeddingResponse {
  embedding: number[];
  dimension: number;
}

export interface BatchEmbeddingResponse {
  embeddings: number[][];
  dimension: number;
  count: number;
}

export interface Product {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  price?: number | null;
  rating?: number | null;
  review_count?: number | null;
  availability?: string | null;
  stock_quantity?: number | null;
  embedding?: number[] | null;
  created_at?: string | null;
}

export interface RankingWeights {
  alpha: number;  // Semantic similarity weight
  beta: number;   // Rating weight
  gamma: number;  // Price weight
  delta: number;  // Stock availability weight
  epsilon: number; // Recency weight
}

export interface ScoreBreakdown {
  semantic_score: number;
  rating_score: number;
  price_score: number;
  stock_score: number;
  recency_score: number;
  final_score: number;
  matched_terms: string[];
  explanation: string;
}

export interface SearchResult {
  product: Product;
  score_breakdown: ScoreBreakdown;
  rank: number;
}

export interface SemanticSearchResponse {
  results: SearchResult[];
  query: string;
  query_embedding: number[];
  total_results: number;
  response_time_ms: number;
}

export interface SimilarProductsResponse {
  similar_products: SearchResult[];
}

export interface EmbeddingHealthSample {
  id: number;
  text: string;
  embedding: number[];
}

export interface EmbeddingHealthReport {
  model_name: string;
  verdict: "healthy" | "broken" | "mixed" | "unknown";
  ok_count: number;
  total: number;
  samples: Array<{
    id: number;
    cosine_to_fresh: number | null;
    status: string;
    stored_dim?: number;
    fresh_dim?: number;
  }>;
}

// ============================================================================
// Helper: cosine similarity
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

// ============================================================================
// Helper: normalize vector
// ============================================================================

function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

// ============================================================================
// Helper: extract matched terms
// ============================================================================

function extractMatchedTerms(query: string, product: Product): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const productText = `${product.title} ${product.description || ""} ${product.category || ""}`.toLowerCase();
  return queryTerms.filter(term => term.length > 2 && productText.includes(term));
}

// ============================================================================
// Helper: recency score (exponential decay, 180-day half-life)
// ============================================================================

function computeRecencyScore(createdAt: string | null | undefined): number {
  if (!createdAt) return 0.5;
  try {
    const ts = createdAt.replace("Z", "+00:00");
    const dt = new Date(ts);
    if (isNaN(dt.getTime())) return 0.5;
    const ageDays = Math.max(0, (Date.now() - dt.getTime()) / 86_400_000);
    const halfLifeDays = 180;
    return Math.max(0, Math.min(1, Math.exp(-Math.LN2 * ageDays / halfLifeDays)));
  } catch {
    return 0.5;
  }
}

// ============================================================================
// Helper: generate explanation
// ============================================================================

function generateExplanation(
  product: Product,
  breakdown: { semantic_score: number; rating_score: number; price_score: number; stock_score: number },
  matchedTerms: string[],
): string {
  const parts: string[] = [];

  if (matchedTerms.length > 0) {
    parts.push(`Matches: ${matchedTerms.slice(0, 4).join(", ")}`);
  }
  if (product.rating != null && product.rating >= 4.5) {
    parts.push(`Highly rated (${product.rating.toFixed(1)}★)`);
  } else if (product.rating != null && product.rating >= 4.0) {
    parts.push(`Well rated (${product.rating.toFixed(1)}★)`);
  }
  if (breakdown.price_score > 0.7) {
    parts.push("Great value");
  } else if (breakdown.price_score > 0.5) {
    parts.push("Good price");
  }
  if (product.availability === "in_stock") {
    parts.push("In stock");
  } else if (product.availability === "low_stock") {
    parts.push("Limited stock");
  }
  if (breakdown.semantic_score > 0.8) {
    parts.push("Strong semantic match");
  } else if (breakdown.semantic_score > 0.6) {
    parts.push("Good semantic match");
  }

  return parts.length > 0 ? parts.join(" • ") : "Relevant to your search";
}

// ============================================================================
// In-memory product embedding cache (for products without DB embeddings)
// ============================================================================

const _productEmbeddingCache = new Map<number, number[]>();

async function getOrBuildProductEmbedding(product: Product): Promise<number[]> {
  // Use precomputed embedding from DB if available
  if (product.embedding && Array.isArray(product.embedding) && product.embedding.length > 0) {
    return normalizeVector(product.embedding);
  }

  // Check in-memory cache
  const cached = _productEmbeddingCache.get(product.id);
  if (cached) return cached;

  // Generate embedding locally
  const text = [product.title, product.description || "", product.category || ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const vec = await localEmbedding.generatePassageEmbedding(text);
  _productEmbeddingCache.set(product.id, vec);
  return vec;
}

// ============================================================================
// Public API — drop-in replacements for the old HTTP-based functions
// ============================================================================

/**
 * Health check — always healthy since embedding is local.
 */
export async function checkAIServiceHealth(): Promise<boolean> {
  try {
    const { healthy } = await localEmbedding.checkHealth();
    return healthy;
  } catch {
    return false;
  }
}

/**
 * Generate embedding for a PASSAGE / product text (no query prefix).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return localEmbedding.generatePassageEmbedding(text);
}

/**
 * Generate embedding for a SEARCH QUERY (with BGE query prefix).
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  return localEmbedding.generateQueryEmbedding(text);
}

/**
 * Generate embeddings for multiple texts in batch.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  return localEmbedding.generateBatchPassageEmbeddings(texts);
}

/**
 * Perform semantic search locally — same ranking formula as the Python service.
 *
 * Score = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency
 */
export async function semanticSearchViaAI(
  query: string,
  products: Product[],
  weights?: RankingWeights,
  options?: {
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    category?: string;
  }
): Promise<SemanticSearchResponse> {
  const startTime = Date.now();

  const w: RankingWeights = weights || {
    alpha: 0.5,
    beta: 0.2,
    gamma: 0.15,
    delta: 0.1,
    epsilon: 0.05,
  };

  // Generate query embedding (with BGE prefix)
  const queryEmbedding = await localEmbedding.generateQueryEmbedding(query);

  // Apply filters
  let filtered = products;
  if (options?.category) {
    const cat = options.category.toLowerCase();
    filtered = filtered.filter(p => p.category && p.category.toLowerCase().includes(cat));
  }
  if (options?.minPrice != null) {
    filtered = filtered.filter(p => p.price != null && p.price >= options.minPrice!);
  }
  if (options?.maxPrice != null) {
    filtered = filtered.filter(p => p.price != null && p.price <= options.maxPrice!);
  }

  // Price range for normalization
  const allPrices = filtered.map(p => p.price).filter((p): p is number => p != null && p > 0);
  const minP = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxP = allPrices.length > 0 ? Math.max(...allPrices) : 1;
  const priceRange = maxP - minP;

  // Score all products
  const scored: Array<{ product: Product; breakdown: ScoreBreakdown }> = [];

  for (const product of filtered) {
    const productEmbedding = await getOrBuildProductEmbedding(product);

    // Semantic score: cosine similarity clamped to [0,1]
    const rawSim = cosineSimilarity(queryEmbedding, productEmbedding);
    const semanticScore = Math.max(0, Math.min(1, rawSim));

    // Rating score
    const ratingScore = (product.rating || 0) / 5.0;

    // Price score (lower = better)
    let priceScore = 0.5;
    if (product.price != null && priceRange > 0) {
      priceScore = 1 - (product.price - minP) / priceRange;
    }

    // Stock score
    const stockMap: Record<string, number> = { in_stock: 1.0, low_stock: 0.5, out_of_stock: 0.0 };
    const stockScore = stockMap[product.availability || "in_stock"] ?? 0.5;

    // Recency score
    const recencyScore = computeRecencyScore(product.created_at);

    // Final weighted score
    const finalScore =
      w.alpha * semanticScore +
      w.beta * ratingScore +
      w.gamma * priceScore +
      w.delta * stockScore +
      w.epsilon * recencyScore;

    const matchedTerms = extractMatchedTerms(query, product);
    const explanation = generateExplanation(
      product,
      { semantic_score: semanticScore, rating_score: ratingScore, price_score: priceScore, stock_score: stockScore },
      matchedTerms,
    );

    scored.push({
      product,
      breakdown: {
        semantic_score: Math.round(semanticScore * 10000) / 10000,
        rating_score: Math.round(ratingScore * 10000) / 10000,
        price_score: Math.round(priceScore * 10000) / 10000,
        stock_score: Math.round(stockScore * 10000) / 10000,
        recency_score: Math.round(recencyScore * 10000) / 10000,
        final_score: Math.round(finalScore * 10000) / 10000,
        matched_terms: matchedTerms,
        explanation,
      },
    });
  }

  // Sort by final score descending
  scored.sort((a, b) => b.breakdown.final_score - a.breakdown.final_score);

  const limit = options?.limit || 20;
  const results: SearchResult[] = scored.slice(0, limit).map((s, i) => ({
    product: s.product,
    score_breakdown: s.breakdown,
    rank: i + 1,
  }));

  return {
    results,
    query,
    query_embedding: queryEmbedding,
    total_results: results.length,
    response_time_ms: Date.now() - startTime,
  };
}

/**
 * Find similar products by embedding.
 */
export async function findSimilarProductsViaAI(
  productEmbedding: number[],
  products: Product[],
  excludeId?: number,
  limit: number = 5
): Promise<SimilarProductsResponse> {
  const srcVec = normalizeVector(productEmbedding);

  const similarities: Array<{ product: Product; sim: number }> = [];

  for (const product of products) {
    if (excludeId != null && product.id === excludeId) continue;
    const vec = await getOrBuildProductEmbedding(product);
    const sim = cosineSimilarity(srcVec, vec);
    similarities.push({ product, sim });
  }

  similarities.sort((a, b) => b.sim - a.sim);

  const results: SearchResult[] = similarities.slice(0, limit).map((s, i) => {
    const normalizedSim = Math.max(0, Math.min(1, s.sim));
    return {
      product: s.product,
      score_breakdown: {
        semantic_score: Math.round(normalizedSim * 10000) / 10000,
        rating_score: Math.round(((s.product.rating || 0) / 5.0) * 10000) / 10000,
        price_score: 0.5,
        stock_score: s.product.availability === "in_stock" ? 1.0 : 0.5,
        recency_score: Math.round(computeRecencyScore(s.product.created_at) * 10000) / 10000,
        final_score: Math.round(normalizedSim * 10000) / 10000,
        matched_terms: [],
        explanation: "Similar to viewed product",
      },
      rank: i + 1,
    };
  });

  return { similar_products: results };
}

/**
 * Diagnose whether stored embeddings match the current model.
 */
export async function checkEmbeddingHealth(
  samples: EmbeddingHealthSample[],
): Promise<EmbeddingHealthReport> {
  try {
    const results: EmbeddingHealthReport["samples"] = [];

    for (const sample of samples) {
      if (!sample.embedding || !sample.text) {
        results.push({ id: sample.id, cosine_to_fresh: null, status: "missing_data" });
        continue;
      }

      const storedVec = normalizeVector(sample.embedding);
      const freshVec = await localEmbedding.generatePassageEmbedding(sample.text);
      const cos = cosineSimilarity(storedVec, freshVec);

      let status: string;
      if (cos >= 0.95) status = "ok_bge";
      else if (cos >= 0.5) status = "suspicious_partial_match";
      else status = "mismatch_different_model";

      results.push({
        id: sample.id,
        cosine_to_fresh: Math.round(cos * 10000) / 10000,
        status,
        stored_dim: sample.embedding.length,
        fresh_dim: freshVec.length,
      });
    }

    const oks = results.filter(r => r.status === "ok_bge").length;
    const total = results.length;
    const verdict: EmbeddingHealthReport["verdict"] =
      oks === total && total > 0 ? "healthy" :
      oks === 0 ? "broken" : "mixed";

    return {
      model_name: localEmbedding.getModelName(),
      verdict,
      ok_count: oks,
      total,
      samples: results,
    };
  } catch {
    return {
      model_name: localEmbedding.getModelName(),
      verdict: "unknown",
      ok_count: 0,
      total: samples.length,
      samples: [],
    };
  }
}

/**
 * Clear the in-memory product embedding cache.
 */
export async function clearAIServiceCache(): Promise<{ cleared: boolean; entries: number }> {
  const entries = _productEmbeddingCache.size;
  _productEmbeddingCache.clear();
  return { cleared: true, entries };
}

/**
 * Preload the embedding model.
 */
export async function preloadModel(): Promise<boolean> {
  try {
    await localEmbedding.preloadModel();
    console.log("[AIService] Local model preloaded:", localEmbedding.getModelName());
    return true;
  } catch (error) {
    console.error("[AIService] Error preloading model:", error);
    return false;
  }
}

/**
 * Convert database product to AI service format.
 */
export function toAIProduct(dbProduct: {
  id: number;
  title: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
  availability?: string | null;
  stockQuantity?: number | null;
  createdAt?: Date | null;
  embedding?: number[] | null;
}): Product {
  return {
    id: dbProduct.id,
    title: dbProduct.title,
    description: dbProduct.description,
    category: dbProduct.category,
    price: dbProduct.price ? parseFloat(dbProduct.price) : null,
    rating: dbProduct.rating ? parseFloat(dbProduct.rating) : null,
    review_count: dbProduct.reviewCount,
    availability: dbProduct.availability,
    stock_quantity: dbProduct.stockQuantity,
    created_at: dbProduct.createdAt?.toISOString() || null,
    embedding: dbProduct.embedding,
  };
}

/**
 * Convert AI service weights to database format.
 */
export function fromDBWeights(dbWeights: {
  alpha: string;
  beta: string;
  gamma: string;
  delta: string;
  epsilon: string;
}): RankingWeights {
  return {
    alpha: parseFloat(dbWeights.alpha),
    beta: parseFloat(dbWeights.beta),
    gamma: parseFloat(dbWeights.gamma),
    delta: parseFloat(dbWeights.delta),
    epsilon: parseFloat(dbWeights.epsilon),
  };
}
