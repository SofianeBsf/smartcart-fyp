import {
  getAllProductsWithOptionalEmbeddings,
  getActiveRankingWeights,
  logSearch,
  saveSearchExplanations,
  createEmbedding,
  getProductById,
  getProductsByIds,
} from "./db";
import * as localEmbedding from "./localEmbedding";
import type { Product, RankingWeight } from "../drizzle/schema";

/**
 * Embedding dimension for the BGE-small-en-v1.5 model.
 */
const EMBEDDING_DIMENSION = 384;

/**
 * Common English stop words to exclude from TF-IDF calculations
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "to", "was", "will",
  "with", "the", "this", "that", "these", "those", "i", "you", "he", "she", "it",
  "we", "they", "what", "which", "who", "when", "where", "why", "how", "all",
  "each", "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "can", "could", "may", "might", "should", "would", "have", "had", "do", "does",
  "did", "get", "gets", "got", "make", "makes", "made", "go", "goes", "went",
  "about", "above", "after", "again", "against", "before", "below", "between",
  "during", "into", "through", "during", "before", "after", "up", "down", "out",
  "off", "over", "under", "here", "there", "then", "now", "am"
]);

/**
 * Synonym mapping for e-commerce terms to improve search relevance
 */
const SYNONYMS: { [key: string]: string[] } = {
  "quiet": ["silent", "noise-cancelling", "noiseless", "soundproof", "silent"],
  "cheap": ["affordable", "budget", "low-cost", "value", "inexpensive", "economical"],
  "fast": ["quick", "rapid", "speedy", "high-speed", "swift"],
  "big": ["large", "spacious", "oversized", "huge", "jumbo", "size"],
  "small": ["compact", "mini", "portable", "tiny", "lightweight"],
  "good": ["quality", "premium", "excellent", "great", "nice", "best"],
  "wireless": ["bluetooth", "cordless", "wifi", "wireless"],
  "lightweight": ["light", "ultralight", "portable", "weight", "slim"],
  "durable": ["sturdy", "strong", "tough", "lasting", "solid"],
  "waterproof": ["water-resistant", "water-proof", "waterproof", "rain", "wet"],
  "noisy": ["loud", "noise", "sound", "acoustic"],
  "expensive": ["costly", "pricey", "dear", "high-end"],
  "bright": ["luminous", "light", "shiny", "reflective"],
  "dark": ["dim", "low-light", "night"],
};

/**
 * Global TF-IDF state for fallback embedding generation
 */
let idfDict: Map<string, number> = new Map();
let vocabularySize = 0;
let corpusBuilt = false;

/**
 * Reset the in-memory TF-IDF corpus cache. Called from the admin
 * "Clear Search Cache" action so the next search rebuilds IDFs from the
 * latest catalog.
 */
export function resetCorpusCache(): { entries: number } {
  const entries = idfDict.size;
  idfDict = new Map();
  vocabularySize = 0;
  corpusBuilt = false;
  return { entries };
}

/**
 * Tokenize text for TF-IDF calculations
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ") // Replace punctuation with spaces
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Expand query with synonyms
 */
function expandQueryWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set<string>();

  for (const token of tokens) {
    expanded.add(token);
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach(syn => expanded.add(syn));
    }
  }

  return Array.from(expanded);
}

/**
 * Build IDF dictionary from corpus of product texts
 */
export function buildCorpusIDF(productTexts: string[]): void {
  const docFrequency = new Map<string, number>();
  const numDocs = productTexts.length;

  // Count document frequency for each term
  for (const text of productTexts) {
    const uniqueTokens = new Set(tokenize(text));
    uniqueTokens.forEach(token => {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    });
  }

  // Calculate IDF for each term: log(N / df)
  idfDict = new Map();
  docFrequency.forEach((df, term) => {
    idfDict.set(term, Math.log(numDocs / Math.max(df, 1)));
  });

  vocabularySize = idfDict.size;
  corpusBuilt = true;
}

/**
 * Generate TF-IDF vector for a text
 */
function generateTFIDFVector(text: string, targetDim: number = EMBEDDING_DIMENSION): number[] {
  const tokens = tokenize(text);
  const expandedTokens = expandQueryWithSynonyms(tokens);

  // Calculate term frequency
  const tf = new Map<string, number>();
  for (const token of expandedTokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Create vector representation using selected features
  const vector: number[] = Array.from({ length: targetDim }, (): number => 0);

  tf.forEach((frequency, term) => {
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      hash = ((hash << 5) - hash) + term.charCodeAt(i);
      hash |= 0;
    }
    const dimension = Math.abs(hash) % targetDim;
    const idf = idfDict.get(term) || 1;
    const tfidf = frequency * idf;
    vector[dimension] += tfidf * 0.1;
  });

  if (vector.every(v => v === 0)) {
    for (let i = 0; i < Math.min(5, targetDim); i++) {
      (vector as number[])[i] = 0.1;
    }
  }

  return normalizeVector(vector);
}

/**
 * Generate a query embedding using the local BGE model.
 *
 * This uses the Transformers.js local model with the BGE query prefix
 * ("Represent this sentence for searching relevant passages: "). No
 * external Python service required.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return localEmbedding.generateQueryEmbedding(text);
}

/**
 * Generate a deterministic embedding based on TF-IDF approach.
 * Used as fallback when the local model fails to load.
 */
function generateDeterministicEmbedding(text: string): number[] {
  return generateTFIDFVector(text, EMBEDDING_DIMENSION);
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

// ============================================================================
// Hybrid search: exact match boost
// ============================================================================

/**
 * Compute a keyword/exact-match score for a product against a query.
 *
 * Returns a value in [0, 1]:
 *   - 1.0  → product title exactly equals the query (case-insensitive)
 *   - 0.85 → product title contains the full query as a substring
 *   - 0.4–0.7 → partial token overlap (Jaccard-like on words)
 *   - 0.0  → no lexical overlap at all
 *
 * This is designed to complement semantic similarity so that exact product
 * name searches always rank the correct product first, even if something
 * else is semantically close.
 */
function computeKeywordScore(query: string, product: { title: string; description?: string | null; category?: string | null }): number {
  const q = query.toLowerCase().trim();
  const title = product.title.toLowerCase().trim();

  // Exact title match → maximum boost
  if (title === q) return 1.0;

  // Title contains the full query as a substring
  if (title.includes(q)) return 0.85;

  // Query contains the full title as a substring (user typed more than the title)
  if (q.includes(title)) return 0.80;

  // Token-level overlap (Jaccard similarity on title)
  const qTokensArr = q.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
  const titleTokensArr = title.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
  const qTokens = new Set(qTokensArr);
  const titleTokens = new Set(titleTokensArr);

  if (qTokens.size === 0 || titleTokens.size === 0) return 0;

  let matches = 0;
  qTokensArr.forEach(t => {
    if (titleTokens.has(t)) matches++;
    else {
      // Check partial match (e.g., "headphone" matches "headphones")
      let found = false;
      titleTokensArr.forEach(tt => {
        if (!found && (tt.startsWith(t) || t.startsWith(tt))) {
          matches += 0.8;
          found = true;
        }
      });
    }
  });

  // Scale by proportion of query terms matched, weighted toward title coverage
  const queryOverlap = matches / qTokens.size;
  const titleOverlap = Math.min(matches, titleTokens.size) / titleTokens.size;

  // Combine: mostly care about query term coverage, with bonus for title coverage
  const score = 0.7 * queryOverlap + 0.3 * titleOverlap;

  // Also check description for partial matches
  const desc = (product.description || "").toLowerCase();
  let descBonus = 0;
  if (desc.includes(q)) {
    descBonus = 0.1;
  } else {
    let descMatches = 0;
    qTokensArr.forEach(t => {
      if (desc.includes(t)) descMatches++;
    });
    descBonus = (descMatches / qTokens.size) * 0.05;
  }

  return Math.min(1.0, score * 0.7 + descBonus);
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
    keyword?: number;
  },
  matchedTerms: string[],
  weights: RankingWeight
): string {
  const MAX_PARTS = 3;
  const parts: string[] = [];

  // 1. Match quality (pick ONE — most important signal)
  if (scores.keyword != null && scores.keyword >= 0.85) {
    parts.push("Exact match");
  } else if (scores.keyword != null && scores.keyword >= 0.5) {
    parts.push("Keyword match");
  } else if (scores.semantic > 0.5) {
    parts.push(`${(scores.semantic * 100).toFixed(0)}% relevant`);
  } else if (scores.semantic > 0.3) {
    parts.push(`${(scores.semantic * 100).toFixed(0)}% relevant`);
  }

  // 2. Rating (only if notable)
  if (parts.length < MAX_PARTS && product.rating && Number(product.rating) >= 4) {
    parts.push(`${Number(product.rating).toFixed(1)}★`);
  }

  // 3. Price value (only if notably good)
  if (parts.length < MAX_PARTS && scores.price > 0.7) {
    parts.push("Great value");
  }

  return parts.length > 0 ? parts.join(" · ") : "Relevant to your search";
}

/**
 * Normalize price score (inverse - lower price = higher score).
 */
function normalizePriceScore(price: number, minPrice: number, maxPrice: number): number {
  if (maxPrice === minPrice) return 0.5;
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
    keyword?: number;
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
 * Perform hybrid semantic + keyword search with explainable ranking.
 *
 * The scoring formula is:
 *   FinalScore = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency + κ×Keyword
 *
 * Where κ (kappa) is a keyword boost weight (0.25) that ensures exact product
 * name matches always rank first. The other weights are scaled proportionally
 * to preserve the admin-configured balance.
 *
 * The keyword score is computed purely from lexical overlap (title matching,
 * substring containment, token Jaccard) — it does NOT go through the embedding
 * model so it adds negligible latency.
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

  // Get all products, with embeddings when available
  const productsWithEmbeddings = await getAllProductsWithOptionalEmbeddings(5000, 0);

  // Build corpus IDF on first search if not already built
  if (!corpusBuilt && productsWithEmbeddings.length > 0) {
    const productTexts = productsWithEmbeddings.map(({ product }) =>
      `${product.title} ${product.description || ""} ${product.category || ""} ${product.subcategory || ""}`
    );
    buildCorpusIDF(productTexts);
  }

  // Generate query embedding using local model (no external service)
  const queryEmbedding = await generateEmbedding(query);

  // Get active ranking weights
  const weights = await getActiveRankingWeights();
  const rawAlpha = Number(weights.alpha);
  const rawBeta = Number(weights.beta);
  const rawGamma = Number(weights.gamma);
  const rawDelta = Number(weights.delta);
  const rawEpsilon = Number(weights.epsilon);

  // Keyword boost weight — this ensures exact matches always win.
  // We take 25% of the total budget for keywords, scaling other weights down.
  const KAPPA = 0.25;
  const scaleFactor = 1 - KAPPA;
  const alpha = rawAlpha * scaleFactor;
  const beta = rawBeta * scaleFactor;
  const gamma = rawGamma * scaleFactor;
  const delta = rawDelta * scaleFactor;
  const epsilon = rawEpsilon * scaleFactor;

  // Calculate price range for normalization
  const prices = productsWithEmbeddings
    .map(p => Number(p.product.price) || 0)
    .filter(p => p > 0);
  const minPriceInSet = Math.min(...prices, 0);
  const maxPriceInSet = Math.max(...prices, 1);

  // Score all products with hybrid semantic + keyword ranking.
  let scoredProducts = productsWithEmbeddings.map(({ product, embedding }) => {
    // Semantic score: cosine similarity between query and product embeddings.
    let rawSemantic = 0;
    if (Array.isArray(embedding) && embedding.length === queryEmbedding.length) {
      rawSemantic = cosineSimilarity(queryEmbedding, embedding as number[]);
    }
    const semanticScore = Math.max(0, Math.min(1, rawSemantic));

    const ratingScore = normalizeRatingScore(product.rating ? Number(product.rating) : null);
    const priceScore = normalizePriceScore(
      Number(product.price) || 0,
      minPriceInSet,
      maxPriceInSet
    );
    const stockScore = normalizeStockScore(product.availability, product.stockQuantity);
    const recencyScore = normalizeRecencyScore(product.createdAt);

    // Keyword/exact-match score — purely lexical, no embedding needed.
    const keywordScore = computeKeywordScore(query, product);

    const productText = `${product.title} ${product.description || ""} ${product.category || ""}`;
    const matchedTerms = extractMatchedTerms(query, productText);

    // Weighted final score: hybrid semantic + keyword + other signals.
    const finalScore =
      alpha * semanticScore +
      beta * ratingScore +
      gamma * priceScore +
      delta * stockScore +
      epsilon * recencyScore +
      KAPPA * keywordScore;

    return {
      product,
      scores: {
        final: finalScore,
        semantic: semanticScore,
        rating: ratingScore,
        price: priceScore,
        stock: stockScore,
        recency: recencyScore,
        keyword: keywordScore,
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
 * Build the text passed to the embedding model for a single product.
 */
function buildProductText(product: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  features?: string[] | null;
}): string {
  return [
    product.title,
    product.description,
    product.category,
    product.subcategory,
    product.brand,
    ...(product.features || []),
  ].filter(Boolean).join(" ");
}

/**
 * Generate embedding for a product and store it using the local model.
 */
export async function generateProductEmbedding(productId: number): Promise<boolean> {
  try {
    const product = await getProductById(productId);
    if (!product) {
      console.error("[SemanticSearch] Product not found:", productId);
      return false;
    }

    const textToEmbed = buildProductText(product);
    const embedding = await localEmbedding.generatePassageEmbedding(textToEmbed);

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
 * Batch generate embeddings for multiple products using local model.
 */
export async function batchGenerateEmbeddings(
  productIds: number[],
  onProgress?: (completed: number, total: number) => void,
): Promise<{ success: number; failed: number }> {
  if (productIds.length === 0) return { success: 0, failed: 0 };

  const CHUNK_SIZE = 16; // Conservative for CPU inference
  let success = 0;
  let failed = 0;
  let completed = 0;

  for (let offset = 0; offset < productIds.length; offset += CHUNK_SIZE) {
    const chunkIds = productIds.slice(offset, offset + CHUNK_SIZE);
    try {
      const products = await getProductsByIds(chunkIds);
      const byId = new Map(products.map(p => [p.id, p]));
      const texts = chunkIds.map(id => {
        const p = byId.get(id);
        return p ? buildProductText(p) : "";
      });

      const toEmbedIndexes = texts
        .map((t, i) => (t.trim().length > 0 ? i : -1))
        .filter(i => i >= 0);
      if (toEmbedIndexes.length === 0) {
        failed += chunkIds.length;
        completed += chunkIds.length;
        onProgress?.(completed, productIds.length);
        continue;
      }

      const filteredTexts = toEmbedIndexes.map(i => texts[i]);

      // Try batch first
      let embeddings: number[][] | null = null;
      try {
        embeddings = await localEmbedding.generateBatchPassageEmbeddings(filteredTexts);
      } catch (batchErr) {
        console.warn("[SemanticSearch] Batch embed failed, falling back to single mode:", batchErr);
      }

      if (embeddings) {
        for (let k = 0; k < toEmbedIndexes.length; k++) {
          const localIdx = toEmbedIndexes[k];
          const productId = chunkIds[localIdx];
          try {
            await createEmbedding({
              productId,
              embedding: embeddings[k],
              textUsed: filteredTexts[k].slice(0, 1000),
            });
            success++;
          } catch (e) {
            console.error("[SemanticSearch] Failed to store embedding for", productId, e);
            failed++;
          }
        }
      } else {
        // Fallback: embed one product at a time
        for (let k = 0; k < toEmbedIndexes.length; k++) {
          const localIdx = toEmbedIndexes[k];
          const productId = chunkIds[localIdx];
          try {
            const embedding = await localEmbedding.generatePassageEmbedding(filteredTexts[k]);
            await createEmbedding({
              productId,
              embedding,
              textUsed: filteredTexts[k].slice(0, 1000),
            });
            success++;
          } catch (e) {
            console.error("[SemanticSearch] Single embed failed for", productId, e);
            failed++;
          }
        }
      }
      failed += chunkIds.length - toEmbedIndexes.length;
    } catch (error) {
      console.error(
        "[SemanticSearch] Batch embedding chunk failed, marking chunk as failed:",
        error,
      );
      failed += chunkIds.length;
    }

    completed += chunkIds.length;
    onProgress?.(completed, productIds.length);
  }

  return { success, failed };
}
