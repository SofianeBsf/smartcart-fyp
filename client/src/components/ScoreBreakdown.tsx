import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Star, 
  DollarSign, 
  Package, 
  Clock,
  Sparkles
} from "lucide-react";

// Support both local and AI service score formats
interface LocalScores {
  final: number;
  semantic: number;
  rating: number;
  price: number;
  stock: number;
  recency: number;
}

interface AIScores {
  semanticScore: number;
  ratingScore: number;
  priceScore: number;
  stockScore: number;
  recencyScore: number;
}

type Scores = LocalScores | AIScores;

interface ScoreBreakdownProps {
  scores?: Scores;
  matchedTerms?: string[];
}

// Normalize scores to a common format
function normalizeScores(scores?: Scores): LocalScores | null {
  if (!scores) return null;
  
  if ('semantic' in scores) {
    return scores as LocalScores;
  }
  
  // Convert AI service format to local format
  const aiScores = scores as AIScores;
  return {
    final: (aiScores.semanticScore * 0.5 + aiScores.ratingScore * 0.2 + 
            aiScores.priceScore * 0.15 + aiScores.stockScore * 0.1 + 
            aiScores.recencyScore * 0.05),
    semantic: aiScores.semanticScore,
    rating: aiScores.ratingScore,
    price: aiScores.priceScore,
    stock: aiScores.stockScore,
    recency: aiScores.recencyScore,
  };
}

export default function ScoreBreakdown({ scores, matchedTerms }: ScoreBreakdownProps) {
  const normalizedScores = normalizeScores(scores);
  
  if (!normalizedScores) {
    return (
      <div className="bg-muted/50 rounded-lg p-3 mt-2">
        <p className="text-xs text-muted-foreground">Score breakdown not available</p>
      </div>
    );
  }
  
  const scoreItems = [
    {
      label: "Semantic Match",
      value: normalizedScores.semantic,
      icon: Brain,
      color: "bg-purple-500",
      description: "How well the product matches your search intent",
    },
    {
      label: "Rating",
      value: normalizedScores.rating,
      icon: Star,
      color: "bg-yellow-500",
      description: "Product rating score (0-5 stars normalized)",
    },
    {
      label: "Price Value",
      value: normalizedScores.price,
      icon: DollarSign,
      color: "bg-green-500",
      description: "Price competitiveness (lower = better)",
    },
    {
      label: "Availability",
      value: normalizedScores.stock,
      icon: Package,
      color: "bg-blue-500",
      description: "Stock availability score",
    },
    {
      label: "Recency",
      value: normalizedScores.recency,
      icon: Clock,
      color: "bg-orange-500",
      description: "How recently the product was added",
    },
  ];

  return (
    <div className="bg-muted/50 rounded-lg p-3 mt-2 space-y-3">
      {/* Final Score */}
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Final Score</span>
        </div>
        <span className="font-bold text-primary">
          {(normalizedScores.final * 100).toFixed(1)}%
        </span>
      </div>

      {/* Individual Scores */}
      <div className="space-y-2">
        {scoreItems.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <item.icon className="w-3 h-3" />
                <span>{item.label}</span>
              </div>
              <span className="font-medium">{(item.value * 100).toFixed(0)}%</span>
            </div>
            <div className="score-bar">
              <div
                className={`score-bar-fill ${item.color}`}
                style={{ width: `${Math.min(100, item.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Matched Terms */}
      {matchedTerms && matchedTerms.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1.5">Matched Terms:</p>
          <div className="flex flex-wrap gap-1">
            {matchedTerms.map((term) => (
              <Badge key={term} variant="secondary" className="text-xs">
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Formula Reference */}
      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          Score = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency
        </p>
      </div>
    </div>
  );
}
