import { describe, expect, it } from "vitest";
import {
  calculateNDCG,
  calculateRecall,
  calculatePrecision,
  calculateMRR,
  calculateAveragePrecision,
  calculateAllMetrics,
  generateAutoRelevanceJudgments,
  type RelevanceJudgment,
  type SearchResult,
} from "./irMetrics";

describe("IR Metrics", () => {
  // Test data
  const searchResults: SearchResult[] = [
    { productId: 1, position: 1, finalScore: 0.95 },
    { productId: 2, position: 2, finalScore: 0.90 },
    { productId: 3, position: 3, finalScore: 0.85 },
    { productId: 4, position: 4, finalScore: 0.80 },
    { productId: 5, position: 5, finalScore: 0.75 },
    { productId: 6, position: 6, finalScore: 0.70 },
    { productId: 7, position: 7, finalScore: 0.65 },
    { productId: 8, position: 8, finalScore: 0.60 },
    { productId: 9, position: 9, finalScore: 0.55 },
    { productId: 10, position: 10, finalScore: 0.50 },
  ];

  // Products 1, 3, 5, 7 are highly relevant (3)
  // Products 2, 4 are relevant (2)
  // Products 6, 8 are marginally relevant (1)
  // Products 9, 10 are not relevant (0)
  const relevanceJudgments: RelevanceJudgment[] = [
    { productId: 1, relevanceScore: 3 },
    { productId: 2, relevanceScore: 2 },
    { productId: 3, relevanceScore: 3 },
    { productId: 4, relevanceScore: 2 },
    { productId: 5, relevanceScore: 3 },
    { productId: 6, relevanceScore: 1 },
    { productId: 7, relevanceScore: 3 },
    { productId: 8, relevanceScore: 1 },
    { productId: 9, relevanceScore: 0 },
    { productId: 10, relevanceScore: 0 },
  ];

  describe("calculateNDCG", () => {
    it("returns 1.0 for perfect ranking", () => {
      // Results already in ideal order (highest relevance first)
      const perfectResults: SearchResult[] = [
        { productId: 1, position: 1, finalScore: 0.95 },
        { productId: 3, position: 2, finalScore: 0.90 },
        { productId: 5, position: 3, finalScore: 0.85 },
        { productId: 7, position: 4, finalScore: 0.80 },
        { productId: 2, position: 5, finalScore: 0.75 },
        { productId: 4, position: 6, finalScore: 0.70 },
        { productId: 6, position: 7, finalScore: 0.65 },
        { productId: 8, position: 8, finalScore: 0.60 },
        { productId: 9, position: 9, finalScore: 0.55 },
        { productId: 10, position: 10, finalScore: 0.50 },
      ];

      const ndcg = calculateNDCG(perfectResults, relevanceJudgments, 10);
      expect(ndcg).toBeCloseTo(1.0, 2);
    });

    it("returns value between 0 and 1 for mixed ranking", () => {
      const ndcg = calculateNDCG(searchResults, relevanceJudgments, 10);
      expect(ndcg).toBeGreaterThan(0);
      expect(ndcg).toBeLessThanOrEqual(1);
    });

    it("returns 0 when no relevant items exist", () => {
      const noRelevantJudgments: RelevanceJudgment[] = [
        { productId: 1, relevanceScore: 0 },
        { productId: 2, relevanceScore: 0 },
      ];
      const ndcg = calculateNDCG(searchResults, noRelevantJudgments, 10);
      expect(ndcg).toBe(0);
    });

    it("respects k parameter", () => {
      const ndcg5 = calculateNDCG(searchResults, relevanceJudgments, 5);
      const ndcg10 = calculateNDCG(searchResults, relevanceJudgments, 10);
      // Both should be valid scores
      expect(ndcg5).toBeGreaterThan(0);
      expect(ndcg10).toBeGreaterThan(0);
    });
  });

  describe("calculateRecall", () => {
    it("returns 1.0 when all relevant items are retrieved", () => {
      // 8 items are relevant (score >= 1)
      const recall = calculateRecall(searchResults, relevanceJudgments, 10);
      expect(recall).toBe(1.0); // All 8 relevant items are in top 10
    });

    it("returns correct fraction for partial retrieval", () => {
      const recall = calculateRecall(searchResults, relevanceJudgments, 5);
      // In top 5: products 1,2,3,4,5 - all have relevance >= 1
      // Total relevant: 8 (products 1-8)
      expect(recall).toBe(5 / 8);
    });

    it("returns 0 when no relevant items exist", () => {
      const noRelevantJudgments: RelevanceJudgment[] = [
        { productId: 1, relevanceScore: 0 },
      ];
      const recall = calculateRecall(searchResults, noRelevantJudgments, 10);
      expect(recall).toBe(0);
    });
  });

  describe("calculatePrecision", () => {
    it("returns correct precision for top k results", () => {
      // In top 10: 8 relevant items out of 10
      const precision = calculatePrecision(searchResults, relevanceJudgments, 10);
      expect(precision).toBe(0.8);
    });

    it("returns 1.0 when all top k are relevant", () => {
      const precision = calculatePrecision(searchResults, relevanceJudgments, 5);
      // Top 5 are all relevant (products 1-5 have relevance >= 1)
      expect(precision).toBe(1.0);
    });
  });

  describe("calculateMRR", () => {
    it("returns 1.0 when first result is relevant", () => {
      const mrr = calculateMRR(searchResults, relevanceJudgments);
      expect(mrr).toBe(1.0); // Product 1 is relevant and at position 1
    });

    it("returns 0.5 when first relevant is at position 2", () => {
      const resultsWithIrrelevantFirst: SearchResult[] = [
        { productId: 9, position: 1, finalScore: 0.95 }, // Not relevant
        { productId: 1, position: 2, finalScore: 0.90 }, // Relevant
      ];
      const mrr = calculateMRR(resultsWithIrrelevantFirst, relevanceJudgments);
      expect(mrr).toBe(0.5);
    });

    it("returns 0 when no relevant items in results", () => {
      const irrelevantResults: SearchResult[] = [
        { productId: 9, position: 1, finalScore: 0.95 },
        { productId: 10, position: 2, finalScore: 0.90 },
      ];
      const mrr = calculateMRR(irrelevantResults, relevanceJudgments);
      expect(mrr).toBe(0);
    });
  });

  describe("calculateAveragePrecision", () => {
    it("returns value between 0 and 1", () => {
      const ap = calculateAveragePrecision(searchResults, relevanceJudgments);
      expect(ap).toBeGreaterThan(0);
      expect(ap).toBeLessThanOrEqual(1);
    });

    it("returns 0 when no relevant items exist", () => {
      const noRelevantJudgments: RelevanceJudgment[] = [
        { productId: 1, relevanceScore: 0 },
      ];
      const ap = calculateAveragePrecision(searchResults, noRelevantJudgments);
      expect(ap).toBe(0);
    });
  });

  describe("calculateAllMetrics", () => {
    it("returns all metrics in a single call", () => {
      const metrics = calculateAllMetrics(searchResults, relevanceJudgments, 10);
      
      expect(metrics).toHaveProperty("ndcg");
      expect(metrics).toHaveProperty("recall");
      expect(metrics).toHaveProperty("precision");
      expect(metrics).toHaveProperty("mrr");
      expect(metrics).toHaveProperty("averagePrecision");
      
      expect(metrics.ndcg).toBeGreaterThan(0);
      expect(metrics.recall).toBe(1.0);
      expect(metrics.precision).toBe(0.8);
      expect(metrics.mrr).toBe(1.0);
    });
  });

  describe("generateAutoRelevanceJudgments", () => {
    const products = [
      { id: 1, title: "Sony Wireless Headphones", description: "Noise cancelling", category: "Electronics" },
      { id: 2, title: "Logitech Mouse", description: "Wireless gaming mouse", category: "Electronics" },
      { id: 3, title: "Running Shoes", description: "Nike athletic shoes", category: "Sports" },
    ];

    it("assigns high relevance to exact matches", () => {
      const judgments = generateAutoRelevanceJudgments("wireless headphones", products);
      
      const sonyJudgment = judgments.find(j => j.productId === 1);
      expect(sonyJudgment?.relevanceScore).toBeGreaterThanOrEqual(2);
    });

    it("assigns lower relevance to partial matches", () => {
      const judgments = generateAutoRelevanceJudgments("wireless headphones", products);
      
      const mouseJudgment = judgments.find(j => j.productId === 2);
      // Mouse has "wireless" but not "headphones"
      expect(mouseJudgment?.relevanceScore).toBeLessThan(3);
    });

    it("assigns zero relevance to non-matches", () => {
      const judgments = generateAutoRelevanceJudgments("wireless headphones", products);
      
      const shoesJudgment = judgments.find(j => j.productId === 3);
      expect(shoesJudgment?.relevanceScore).toBe(0);
    });
  });
});
