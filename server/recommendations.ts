import { 
  getSessionInteractions, 
  getProductsByIds, 
  getProductsWithEmbeddings,
  getEmbeddingByProductId,
  getFeaturedProducts
} from "./db";
import { cosineSimilarity } from "./semanticSearch";
import type { Product } from "../drizzle/schema";

export interface RecommendationResult {
  product: Product;
  score: number;
  reason: string;
  sourceProductId?: number;
}

/**
 * Get session-based recommendations ("You may also like").
 * Uses recent user interactions to find similar products.
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
    search_click: 3,
    click: 2,
    view: 1,
  };

  // Calculate product scores based on interactions
  const productScores = new Map<number, { score: number; type: string }>();
  
  interactions.forEach((interaction, index) => {
    const weight = interactionWeights[interaction.interactionType] || 1;
    const recencyBoost = 1 + (interactions.length - index) / interactions.length;
    const score = weight * recencyBoost;
    
    const existing = productScores.get(interaction.productId);
    if (!existing || existing.score < score) {
      productScores.set(interaction.productId, { 
        score, 
        type: interaction.interactionType 
      });
    }
  });

  // Get embeddings for interacted products
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

  if (interactedEmbeddings.length === 0) {
    return getColdStartRecommendations(limit, excludeProductIds);
  }

  // Get all products with embeddings
  const allProducts = await getProductsWithEmbeddings();
  
  // Calculate similarity scores for all products
  const recommendations: RecommendationResult[] = [];
  const excludeSet = new Set([...excludeProductIds, ...interactedProductIds]);

  for (const { product, embedding } of allProducts) {
    if (excludeSet.has(product.id) || !embedding) continue;

    // Calculate weighted similarity to interacted products
    let totalScore = 0;
    let bestMatch = { productId: 0, similarity: 0 };

    for (const interacted of interactedEmbeddings) {
      const similarity = cosineSimilarity(embedding as number[], interacted.embedding);
      const weightedSimilarity = similarity * interacted.score;
      totalScore += weightedSimilarity;

      if (similarity > bestMatch.similarity) {
        bestMatch = { productId: interacted.productId, similarity };
      }
    }

    // Normalize by number of interacted products
    const avgScore = totalScore / interactedEmbeddings.length;

    if (avgScore > 0.1) {
      recommendations.push({
        product,
        score: avgScore,
        reason: generateRecommendationReason(bestMatch.similarity, productScores.get(bestMatch.productId)?.type),
        sourceProductId: bestMatch.productId,
      });
    }
  }

  // Sort by score and return top results
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

    const similarity = cosineSimilarity(
      productEmbedding.embedding as number[],
      embedding as number[]
    );

    if (similarity > 0.3) {
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
  
  return featured
    .filter(p => !excludeSet.has(p.id))
    .slice(0, limit)
    .map(product => ({
      product,
      score: 1,
      reason: "Popular product",
    }));
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
    .filter(p => 
      p.product.id !== productId && 
      p.product.category === product.category
    )
    .slice(0, limit)
    .map(({ product: p }) => ({
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

  if (similarity > 0.8) {
    reasons.push("Very similar to items you viewed");
  } else if (similarity > 0.6) {
    reasons.push("Similar to your interests");
  } else if (similarity > 0.4) {
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
  // For now, return featured products
  // In production, this would aggregate recent interactions
  const featured = await getFeaturedProducts(limit);
  
  return featured.map((product, index) => ({
    product,
    score: 1 - (index * 0.05),
    reason: "Trending now",
  }));
}
