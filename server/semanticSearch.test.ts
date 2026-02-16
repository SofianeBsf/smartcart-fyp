import { describe, expect, it, vi, beforeEach } from "vitest";
import { cosineSimilarity } from "./semanticSearch";

describe("Semantic Search", () => {
  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      const vector = [0.5, 0.5, 0.5, 0.5];
      const similarity = cosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      const vectorA = [1, 0, 0, 0];
      const vectorB = [0, 1, 0, 0];
      const similarity = cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it("returns -1 for opposite vectors", () => {
      const vectorA = [1, 0, 0, 0];
      const vectorB = [-1, 0, 0, 0];
      const similarity = cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it("handles normalized vectors correctly", () => {
      // Two similar but not identical vectors
      const vectorA = [0.8, 0.6, 0, 0];
      const vectorB = [0.6, 0.8, 0, 0];
      const similarity = cosineSimilarity(vectorA, vectorB);
      // cos(θ) = (0.8*0.6 + 0.6*0.8) / (1 * 1) = 0.96
      expect(similarity).toBeCloseTo(0.96, 2);
    });

    it("returns 0 for mismatched vector dimensions", () => {
      const vectorA = [1, 0, 0];
      const vectorB = [1, 0, 0, 0];
      const similarity = cosineSimilarity(vectorA, vectorB);
      expect(similarity).toBe(0);
    });

    it("handles zero vectors gracefully", () => {
      const zeroVector = [0, 0, 0, 0];
      const normalVector = [1, 0, 0, 0];
      const similarity = cosineSimilarity(zeroVector, normalVector);
      expect(similarity).toBe(0);
    });

    it("calculates similarity for high-dimensional vectors", () => {
      // Simulate 384-dimensional vectors (like Sentence-BERT)
      const dim = 384;
      const vectorA = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1));
      const vectorB = Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1 + 0.1));
      
      const similarity = cosineSimilarity(vectorA, vectorB);
      // Similar vectors should have high similarity
      expect(similarity).toBeGreaterThan(0.9);
    });
  });

  describe("Score Normalization", () => {
    it("normalizes rating score correctly (0-5 to 0-1)", () => {
      const normalizeRating = (rating: number) => rating / 5;
      
      expect(normalizeRating(5)).toBe(1);
      expect(normalizeRating(4)).toBe(0.8);
      expect(normalizeRating(2.5)).toBe(0.5);
      expect(normalizeRating(0)).toBe(0);
    });

    it("normalizes price score correctly (inverse)", () => {
      const normalizePrice = (price: number, min: number, max: number) => {
        if (max === min) return 0.5;
        return 1 - ((price - min) / (max - min));
      };
      
      // Lower price = higher score
      expect(normalizePrice(10, 10, 100)).toBe(1);  // Lowest price
      expect(normalizePrice(100, 10, 100)).toBe(0); // Highest price
      expect(normalizePrice(55, 10, 100)).toBe(0.5); // Middle price
    });

    it("normalizes stock score correctly", () => {
      const normalizeStock = (availability: string) => {
        if (availability === "out_of_stock") return 0;
        if (availability === "low_stock") return 0.5;
        if (availability === "in_stock") return 1;
        return 0.5;
      };
      
      expect(normalizeStock("in_stock")).toBe(1);
      expect(normalizeStock("low_stock")).toBe(0.5);
      expect(normalizeStock("out_of_stock")).toBe(0);
    });
  });

  describe("Weighted Ranking Formula", () => {
    it("calculates final score with default weights", () => {
      const weights = {
        alpha: 0.5,   // Semantic
        beta: 0.2,    // Rating
        gamma: 0.15,  // Price
        delta: 0.1,   // Stock
        epsilon: 0.05 // Recency
      };

      const scores = {
        semantic: 0.8,
        rating: 0.9,
        price: 0.7,
        stock: 1.0,
        recency: 0.5
      };

      const finalScore = 
        weights.alpha * scores.semantic +
        weights.beta * scores.rating +
        weights.gamma * scores.price +
        weights.delta * scores.stock +
        weights.epsilon * scores.recency;

      // 0.5*0.8 + 0.2*0.9 + 0.15*0.7 + 0.1*1.0 + 0.05*0.5
      // = 0.4 + 0.18 + 0.105 + 0.1 + 0.025 = 0.81
      expect(finalScore).toBeCloseTo(0.81, 2);
    });

    it("weights sum to 1.0 for normalized scoring", () => {
      const weights = {
        alpha: 0.5,
        beta: 0.2,
        gamma: 0.15,
        delta: 0.1,
        epsilon: 0.05
      };

      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it("semantic weight dominates ranking", () => {
      const weights = { alpha: 0.5, beta: 0.2, gamma: 0.15, delta: 0.1, epsilon: 0.05 };

      // Product A: High semantic match, low rating
      const scoreA = weights.alpha * 0.9 + weights.beta * 0.3 + weights.gamma * 0.5 + weights.delta * 0.5 + weights.epsilon * 0.5;
      
      // Product B: Low semantic match, high rating
      const scoreB = weights.alpha * 0.3 + weights.beta * 1.0 + weights.gamma * 0.5 + weights.delta * 0.5 + weights.epsilon * 0.5;

      // Product A should rank higher due to semantic weight
      expect(scoreA).toBeGreaterThan(scoreB);
    });
  });

  describe("Matched Terms Extraction", () => {
    it("extracts matching terms from query and product text", () => {
      const extractMatchedTerms = (query: string, productText: string): string[] => {
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const productLower = productText.toLowerCase();
        return queryTerms.filter(term => productLower.includes(term));
      };

      const query = "wireless bluetooth headphones";
      const productText = "Sony WH-1000XM4 Wireless Bluetooth Noise Cancelling Headphones";
      
      const matched = extractMatchedTerms(query, productText);
      
      expect(matched).toContain("wireless");
      expect(matched).toContain("bluetooth");
      expect(matched).toContain("headphones");
    });

    it("filters out short terms (length <= 2)", () => {
      const extractMatchedTerms = (query: string, productText: string): string[] => {
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const productLower = productText.toLowerCase();
        return queryTerms.filter(term => productLower.includes(term));
      };

      const query = "a an the wireless";
      const productText = "Wireless Mouse";
      
      const matched = extractMatchedTerms(query, productText);
      
      expect(matched).toEqual(["wireless"]);
      expect(matched).not.toContain("a");
      expect(matched).not.toContain("an");
      expect(matched).not.toContain("the");
    });
  });
});
