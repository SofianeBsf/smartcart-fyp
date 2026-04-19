import {
  getSessionInteractions,
  getProductsByIds,
  getProductsWithEmbeddings,
  getEmbeddingByProductId,
  getFeaturedProducts,
  getCoVisitedProducts,
  getTopInteractedProductIds,
} from "./db";
import { cosineSimilarity } from "./semanticSearch";
import type { Product, Interaction } from "../drizzle/schema";

export interface RecommendationResult {
  product: Product;
  score: number;
  reason: string;
  sourceProductId?: number;
}

/**
 * Clamp raw cosine similarity to [0, 1]. We intentionally do NOT linearly
 * rescale from [-1, 1] because that compresses the discriminative range
 * (unrelated ≈ 0.5, related ≈ 0.9) and lets rating/price/stock wash out
 * the semantic signal. BGE cosines for unrelated pairs are near 0.2, so
 * clamping negatives to 0 is the natural choice.
 */
function rescaleCosine(sim: number): number {
  return Math.max(0, Math.min(1, sim));
}

/**
 * Get session-based recommendations ("You may also like").
 *
 * Strategy (in order):
 *   1. Dense retrieval: aggregate embeddings of recent interactions and rank
 *      all candidates by cosine similarity (weighted by interaction type).
 *   2. Co-visitation fallback: if embeddings are missing, use
 *      "users who viewed X also viewed Y" from the interactions table.
 *   3. Cold-start fallback: featured + trending products.
 *
 * This matches the FYP title's "session-based recommendation" claim:
 * recommendations are derived from the anonymous session's interaction history
 * stored in the `interactions` table, keyed by the `smartcart_session` cookie.
 * The cookie is NOT rotated on login, so a logged-in user's recommendations
 * continue to reflect their pre-login browsing.
 */
export async function getSessionRecommendations(
  sessionId: string,
  options: {
    limit?: number;
    excludeProductIds?: number[];
  } = {}
): Promise<RecommendationResult[]> {
  const { limit = 8, excludeProductIds = [] } = options;

  // Get recent interactions for this session
  const interactions = await getSessionInteractions(sessionId, 20);

  if (interactions.length === 0) {
    // Cold start: return featured/popular products
    return getColdStartRecommendations(limit, excludeProductIds);
  }

  // Weight interactions by type and recency
  const interactionWeights: Record<string, number> = {
    purchase: 5,
    add_to_cart: 4,
    wishlist_add: 4,
    search_click: 3,
    click: 2,
    view: 1,
  };

  // Calculate product scores based on interactions
  const productScores = new Map<number, { score: number; type: string }>();

  interactions.forEach((interaction: Interaction, index: number) => {
    const weight = interactionWeights[interaction.interactionType] || 1;
    const recencyBoost = 1 + (interactions.length - index) / interactions.length;
    const score = weight * recencyBoost;

    const existing = productScores.get(interaction.productId);
    if (!existing || existing.score < score) {
      productScores.set(interaction.productId, {
        score,
        type: interaction.interactionType,
      });
    }
  });

  // --- Path 1: dense retrieval on embeddings ---
  const interactedProductIds = Array.from(productScores.keys());
  const interactedEmbeddings: Array<{ productId: number; embedding: number[]; score: number }> = [];

  for (const productId of interactedProductIds) {
    const embeddingRecord = await getEmbeddingByProductId(productId);
    if (embeddingRecord?.embedding) {
      interactedEmbeddings.push({
        productId,
        embedding: embeddingRecord.embedding as number[],
        score: productScores.get(productId)?.score || 1,
      });
    }
  }

  const excludeSet = new Set([...excludeProductIds, ...interactedProductIds]);

  if (interactedEmbeddings.length > 0) {
    const allProducts = await getProductsWithEmbeddings();

    const recommendations: RecommendationResult[] = [];

    for (const { product, embedding } of allProducts) {
      if (excludeSet.has(product.id) || !embedding) continue;

      // Calculate weighted similarity to interacted products
      let totalScore = 0;
      let bestMatch = { productId: 0, similarity: 0 };

      for (const interacted of interactedEmbeddings) {
        const rawSim = cosineSimilarity(embedding as number[], interacted.embedding);
        const sim = rescaleCosine(rawSim);
        const weightedSimilarity = sim * interacted.score;
        totalScore += weightedSimilarity;

        if (sim > bestMatch.similarity) {
          bestMatch = { productId: interacted.productId, similarity: sim };
        }
      }

      // Normalize by number of interacted products
      const avgScore = totalScore / interactedEmbeddings.length;

      // With clamped cosine, unrelated ≈ 0.2 and related ≈ 0.5+. Use 0.35
      // as a permissive floor so small catalogs still surface something.
      if (avgScore > 0.35) {
        recommendations.push({
          product,
          score: avgScore,
          reason: generateRecommendationReason(
            bestMatch.similarity,
            productScores.get(bestMatch.productId)?.type,
          ),
          sourceProductId: bestMatch.productId,
        });
      }
    }

    if (recommendations.length >= Math.min(4, limit)) {
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    // Otherwise fall through to co-visitation to pad results
    const padded = [...recommendations];
    const dedup = new Set<number>(padded.map(p => p.product.id));

    const covisit = await getCoVisitationRecommendations(
      interactedProductIds,
      limit - padded.length,
      excludeSet,
    );
    for (const rec of covisit) {
      if (!dedup.has(rec.product.id)) {
        padded.push(rec);
        dedup.add(rec.product.id);
      }
    }

    if (padded.length > 0) {
      return padded.sort((a, b) => b.score - a.score).slice(0, limit);
    }
  }

  // --- Path 2: co-visitation fallback (no embeddings available) ---
  const coVisit = await getCoVisitationRecommendations(
    interactedProductIds,
    limit,
    excludeSet,
  );
  if (coVisit.length > 0) {
    return coVisit;
  }

  // --- Path 3: cold start ---
  return getColdStartRecommendations(limit, [...excludeProductIds, ...interactedProductIds]);
}

/**
 * Co-visitation recommendations: "users who viewed X also viewed Y".
 *
 * For each seed product the user interacted with, pull other products that
 * appeared in the same `interactions` row set (i.e. the same sessions). This
 * is a classic session-based collaborative-filtering baseline and does not
 * require embeddings, so it works even before the Python AI service is up.
 */
async function getCoVisitationRecommendations(
  seedProductIds: number[],
  limit: number,
  excludeSet: Set<number>,
): Promise<RecommendationResult[]> {
  if (seedProductIds.length === 0 || limit <= 0) return [];

  const covisited = await getCoVisitedProducts(seedProductIds, 50);
  if (covisited.length === 0) return [];

  const candidateIds = covisited
    .filter(row => !excludeSet.has(row.productId))
    .slice(0, limit * 3)
    .map(row => row.productId);

  if (candidateIds.length === 0) return [];

  const products: Product[] = await getProductsByIds(candidateIds);
  const productById = new Map(products.map(p => [p.id, p]));

  // Normalize co-visit count into a 0-1 score using the max in the result set
  const maxCount = Math.max(...covisited.map(r => Number(r.count) || 0), 1);

  const results: RecommendationResult[] = [];
  for (const row of covisited) {
    const product = productById.get(row.productId);
    if (!product || excludeSet.has(product.id)) continue;
    const normalized = (Number(row.count) || 0) / maxCount;
    results.push({
      product,
      score: 0.5 + 0.5 * normalized, // sit above the dense-retrieval floor
      reason: "Others who viewed similar items also viewed this",
      sourceProductId: row.sourceProductId ?? undefined,
    });
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Get recommendations for a specific product ("Similar products").
 */
export async function getSimilarProducts(
  productId: number,
  limit = 6
): Promise<RecommendationResult[]> {
  const productEmbedding = await getEmbeddingByProductId(productId);

  if (!productEmbedding?.embedding) {
    // Fallback to category-based recommendations
    return getCategoryBasedRecommendations(productId, limit);
  }

  const allProducts = await getProductsWithEmbeddings();
  const recommendations: RecommendationResult[] = [];

  for (const { product, embedding } of allProducts) {
    if (product.id === productId || !embedding) continue;

    const rawSim = cosineSimilarity(
      productEmbedding.embedding as number[],
      embedding as number[],
    );
    const similarity = rescaleCosine(rawSim);

    if (similarity > 0.35) {
      recommendations.push({
        product,
        score: similarity,
        reason: `${(similarity * 100).toFixed(0)}% similar`,
        sourceProductId: productId,
      });
    }
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get cold-start recommendations for new sessions.
 */
async function getColdStartRecommendations(
  limit: number,
  excludeProductIds: number[]
): Promise<RecommendationResult[]> {
  const featured = await getFeaturedProducts(limit + excludeProductIds.length);
  const excludeSet = new Set(excludeProductIds);

  const fromFeatured = featured
    .filter((p: Product) => !excludeSet.has(p.id))
    .slice(0, limit)
    .map((product: Product) => ({
      product,
      score: 1,
      reason: "Popular product",
    }));

  if (fromFeatured.length >= limit) return fromFeatured;

  // Top up with trending (most-interacted) if we don't have enough featured
  const topIds = await getTopInteractedProductIds(limit * 2);
  const topIdsFiltered = topIds.filter(
    (id: number) => !excludeSet.has(id) && !fromFeatured.some((f: { product: Product; score: number; reason: string }) => f.product.id === id),
  );
  if (topIdsFiltered.length === 0) return fromFeatured;

  const topProducts = await getProductsByIds(topIdsFiltered.slice(0, limit - fromFeatured.length));
  return [
    ...fromFeatured,
    ...topProducts.map((product: Product) => ({
      product,
      score: 0.8,
      reason: "Trending now",
    })),
  ];
}

/**
 * Get category-based recommendations as fallback.
 */
async function getCategoryBasedRecommendations(
  productId: number,
  limit: number
): Promise<RecommendationResult[]> {
  const products = await getProductsByIds([productId]);
  const product = products[0];

  if (!product?.category) {
    return getColdStartRecommendations(limit, [productId]);
  }

  const allProducts = await getProductsWithEmbeddings();

  return allProducts
    .filter((p: { product: Product; embedding: unknown }) =>
      p.product.id !== productId &&
      p.product.category === product.category
    )
    .slice(0, limit)
    .map(({ product: p }: { product: Product; embedding: unknown }) => ({
      product: p,
      score: 0.5,
      reason: `Same category: ${product.category}`,
      sourceProductId: productId,
    }));
}

/**
 * Generate human-readable reason for recommendation.
 */
function generateRecommendationReason(similarity: number, interactionType?: string): string {
  const reasons: string[] = [];

  if (similarity > 0.7) {
    reasons.push("Very similar to items you viewed");
  } else if (similarity > 0.5) {
    reasons.push("Similar to your interests");
  } else if (similarity > 0.35) {
    reasons.push("Related to your browsing");
  } else {
    reasons.push("You might like this");
  }

  if (interactionType === "purchase") {
    reasons[0] = "Based on your purchase";
  } else if (interactionType === "add_to_cart") {
    reasons[0] = "Similar to items in your cart";
  }

  return reasons[0];
}

/**
 * Get trending products based on recent interactions across all sessions.
 */
export async function getTrendingProducts(limit = 10): Promise<RecommendationResult[]> {
  const topIds = await getTopInteractedProductIds(limit * 2);

  if (topIds.length === 0) {
    const featured = await getFeaturedProducts(limit);
    return featured.map((product: Product, index: number) => ({
      product,
      score: 1 - (index * 0.05),
      reason: "Featured product",
    }));
  }

  const products = await getProductsByIds(topIds.slice(0, limit));
  const order = new Map(topIds.map((id, idx) => [id, idx]));
  products.sort((a: Product, b: Product) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return products.map((product: Product, index: number) => ({
    product,
    score: 1 - index * 0.05,
    reason: "Trending now",
  }));
}
