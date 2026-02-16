import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Package } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface Product {
  id: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  image?: string | null;
  price?: string | null;
  originalPrice?: string | null;
  currency?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
  availability?: "in_stock" | "low_stock" | "out_of_stock" | null;
  category?: string | null;
  brand?: string | null;
}

interface ProductCardProps {
  product: Product;
  compact?: boolean;
  showExplanation?: boolean;
  explanation?: string;
  position?: number;
}

export default function ProductCard({ 
  product, 
  compact = false,
  showExplanation = false,
  explanation,
  position
}: ProductCardProps) {
  const recordInteraction = trpc.session.recordInteraction.useMutation();

  const handleClick = () => {
    recordInteraction.mutate({
      productId: product.id,
      interactionType: "click",
      position,
    });
  };

  const formatPrice = (price: string | null | undefined, currency: string | null | undefined) => {
    if (!price) return null;
    const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
    return `${symbol}${parseFloat(price).toFixed(2)}`;
  };


  const productImage = product.imageUrl || product.image_url || product.image || null;

  const getAvailabilityBadge = (availability: string | null | undefined) => {
    switch (availability) {
      case "in_stock":
        return <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">In Stock</Badge>;
      case "low_stock":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 text-xs">Low Stock</Badge>;
      case "out_of_stock":
        return <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs">Out of Stock</Badge>;
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <Link href={`/product/${product.id}`} onClick={handleClick}>
        <Card className="product-card overflow-hidden cursor-pointer h-full">
          <div className="aspect-square bg-muted relative overflow-hidden">
            {productImage ? (
              <img
                src={productImage}
                alt={product.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <CardContent className="p-3">
            <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.title}</h3>
            {product.price && (
              <p className="text-sm font-semibold text-primary">
                {formatPrice(product.price, product.currency)}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/product/${product.id}`} onClick={handleClick}>
      <Card className="product-card overflow-hidden cursor-pointer h-full flex flex-col">
        <div className="aspect-square bg-muted relative overflow-hidden">
          {productImage ? (
            <img
              src={productImage}
              alt={product.title}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          {position && (
            <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              {position}
            </div>
          )}
        </div>
        <CardContent className="p-4 flex-1 flex flex-col">
          <div className="flex-1">
            <h3 className="font-medium line-clamp-2 mb-2">{product.title}</h3>
            
            {product.brand && (
              <p className="text-xs text-muted-foreground mb-2">{product.brand}</p>
            )}

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-1 mb-2">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{parseFloat(product.rating).toFixed(1)}</span>
                {product.reviewCount && (
                  <span className="text-xs text-muted-foreground">
                    ({product.reviewCount.toLocaleString()})
                  </span>
                )}
              </div>
            )}

            {/* Explanation Badge */}
            {showExplanation && explanation && (
              <div className="mb-2">
                <p className="text-xs text-muted-foreground bg-primary/5 rounded-md px-2 py-1.5 line-clamp-2">
                  💡 {explanation}
                </p>
              </div>
            )}
          </div>

          {/* Price and Availability */}
          <div className="mt-auto pt-2 border-t">
            <div className="flex items-center justify-between">
              <div>
                {product.price && (
                  <p className="text-lg font-bold text-primary">
                    {formatPrice(product.price, product.currency)}
                  </p>
                )}
                {product.originalPrice && product.price && 
                  parseFloat(product.originalPrice) > parseFloat(product.price) && (
                  <p className="text-xs text-muted-foreground line-through">
                    {formatPrice(product.originalPrice, product.currency)}
                  </p>
                )}
              </div>
              {getAvailabilityBadge(product.availability)}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
