import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Package, ShoppingCart, Award, Plus, Minus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";

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
  showAddToCart?: boolean;
  featured?: boolean;
}

export default function ProductCard({
  product,
  compact = false,
  showExplanation = false,
  explanation,
  position,
  showAddToCart = false,
  featured = false,
}: ProductCardProps) {
  const recordInteraction = trpc.session.recordInteraction.useMutation();
  const { items: cartItems, addItem, updateQuantity, removeItem } = useCart();
  const cartItem = cartItems.find(i => i.productId === product.id);
  const qty = cartItem?.quantity || 0;

  const handleClick = () => {
    recordInteraction.mutate({
      productId: product.id,
      interactionType: "click",
      position,
    });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const productImage = product.imageUrl || product.image_url || product.image || "";
    addItem({
      productId: product.id,
      title: product.title,
      price: product.price ? parseFloat(product.price) : 0,
      imageUrl: productImage,
      quantity: 1,
    });
    recordInteraction.mutate({ productId: product.id, interactionType: "add_to_cart" });
    toast.success("Added to cart");
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
          {featured && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
              <Award className="w-3 h-3" />
              Featured
            </div>
          )}
          {!featured && position && (
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
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-primary">
                      {formatPrice(product.price, product.currency)}
                    </p>
                    {product.originalPrice &&
                      parseFloat(product.originalPrice) > parseFloat(product.price) && (
                      <span className="text-xs font-semibold text-red-600">
                        -{Math.round(((parseFloat(product.originalPrice) - parseFloat(product.price)) / parseFloat(product.originalPrice)) * 100)}%
                      </span>
                    )}
                  </div>
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
            {showAddToCart && product.availability !== "out_of_stock" && (
              qty > 0 ? (
                <div className="mt-3 flex flex-col gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0 border rounded-md overflow-hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-none px-2 h-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (qty === 1) {
                            removeItem(product.id);
                          } else {
                            updateQuantity(product.id, qty - 1);
                          }
                        }}
                      >
                        {qty === 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      </Button>
                      <span className="px-3 text-sm font-semibold min-w-[2rem] text-center">{qty}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-none px-2 h-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateQuantity(product.id, qty + 1);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Link href="/cart" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      View in Cart
                    </Button>
                  </Link>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full mt-3"
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
