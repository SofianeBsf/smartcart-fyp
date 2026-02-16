import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Star,
  Package,
  ShoppingCart,
  Heart,
  Share2,
  Check,
  AlertTriangle,
  XCircle,
  Sparkles,
} from "lucide-react";
import Header from "@/components/Header";
import ProductCard from "@/components/ProductCard";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = parseInt(id || "0", 10);

  // Fetch product details
  const { data: product, isLoading: productLoading } = trpc.products.getById.useQuery(
    { id: productId },
    { enabled: productId > 0 }
  );

  // Fetch similar products
  const { data: similarProducts, isLoading: similarLoading } = trpc.recommendations.similar.useQuery(
    { productId, limit: 6 },
    { enabled: productId > 0 }
  );

  // Fetch session recommendations
  const { data: sessionRecs } = trpc.recommendations.forSession.useQuery(
    { limit: 4, excludeProductIds: [productId] },
    { enabled: productId > 0 }
  );

  // Record view interaction
  const recordInteraction = trpc.session.recordInteraction.useMutation();

  useEffect(() => {
    if (productId > 0) {
      recordInteraction.mutate({
        productId,
        interactionType: "view",
      });
    }
  }, [productId]);

  const formatPrice = (price: string | null | undefined, currency: string | null | undefined) => {
    if (!price) return null;
    const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
    return `${symbol}${parseFloat(price).toFixed(2)}`;
  };

  const getAvailabilityInfo = (availability: string | null | undefined) => {
    switch (availability) {
      case "in_stock":
        return {
          icon: Check,
          text: "In Stock",
          color: "text-green-600",
          bgColor: "bg-green-50",
        };
      case "low_stock":
        return {
          icon: AlertTriangle,
          text: "Low Stock",
          color: "text-yellow-600",
          bgColor: "bg-yellow-50",
        };
      case "out_of_stock":
        return {
          icon: XCircle,
          text: "Out of Stock",
          color: "text-red-600",
          bgColor: "bg-red-50",
        };
      default:
        return {
          icon: Package,
          text: "Check Availability",
          color: "text-muted-foreground",
          bgColor: "bg-muted",
        };
    }
  };

  if (productLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-6">
          <div className="grid lg:grid-cols-2 gap-8">
            <Skeleton className="aspect-square rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-1/3" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <Card className="max-w-md mx-auto p-8 text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Product Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The product you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }


  const productCompat = product as typeof product & { image_url?: string | null; image?: string | null };
  const productImage = productCompat.imageUrl || productCompat.image_url || productCompat.image || null;

  const availability = getAvailabilityInfo(product.availability);
  const AvailabilityIcon = availability.icon;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/search">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Link>
          </Button>
          {product.category && (
            <>
              <span className="text-muted-foreground">/</span>
              <Link 
                href={`/search?category=${encodeURIComponent(product.category)}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {product.category}
              </Link>
            </>
          )}
        </div>

        {/* Product Details */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Product Image */}
          <div className="aspect-square bg-muted rounded-xl overflow-hidden">
            {productImage ? (
              <img
                src={productImage}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-24 h-24 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Title and Brand */}
            <div>
              {product.brand && (
                <p className="text-sm text-muted-foreground mb-1">{product.brand}</p>
              )}
              <h1 className="text-2xl md:text-3xl font-bold">{product.title}</h1>
            </div>

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(parseFloat(product.rating || "0"))
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted"
                      }`}
                    />
                  ))}
                </div>
                <span className="font-medium">{parseFloat(product.rating).toFixed(1)}</span>
                {product.reviewCount && (
                  <span className="text-muted-foreground">
                    ({product.reviewCount.toLocaleString()} reviews)
                  </span>
                )}
              </div>
            )}

            {/* Price */}
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-primary">
                  {formatPrice(product.price, product.currency)}
                </span>
                {product.originalPrice && 
                  product.price &&
                  parseFloat(product.originalPrice) > parseFloat(product.price) && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">
                      {formatPrice(product.originalPrice, product.currency)}
                    </span>
                    <Badge variant="destructive">
                      {Math.round(
                        ((parseFloat(product.originalPrice) - parseFloat(product.price)) /
                          parseFloat(product.originalPrice)) *
                          100
                      )}% OFF
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {/* Availability */}
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${availability.bgColor}`}>
              <AvailabilityIcon className={`w-5 h-5 ${availability.color}`} />
              <span className={`font-medium ${availability.color}`}>{availability.text}</span>
              {product.stockQuantity && product.availability !== "out_of_stock" && (
                <span className="text-sm text-muted-foreground">
                  ({product.stockQuantity} available)
                </span>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Features */}
            {product.features && product.features.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Features</h3>
                <ul className="space-y-1">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-muted-foreground">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                size="lg" 
                className="flex-1"
                disabled={product.availability === "out_of_stock"}
                onClick={() => {
                  recordInteraction.mutate({
                    productId: product.id,
                    interactionType: "add_to_cart",
                  });
                }}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                Add to Cart
              </Button>
              <Button size="lg" variant="outline">
                <Heart className="w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline">
                <Share2 className="w-5 h-5" />
              </Button>
            </div>

            {/* Category Tags */}
            {(product.category || product.subcategory) && (
              <div className="flex flex-wrap gap-2 pt-2">
                {product.category && (
                  <Badge variant="secondary">{product.category}</Badge>
                )}
                {product.subcategory && (
                  <Badge variant="outline">{product.subcategory}</Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <Separator className="my-8" />

        {/* Similar Products */}
        {similarProducts && similarProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Similar Products</h2>
              <Badge variant="secondary" className="ml-2">AI Powered</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {similarProducts.map((item) => (
                <ProductCard 
                  key={item.product.id} 
                  product={item.product} 
                  compact 
                />
              ))}
            </div>
          </section>
        )}

        {/* Session Recommendations */}
        {sessionRecs && sessionRecs.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">You May Also Like</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {sessionRecs.map((item) => (
                <ProductCard 
                  key={item.product.id} 
                  product={item.product}
                  showExplanation
                  explanation={item.reason}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
