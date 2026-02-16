import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search as SearchIcon,
  Filter,
  ChevronDown,
  Clock,
  Sparkles,
  Info,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import ProductCard from "@/components/ProductCard";
import ScoreBreakdown from "@/components/ScoreBreakdown";

export default function Search() {
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  
  // Parse URL params
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams]);
  const initialQuery = urlParams.get("q") || "";
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [category, setCategory] = useState<string>("");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("relevance");

  // Fetch categories
  const { data: categories } = trpc.products.categories.useQuery();

  // Semantic search query
  const { 
    data: searchResults, 
    isLoading, 
    isFetching 
  } = trpc.search.semantic.useQuery(
    {
      query: submittedQuery,
      limit: 24,
      category: category || undefined,
      minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
      maxPrice: priceRange[1] < 1000 ? priceRange[1] : undefined,
      inStockOnly,
    },
    {
      enabled: submittedQuery.length > 0,
    }
  );

  // Update URL when search is submitted
  useEffect(() => {
    if (submittedQuery) {
      const params = new URLSearchParams();
      params.set("q", submittedQuery);
      if (category) params.set("category", category);
      if (inStockOnly) params.set("inStock", "true");
      setLocation(`/search?${params.toString()}`, { replace: true });
    }
  }, [submittedQuery, category, inStockOnly, setLocation]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSubmittedQuery(searchQuery.trim());
    }
  };

  const clearFilters = () => {
    setCategory("");
    setPriceRange([0, 1000]);
    setInStockOnly(false);
    setSortBy("relevance");
  };

  // Sort results
  const sortedResults = useMemo(() => {
    if (!searchResults?.results) return [];
    
    const results = [...searchResults.results];
    
    switch (sortBy) {
      case "price-low":
        return results.sort((a, b) => 
          (parseFloat(a.product.price || "0") - parseFloat(b.product.price || "0"))
        );
      case "price-high":
        return results.sort((a, b) => 
          (parseFloat(b.product.price || "0") - parseFloat(a.product.price || "0"))
        );
      case "rating":
        return results.sort((a, b) => 
          (parseFloat(b.product.rating || "0") - parseFloat(a.product.rating || "0"))
        );
      case "relevance":
      default:
        return results; // Already sorted by relevance
    }
  }, [searchResults?.results, sortBy]);

  const hasActiveFilters = category || priceRange[0] > 0 || priceRange[1] < 1000 || inStockOnly;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-6">
        {/* Search Header */}
        <div className="mb-6">
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search with natural language..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={isFetching}>
              {isFetching ? "Searching..." : "Search"}
            </Button>
          </form>

          {/* Search Info */}
          {searchResults && submittedQuery && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                Found <strong className="text-foreground">{searchResults.results.length}</strong> results 
                for "<strong className="text-foreground">{searchResults.query}</strong>"
              </span>
              <Badge variant="outline" className="gap-1">
                <Clock className="w-3 h-3" />
                {searchResults.responseTimeMs}ms
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="w-3 h-3" />
                Semantic Search
              </Badge>
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* Filters Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                  </CardTitle>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Category Filter */}
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category || "all"} onValueChange={(val) => setCategory(val === "all" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Range */}
                <div className="space-y-3">
                  <Label>Price Range</Label>
                  <Slider
                    value={priceRange}
                    onValueChange={(value) => setPriceRange(value as [number, number])}
                    min={0}
                    max={1000}
                    step={10}
                  />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>£{priceRange[0]}</span>
                    <span>£{priceRange[1]}{priceRange[1] >= 1000 ? "+" : ""}</span>
                  </div>
                </div>

                {/* In Stock Only */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="in-stock">In Stock Only</Label>
                  <Switch
                    id="in-stock"
                    checked={inStockOnly}
                    onCheckedChange={setInStockOnly}
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <Label>Sort By</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="price-low">Price: Low to High</SelectItem>
                      <SelectItem value="price-high">Price: High to Low</SelectItem>
                      <SelectItem value="rating">Highest Rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Explainability Info */}
            <Card className="mt-4">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium mb-1">Explainable AI</p>
                    <p className="text-muted-foreground">
                      Each result shows why it was suggested. Click on a product to see the full score breakdown.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Mobile Filter Toggle */}
          <div className="lg:hidden fixed bottom-4 right-4 z-50">
            <Button
              size="lg"
              className="rounded-full shadow-lg"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Button>
          </div>

          {/* Results Grid */}
          <main className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-square" />
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2 mb-2" />
                      <Skeleton className="h-6 w-1/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedResults.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {sortedResults.map((result) => (
                  <div key={result.product.id} className="animate-fade-in">
                    <ProductCard
                      product={result.product}
                      showExplanation
                      explanation={result.explanation}
                      position={'rank' in result ? result.rank : ('position' in result ? result.position : 0)}
                    />
                    
                    {/* Score Breakdown (Collapsible) */}
                    <Collapsible className="mt-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full text-xs">
                          <ChevronDown className="w-3 h-3 mr-1" />
                          View Score Breakdown
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ScoreBreakdown 
                          scores={'scoreBreakdown' in result ? result.scoreBreakdown : ('scores' in result ? {
                            semanticScore: result.scores.semantic,
                            ratingScore: result.scores.rating,
                            priceScore: result.scores.price,
                            stockScore: result.scores.stock,
                            recencyScore: result.scores.recency,
                          } : undefined)} 
                          matchedTerms={result.matchedTerms} 
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
              </div>
            ) : submittedQuery ? (
              <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <SearchIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-muted-foreground mb-4">
                    We couldn't find any products matching "{submittedQuery}". 
                    Try adjusting your search or filters.
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
                  <p className="text-muted-foreground">
                    Enter a natural language query to discover products. 
                    Try something like "wireless headphones with good bass" or "comfortable office chair under £200".
                  </p>
                </div>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
