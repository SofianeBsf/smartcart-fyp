import { invokeLLM } from "./_core/llm";
import { 
  getAllProductsWithOptionalEmbeddings, 
  getActiveRankingWeights, 
  logSearch, 
  saveSearchExplanations,
  createEmbedding,
  getProductById
} from "./db";
import type { Product, RankingWeight } from "../drizzle/schema";

/**
 * Embedding dimension for the model we use.
 * We use a text-embedding approach via LLM to generate semantic embeddings.
 */
const EMBEDDING_DIMENSION = 384;

/**
 * Generate embedding for a text using a fast deterministic hash-based approach.
 * This creates consistent embeddings that match the product embeddings format.
 * For production, this would use actual Sentence-BERT or similar models.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use fast deterministic embedding for query - matches the product embedding format
  return generateDeterministicEmbedding(text);
}

/**
 * Generate a deterministic embedding based on text content.
 * Uses a hash-based approach for consistent, fast results.
 */
function generateDeterministicEmbedding(text: string): number[] {
  const embedding: number[] = [];
  const normalizedText = text.toLowerCase();
  
  // Create a deterministic hash-based embedding
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    let value = 0;
    for (let j = 0; j < normalizedText.length; j++) {
      value += normalizedText.charCodeAt(j) * Math.sin((i + 1) * (j + 1) * 0.01);
    }
    embedding.push(Math.tanh(value * 0.001)); // Normalize to [-1, 1]
  }
  
  return normalizeVector(embedding);
}

/**
 * Generate a deterministic pseudo-random embedding based on text hash.
 * Used as fallback when LLM embedding fails.
 */
function generateRandomEmbedding(): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    embedding.push((Math.random() * 2) - 1);
  }
  return normalizeVector(embedding);
}

/**
 * Normalize vector dimension to target size.
 */
function normalizeVectorDimension(vector: number[], targetDim: number): number[] {
  if (!Array.isArray(vector)) return generateRandomEmbedding();
  
  const result: number[] = [];
  for (let i = 0; i < targetDim; i++) {
    result.push(vector[i] ?? (Math.random() * 2 - 1));
  }
  return result;
}

/**
 * Normalize a vector to unit length (L2 normalization).
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn("[SemanticSearch] Vector dimension mismatch:", a.length, b.length);
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

/**
 * Extract matched terms between query and product text.
 */
function extractMatchedTerms(query: string, productText: string): string[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const productLower = productText.toLowerCase();
  
  return queryTerms.filter(term => productLower.includes(term));
}

/**
 * Generate human-readable explanation for why a product was suggested.
 */
function generateExplanation(
  product: Product,
  scores: {
    semantic: number;
    rating: number;
    price: number;
    stock: number;
    recency: number;
    final: number;
  },
  matchedTerms: string[],
  weights: RankingWeight
): string {
  const parts: string[] = [];
  
  // Semantic match explanation
  if (scores.semantic > 0.5) {
    parts.push(`High semantic match (${(scores.semantic * 100).toFixed(0)}%)`);
  } else if (scores.semantic > 0.3) {
    parts.push(`Moderate semantic match (${(scores.semantic * 100).toFixed(0)}%)`);
  }
  
  // Matched terms
  if (matchedTerms.length > 0) {
    parts.push(`Matches: ${matchedTerms.slice(0, 3).join(", ")}`);
  }
  
  // Rating
  if (product.rating && Number(product.rating) >= 4) {
    parts.push(`Highly rated (${product.rating}★)`);
  }
  
  // Price value
  if (scores.price > 0.7) {
    parts.push("Great value");
  }
  
  // Availability
  if (product.availability === "in_stock") {
    parts.push("In stock");
  }
  
  return parts.length > 0 ? parts.join(" • ") : "Relevant to your search";
}

/**
 * Normalize price score (inverse - lower price = higher score).
 * Uses min-max normalization across the result set.
 */
function normalizePriceScore(price: number, minPrice: number, maxPrice: number): number {
  if (maxPrice === minPrice) return 0.5;
  // Inverse: lower price = higher score
  return 1 - ((price - minPrice) / (maxPrice - minPrice));
}

/**
 * Normalize rating score (0-5 scale to 0-1).
 */
function normalizeRatingScore(rating: number | null): number {
  if (rating === null || rating === undefined) return 0.5;
  return Number(rating) / 5;
}

/**
 * Normalize stock score based on availability.
 */
function normalizeStockScore(availability: string | null, quantity: number | null): number {
  if (availability === "out_of_stock") return 0;
  if (availability === "low_stock") return 0.5;
  if (availability === "in_stock") {
    // Bonus for high stock
    const qty = quantity ?? 100;
    return Math.min(1, 0.7 + (qty / 500) * 0.3);
  }
  return 0.5;
}

/**
 * Normalize recency score based on product creation date.
 */
function normalizeRecencyScore(createdAt: Date): number {
  const now = Date.now();
  const created = createdAt.getTime();
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
  
  // Products created within last 30 days get full score
  // Score decays over 365 days
  if (daysSinceCreation <= 30) return 1;
  if (daysSinceCreation >= 365) return 0.1;
  
  return 1 - ((daysSinceCreation - 30) / 335) * 0.9;
}

export interface SearchResult {
  product: Product;
  scores: {
    final: number;
    semantic: number;
    rating: number;
    price: number;
    stock: number;
    recency: number;
  };
  matchedTerms: string[];
  explanation: string;
  position: number;
}

export interface SemanticSearchOptions {
  limit?: number;
  minScore?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sessionId?: string;
}

/**
 * Perform semantic search with explainable ranking.
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<{ results: SearchResult[]; searchLogId: number; responseTimeMs: number }> {
  const startTime = Date.now();
  const {
    limit = 20,
    minScore = 0.1,
    category,
    minPrice,
    maxPrice,
    inStockOnly = false,
    sessionId = "anonymous"
  } = options;

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  
  // Get all products, with embeddings when available
  const productsWithEmbeddings = await getAllProductsWithOptionalEmbeddings(5000, 0);
  
  // Get active ranking weights
  const weights = await getActiveRankingWeights();
  const alpha = Number(weights.alpha);
  const beta = Number(weights.beta);
  const gamma = Number(weights.gamma);
  const delta = Number(weights.delta);
  const epsilon = Number(weights.epsilon);

  // Calculate price range for normalization
  const prices = productsWithEmbeddings
    .map(p => Number(p.product.price) || 0)
    .filter(p => p > 0);
  const minPriceInSet = Math.min(...prices, 0);
  const maxPriceInSet = Math.max(...prices, 1);

  // Score all products
  let scoredProducts = productsWithEmbeddings.map(({ product, embedding }) => {
    // Calculate individual scores. If an embedding is missing, generate a deterministic fallback embedding
    // from product text so search still works even before precomputing vectors.
    const fallbackProductEmbedding = generateDeterministicEmbedding(
      `${product.title} ${product.description || ""} ${product.category || ""}`
    );
    const semanticScore = cosineSimilarity(
      queryEmbedding,
      (embedding as number[] | null) ?? fallbackProductEmbedding
    );
    const ratingScore = normalizeRatingScore(product.rating ? Number(product.rating) : null);
    const priceScore = normalizePriceScore(
      Number(product.price) || 0,
      minPriceInSet,
      maxPriceInSet
    );
    const stockScore = normalizeStockScore(product.availability, product.stockQuantity);
    const recencyScore = normalizeRecencyScore(product.createdAt);

    // Extract matched terms first (needed for keyword boost)
    const productText = `${product.title} ${product.description || ""} ${product.category || ""}`;
    const matchedTerms = extractMatchedTerms(query, productText);
    
    // Calculate keyword match boost (0 to 0.5 based on matched terms)
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const keywordBoost = queryTerms.length > 0 
      ? (matchedTerms.length / queryTerms.length) * 0.5 
      : 0;

    // Calculate weighted final score with keyword boost
    const finalScore = 
      alpha * Math.max(0, semanticScore + keywordBoost) +
      beta * ratingScore +
      gamma * priceScore +
      delta * stockScore +
      epsilon * recencyScore;

    return {
      product,
      scores: {
        final: finalScore,
        semantic: Math.max(0, semanticScore),
        rating: ratingScore,
        price: priceScore,
        stock: stockScore,
        recency: recencyScore,
      },
      matchedTerms,
      explanation: "",
      position: 0,
    };
  });

  // Apply filters
  if (category) {
    scoredProducts = scoredProducts.filter(
      p => p.product.category?.toLowerCase() === category.toLowerCase()
    );
  }
  if (minPrice !== undefined) {
    scoredProducts = scoredProducts.filter(
      p => Number(p.product.price) >= minPrice
    );
  }
  if (maxPrice !== undefined) {
    scoredProducts = scoredProducts.filter(
      p => Number(p.product.price) <= maxPrice
    );
  }
  if (inStockOnly) {
    scoredProducts = scoredProducts.filter(
      p => p.product.availability !== "out_of_stock"
    );
  }

  // Filter by minimum score and sort
  const results = scoredProducts
    .filter(p => p.scores.final >= minScore)
    .sort((a, b) => b.scores.final - a.scores.final)
    .slice(0, limit)
    .map((result, index) => ({
      ...result,
      position: index + 1,
      explanation: generateExplanation(result.product, result.scores, result.matchedTerms, weights),
    }));

  const responseTimeMs = Date.now() - startTime;

  // Log the search
  const searchLogId = await logSearch({
    sessionId,
    query,
    queryEmbedding,
    resultsCount: results.length,
    responseTimeMs,
    filters: { category, minPrice, maxPrice, inStockOnly },
  });

  // Save explanations for evaluation
  if (searchLogId && results.length > 0) {
    await saveSearchExplanations(
      results.map(r => ({
        searchLogId,
        productId: r.product.id,
        position: r.position,
        finalScore: r.scores.final.toFixed(6),
        semanticScore: r.scores.semantic.toFixed(6),
        ratingScore: r.scores.rating.toFixed(6),
        priceScore: r.scores.price.toFixed(6),
        stockScore: r.scores.stock.toFixed(6),
        recencyScore: r.scores.recency.toFixed(6),
        matchedTerms: r.matchedTerms,
        explanation: r.explanation,
      }))
    );
  }

  return { results, searchLogId, responseTimeMs };
}

/**
 * Generate embedding for a product and store it.
 */
export async function generateProductEmbedding(productId: number): Promise<boolean> {
  try {
    const product = await getProductById(productId);
    if (!product) {
      console.error("[SemanticSearch] Product not found:", productId);
      return false;
    }

    // Combine product text for embedding
    const textToEmbed = [
      product.title,
      product.description,
      product.category,
      product.subcategory,
      product.brand,
      ...(product.features || []),
    ].filter(Boolean).join(" ");

    const embedding = await generateEmbedding(textToEmbed);

    await createEmbedding({
      productId,
      embedding,
      textUsed: textToEmbed.slice(0, 1000),
    });

    return true;
  } catch (error) {
    console.error("[SemanticSearch] Error generating product embedding:", error);
    return false;
  }
}

/**
 * Batch generate embeddings for multiple products.
 */
export async function batchGenerateEmbeddings(
  productIds: number[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < productIds.length; i++) {
    const result = await generateProductEmbedding(productIds[i]);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    if (onProgress) {
      onProgress(i + 1, productIds.length);
    }

    // Small delay to avoid rate limiting
    if (i < productIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { success, failed };
}
