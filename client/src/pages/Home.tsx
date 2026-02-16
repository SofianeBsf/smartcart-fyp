import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Sparkles, 
  Brain, 
  Zap, 
  ShieldCheck, 
  ArrowRight,
  Star,
  TrendingUp
} from "lucide-react";
import Header from "@/components/Header";
import ProductCard from "@/components/ProductCard";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: featuredProducts, isLoading: featuredLoading } = trpc.products.featured.useQuery({ limit: 8 });
  const { data: trendingProducts, isLoading: trendingLoading } = trpc.recommendations.trending.useQuery({ limit: 6 });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="gradient-hero py-16 md:py-24">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="w-3 h-3 mr-1" />
              AI-Powered Search
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Discover Products with{" "}
              <span className="text-primary">Intelligent Search</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              SmartCart understands what you're looking for. Search naturally, get explainable results, 
              and find exactly what you need.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Try: 'quiet wireless mouse under £40' or 'comfortable running shoes'"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-4 h-14 text-lg rounded-xl border-2 focus:border-primary"
                  />
                </div>
                <Button type="submit" size="lg" className="h-14 px-8 rounded-xl">
                  Search
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </form>

            {/* Quick Search Suggestions */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="text-sm text-muted-foreground">Try:</span>
              {["wireless headphones", "gaming laptop", "smart watch", "coffee maker"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setSearchQuery(suggestion);
                    setLocation(`/search?q=${encodeURIComponent(suggestion)}`);
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 border-b">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Semantic Understanding</h3>
                <p className="text-muted-foreground">
                  Our AI understands the meaning behind your search, not just keywords. 
                  "Quiet" and "silent" mean the same thing to SmartCart.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Explainable Results</h3>
                <p className="text-muted-foreground">
                  Every result comes with a "Why Suggested?" explanation, showing you exactly 
                  why each product matches your search.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Smart Recommendations</h3>
                <p className="text-muted-foreground">
                  Get personalized suggestions based on your browsing session, 
                  no account required. Your privacy is protected.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="py-16">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Star className="w-6 h-6 text-primary" />
                Featured Products
              </h2>
              <p className="text-muted-foreground mt-1">
                Hand-picked products with top ratings
              </p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/search")}>
              View All
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          {featuredLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square" />
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : featuredProducts && featuredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">
                No featured products yet. Add products through the admin dashboard.
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* Trending Section */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-primary" />
                Trending Now
              </h2>
              <p className="text-muted-foreground mt-1">
                Popular products based on recent activity
              </p>
            </div>
          </div>

          {trendingLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square" />
                  <CardContent className="p-3">
                    <Skeleton className="h-3 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : trendingProducts && trendingProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {trendingProducts.map((item) => (
                <ProductCard key={item.product.id} product={item.product} compact />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                No trending products yet. Browse and interact with products to see trends.
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold">SmartCart</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Final Year Project - Explainable Semantic Search & Recommendations
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
