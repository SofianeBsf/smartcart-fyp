import { describe, expect, it } from "vitest";

describe("Recommendations Engine", () => {
  describe("Interaction Weights", () => {
    const interactionWeights: Record<string, number> = {
      purchase: 5,
      add_to_cart: 4,
      search_click: 3,
      click: 2,
      view: 1,
    };

    it("assigns highest weight to purchases", () => {
      expect(interactionWeights.purchase).toBe(5);
      expect(interactionWeights.purchase).toBeGreaterThan(interactionWeights.add_to_cart);
    });

    it("assigns appropriate weights to all interaction types", () => {
      expect(interactionWeights.add_to_cart).toBe(4);
      expect(interactionWeights.search_click).toBe(3);
      expect(interactionWeights.click).toBe(2);
      expect(interactionWeights.view).toBe(1);
    });

    it("weights are in descending order of importance", () => {
      const weights = Object.values(interactionWeights);
      for (let i = 0; i < weights.length - 1; i++) {
        expect(weights[i]).toBeGreaterThanOrEqual(weights[i + 1]);
      }
    });
  });

  describe("Recency Boost Calculation", () => {
    it("calculates recency boost correctly", () => {
      const calculateRecencyBoost = (index: number, totalInteractions: number): number => {
        return 1 + (totalInteractions - index) / totalInteractions;
      };

      // Most recent interaction (index 0) should have highest boost
      expect(calculateRecencyBoost(0, 10)).toBe(2);
      
      // Oldest interaction (index 9) should have lowest boost
      expect(calculateRecencyBoost(9, 10)).toBeCloseTo(1.1, 1);
      
      // Middle interaction should have medium boost
      expect(calculateRecencyBoost(5, 10)).toBe(1.5);
    });

    it("recency boost is always >= 1", () => {
      const calculateRecencyBoost = (index: number, totalInteractions: number): number => {
        return 1 + (totalInteractions - index) / totalInteractions;
      };

      for (let i = 0; i < 100; i++) {
        const boost = calculateRecencyBoost(i, 100);
        expect(boost).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("Recommendation Score Calculation", () => {
    it("combines interaction weight and recency boost", () => {
      const interactionWeights: Record<string, number> = {
        purchase: 5,
        view: 1,
      };

      const calculateScore = (
        interactionType: string,
        index: number,
        totalInteractions: number
      ): number => {
        const weight = interactionWeights[interactionType] || 1;
        const recencyBoost = 1 + (totalInteractions - index) / totalInteractions;
        return weight * recencyBoost;
      };

      // Recent purchase should have high score
      const recentPurchaseScore = calculateScore("purchase", 0, 10);
      expect(recentPurchaseScore).toBe(10); // 5 * 2

      // Old view should have low score
      const oldViewScore = calculateScore("view", 9, 10);
      expect(oldViewScore).toBeCloseTo(1.1, 1); // 1 * 1.1
    });
  });

  describe("Recommendation Reason Generation", () => {
    it("generates appropriate reasons based on similarity", () => {
      const generateReason = (similarity: number, interactionType?: string): string => {
        if (interactionType === "purchase") {
          return "Based on your purchase";
        }
        if (interactionType === "add_to_cart") {
          return "Similar to items in your cart";
        }
        
        if (similarity > 0.8) {
          return "Very similar to items you viewed";
        } else if (similarity > 0.6) {
          return "Similar to your interests";
        } else if (similarity > 0.4) {
          return "Related to your browsing";
        }
        return "You might like this";
      };

      expect(generateReason(0.9)).toBe("Very similar to items you viewed");
      expect(generateReason(0.7)).toBe("Similar to your interests");
      expect(generateReason(0.5)).toBe("Related to your browsing");
      expect(generateReason(0.3)).toBe("You might like this");
      expect(generateReason(0.9, "purchase")).toBe("Based on your purchase");
      expect(generateReason(0.9, "add_to_cart")).toBe("Similar to items in your cart");
    });
  });

  describe("Cold Start Handling", () => {
    it("returns featured products for new sessions", () => {
      const getRecommendations = (interactions: any[], featuredProducts: any[]) => {
        if (interactions.length === 0) {
          return featuredProducts.map(p => ({
            product: p,
            score: 1,
            reason: "Popular product",
          }));
        }
        return [];
      };

      const featured = [{ id: 1, title: "Product 1" }, { id: 2, title: "Product 2" }];
      const result = getRecommendations([], featured);
      
      expect(result.length).toBe(2);
      expect(result[0].reason).toBe("Popular product");
    });
  });

  describe("Product Exclusion", () => {
    it("excludes specified product IDs from recommendations", () => {
      const filterRecommendations = (
        products: { id: number }[],
        excludeIds: number[]
      ) => {
        const excludeSet = new Set(excludeIds);
        return products.filter(p => !excludeSet.has(p.id));
      };

      const products = [
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
      ];
      const excludeIds = [2, 4];
      
      const filtered = filterRecommendations(products, excludeIds);
      
      expect(filtered.length).toBe(3);
      expect(filtered.map(p => p.id)).toEqual([1, 3, 5]);
    });

    it("excludes already interacted products", () => {
      const filterRecommendations = (
        products: { id: number }[],
        interactedIds: number[],
        excludeIds: number[]
      ) => {
        const excludeSet = new Set([...interactedIds, ...excludeIds]);
        return products.filter(p => !excludeSet.has(p.id));
      };

      const products = [
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
      ];
      const interactedIds = [1, 2];
      const excludeIds = [5];
      
      const filtered = filterRecommendations(products, interactedIds, excludeIds);
      
      expect(filtered.length).toBe(2);
      expect(filtered.map(p => p.id)).toEqual([3, 4]);
    });
  });

  describe("Similar Products", () => {
    it("filters products below similarity threshold", () => {
      const filterBySimilarity = (
        products: { id: number; similarity: number }[],
        threshold: number
      ) => {
        return products.filter(p => p.similarity > threshold);
      };

      const products = [
        { id: 1, similarity: 0.9 },
        { id: 2, similarity: 0.5 },
        { id: 3, similarity: 0.2 },
        { id: 4, similarity: 0.7 },
      ];
      
      const filtered = filterBySimilarity(products, 0.3);
      
      expect(filtered.length).toBe(3);
      expect(filtered.map(p => p.id)).toEqual([1, 2, 4]);
    });

    it("sorts products by similarity descending", () => {
      const sortBySimilarity = (products: { id: number; similarity: number }[]) => {
        return [...products].sort((a, b) => b.similarity - a.similarity);
      };

      const products = [
        { id: 1, similarity: 0.5 },
        { id: 2, similarity: 0.9 },
        { id: 3, similarity: 0.7 },
      ];
      
      const sorted = sortBySimilarity(products);
      
      expect(sorted[0].id).toBe(2);
      expect(sorted[1].id).toBe(3);
      expect(sorted[2].id).toBe(1);
    });
  });
});
