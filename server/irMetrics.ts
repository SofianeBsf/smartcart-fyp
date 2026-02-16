/**
 * Information Retrieval Metrics Module
 * 
 * Implements standard IR evaluation metrics for search quality assessment:
 * - nDCG@k (Normalized Discounted Cumulative Gain)
 * - Recall@k
 * - Precision@k
 * - MRR (Mean Reciprocal Rank)
 * 
 * These metrics are used to evaluate the quality of the semantic search
 * and ranking system in SmartCart.
 */

export interface RelevanceJudgment {
  productId: number;
  relevanceScore: number; // 0-3 scale: 0=not relevant, 1=marginally, 2=relevant, 3=highly relevant
}

export interface SearchResult {
  productId: number;
  position: number;
  finalScore: number;
}

export interface IRMetricsResult {
  ndcg: number;
  recall: number;
  precision: number;
  mrr: number;
  averagePrecision: number;
}

/**
 * Calculate Discounted Cumulative Gain at position k
 * DCG@k = Σ(i=1 to k) (2^rel_i - 1) / log2(i + 1)
 */
function calculateDCG(relevanceScores: number[], k: number): number {
  let dcg = 0;
  const limit = Math.min(k, relevanceScores.length);
  
  for (let i = 0; i < limit; i++) {
    const rel = relevanceScores[i] || 0;
    const gain = Math.pow(2, rel) - 1;
    const discount = Math.log2(i + 2); // i+2 because i is 0-indexed
    dcg += gain / discount;
  }
  
  return dcg;
}

/**
 * Calculate Ideal DCG (best possible ranking)
 */
function calculateIDCG(relevanceScores: number[], k: number): number {
  // Sort relevance scores in descending order for ideal ranking
  const sortedScores = [...relevanceScores].sort((a, b) => b - a);
  return calculateDCG(sortedScores, k);
}

/**
 * Calculate nDCG@k (Normalized Discounted Cumulative Gain)
 * 
 * nDCG@k = DCG@k / IDCG@k
 * 
 * This metric measures the quality of ranking, accounting for:
 * - Position of relevant items (higher positions are better)
 * - Degree of relevance (more relevant items should rank higher)
 * 
 * @param results - Search results with product IDs and positions
 * @param judgments - Relevance judgments for products
 * @param k - Cutoff position (default 10)
 * @returns nDCG score between 0 and 1
 */
export function calculateNDCG(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  k: number = 10
): number {
  // Create a map of product ID to relevance score
  const relevanceMap = new Map<number, number>();
  judgments.forEach(j => relevanceMap.set(j.productId, j.relevanceScore));
  
  // Get relevance scores in result order
  const resultRelevances = results
    .slice(0, k)
    .map(r => relevanceMap.get(r.productId) || 0);
  
  // Get all relevance scores for IDCG calculation
  const allRelevances = judgments.map(j => j.relevanceScore);
  
  const dcg = calculateDCG(resultRelevances, k);
  const idcg = calculateIDCG(allRelevances, k);
  
  // Avoid division by zero
  if (idcg === 0) return 0;
  
  return dcg / idcg;
}

/**
 * Calculate Recall@k
 * 
 * Recall@k = |Relevant items in top k| / |Total relevant items|
 * 
 * This metric measures what fraction of relevant items were retrieved
 * in the top k results.
 * 
 * @param results - Search results with product IDs
 * @param judgments - Relevance judgments (items with score > 0 are considered relevant)
 * @param k - Cutoff position (default 10)
 * @param relevanceThreshold - Minimum score to consider relevant (default 1)
 * @returns Recall score between 0 and 1
 */
export function calculateRecall(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  k: number = 10,
  relevanceThreshold: number = 1
): number {
  // Get relevant items (score >= threshold)
  const relevantItems = new Set(
    judgments
      .filter(j => j.relevanceScore >= relevanceThreshold)
      .map(j => j.productId)
  );
  
  if (relevantItems.size === 0) return 0;
  
  // Count relevant items in top k results
  const topKResults = results.slice(0, k);
  const retrievedRelevant = topKResults.filter(r => relevantItems.has(r.productId)).length;
  
  return retrievedRelevant / relevantItems.size;
}

/**
 * Calculate Precision@k
 * 
 * Precision@k = |Relevant items in top k| / k
 * 
 * This metric measures what fraction of retrieved items are relevant.
 * 
 * @param results - Search results with product IDs
 * @param judgments - Relevance judgments
 * @param k - Cutoff position (default 10)
 * @param relevanceThreshold - Minimum score to consider relevant (default 1)
 * @returns Precision score between 0 and 1
 */
export function calculatePrecision(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  k: number = 10,
  relevanceThreshold: number = 1
): number {
  const relevantItems = new Set(
    judgments
      .filter(j => j.relevanceScore >= relevanceThreshold)
      .map(j => j.productId)
  );
  
  const topKResults = results.slice(0, k);
  const actualK = Math.min(k, topKResults.length);
  
  if (actualK === 0) return 0;
  
  const retrievedRelevant = topKResults.filter(r => relevantItems.has(r.productId)).length;
  
  return retrievedRelevant / actualK;
}

/**
 * Calculate Mean Reciprocal Rank (MRR)
 * 
 * MRR = 1 / rank of first relevant item
 * 
 * This metric measures how quickly the first relevant result appears.
 * 
 * @param results - Search results with product IDs
 * @param judgments - Relevance judgments
 * @param relevanceThreshold - Minimum score to consider relevant (default 1)
 * @returns MRR score between 0 and 1
 */
export function calculateMRR(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  relevanceThreshold: number = 1
): number {
  const relevantItems = new Set(
    judgments
      .filter(j => j.relevanceScore >= relevanceThreshold)
      .map(j => j.productId)
  );
  
  for (let i = 0; i < results.length; i++) {
    if (relevantItems.has(results[i].productId)) {
      return 1 / (i + 1);
    }
  }
  
  return 0;
}

/**
 * Calculate Average Precision (AP)
 * 
 * AP = (1/R) × Σ(k=1 to n) P(k) × rel(k)
 * 
 * Where R is total relevant items, P(k) is precision at k,
 * and rel(k) is 1 if item at k is relevant, 0 otherwise.
 * 
 * @param results - Search results with product IDs
 * @param judgments - Relevance judgments
 * @param relevanceThreshold - Minimum score to consider relevant (default 1)
 * @returns AP score between 0 and 1
 */
export function calculateAveragePrecision(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  relevanceThreshold: number = 1
): number {
  const relevantItems = new Set(
    judgments
      .filter(j => j.relevanceScore >= relevanceThreshold)
      .map(j => j.productId)
  );
  
  if (relevantItems.size === 0) return 0;
  
  let sumPrecision = 0;
  let relevantCount = 0;
  
  for (let i = 0; i < results.length; i++) {
    if (relevantItems.has(results[i].productId)) {
      relevantCount++;
      sumPrecision += relevantCount / (i + 1);
    }
  }
  
  return sumPrecision / relevantItems.size;
}

/**
 * Calculate all IR metrics at once
 * 
 * @param results - Search results
 * @param judgments - Relevance judgments
 * @param k - Cutoff position for nDCG, Recall, Precision
 * @returns Object containing all metrics
 */
export function calculateAllMetrics(
  results: SearchResult[],
  judgments: RelevanceJudgment[],
  k: number = 10
): IRMetricsResult {
  return {
    ndcg: calculateNDCG(results, judgments, k),
    recall: calculateRecall(results, judgments, k),
    precision: calculatePrecision(results, judgments, k),
    mrr: calculateMRR(results, judgments),
    averagePrecision: calculateAveragePrecision(results, judgments),
  };
}

/**
 * Generate automatic relevance judgments based on keyword matching
 * 
 * This is used for automated evaluation when human judgments aren't available.
 * Products are scored based on how well they match the query terms.
 * 
 * @param query - Search query
 * @param products - Array of products with title, description, category
 * @returns Array of relevance judgments
 */
export function generateAutoRelevanceJudgments(
  query: string,
  products: Array<{ id: number; title: string; description?: string | null; category?: string | null }>
): RelevanceJudgment[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  return products.map(product => {
    const productText = `${product.title} ${product.description || ''} ${product.category || ''}`.toLowerCase();
    
    // Count matching terms
    let matchCount = 0;
    let exactTitleMatch = false;
    
    for (const term of queryTerms) {
      if (productText.includes(term)) {
        matchCount++;
      }
      if (product.title.toLowerCase().includes(term)) {
        exactTitleMatch = true;
      }
    }
    
    // Calculate relevance score (0-3)
    let relevanceScore = 0;
    
    if (queryTerms.length > 0) {
      const matchRatio = matchCount / queryTerms.length;
      
      if (matchRatio >= 0.8 && exactTitleMatch) {
        relevanceScore = 3; // Highly relevant
      } else if (matchRatio >= 0.5 || exactTitleMatch) {
        relevanceScore = 2; // Relevant
      } else if (matchRatio > 0) {
        relevanceScore = 1; // Marginally relevant
      }
    }
    
    return {
      productId: product.id,
      relevanceScore,
    };
  });
}

/**
 * Evaluate a search query using automatic relevance judgments
 * 
 * @param query - Search query
 * @param results - Search results
 * @param allProducts - All products for generating judgments
 * @param k - Cutoff position
 * @returns IR metrics
 */
export function evaluateSearchQuery(
  query: string,
  results: SearchResult[],
  allProducts: Array<{ id: number; title: string; description?: string | null; category?: string | null }>,
  k: number = 10
): IRMetricsResult {
  const judgments = generateAutoRelevanceJudgments(query, allProducts);
  return calculateAllMetrics(results, judgments, k);
}
