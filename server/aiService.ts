/**
 * AI Service Client
 * 
 * Connects to the FastAPI Python AI service for:
 * - Sentence-BERT embedding generation
 * - Semantic search with explainable ranking
 * - Similar product recommendations
 */

import axios from "axios";

// AI Service configuration
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// Types matching the FastAPI service
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

// Create axios instance with timeout
const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 60000, // 60 second timeout for model loading
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Check if the AI service is healthy
 */
export async function checkAIServiceHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 1500 });
    return response.data.status === "healthy";
  } catch (error) {
    console.error("[AIService] Health check failed:", error);
    return false;
  }
}

/**
 * Generate embedding for a single text using Sentence-BERT
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await aiClient.post<EmbeddingResponse>("/embed", { text });
    return response.data.embedding;
  } catch (error) {
    console.error("[AIService] Error generating embedding:", error);
    throw new Error("Failed to generate embedding from AI service");
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await aiClient.post<BatchEmbeddingResponse>("/embed/batch", { texts });
    return response.data.embeddings;
  } catch (error) {
    console.error("[AIService] Error generating batch embeddings:", error);
    throw new Error("Failed to generate batch embeddings from AI service");
  }
}

/**
 * Perform semantic search using the AI service
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
  try {
    const response = await aiClient.post<SemanticSearchResponse>("/search", {
      query,
      products,
      weights: weights || {
        alpha: 0.5,
        beta: 0.2,
        gamma: 0.15,
        delta: 0.1,
        epsilon: 0.05,
      },
      limit: options?.limit || 20,
      min_price: options?.minPrice,
      max_price: options?.maxPrice,
      category: options?.category,
    });
    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[AIService] Error in semantic search, returning empty results for fallback:", errorMessage);
    // Return a structured empty response so the router can fall back gracefully
    return {
      results: [],
      query,
      query_embedding: [],
      total_results: 0,
      response_time_ms: 0
    };
  }
}

/**
 * Find similar products using the AI service
 */
export async function findSimilarProductsViaAI(
  productEmbedding: number[],
  products: Product[],
  excludeId?: number,
  limit: number = 5
): Promise<SimilarProductsResponse> {
  try {
    const response = await aiClient.post<SimilarProductsResponse>("/similar", {
      product_embedding: productEmbedding,
      products,
      exclude_id: excludeId,
      limit,
    });
    return response.data;
  } catch (error) {
    console.error("[AIService] Error finding similar products:", error);
    throw new Error("Failed to find similar products via AI service");
  }
}

/**
 * Preload the Sentence-BERT model (call on startup)
 */
export async function preloadModel(): Promise<boolean> {
  try {
    const response = await aiClient.post("/preload-model");
    console.log("[AIService] Model preloaded:", response.data);
    return true;
  } catch (error) {
    console.error("[AIService] Error preloading model:", error);
    return false;
  }
}

/**
 * Convert database product to AI service format
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
 * Convert AI service weights to database format
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
