import { useLocation } from "wouter";
import { useWishlist } from "@/hooks/useWishlist";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, ArrowLeft, ShoppingCart, Package } from "lucide-react";
import Header from "@/components/Header";

export default function Wishlist() {
  const [, setLocation] = useLocation();
  const { items, removeItem } = useWishlist();
  const { addItem: addToCart } = useCart();

  const handleAddToCart = (item: any) => {
    addToCart({
      productId: item.productId,
      title: item.title,
      price: item.price,
      imageUrl: item.imageUrl,
      quantity: 1,
    });

    // Show a simple notification (you could use toast here)
    alert(`${item.title} added to cart!`);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Your Wishlist is Empty</h1>
            <p className="text-muted-foreground mb-6">
              You haven't added any items to your wishlist yet.
              Start exploring products and save your favorites!
            </p>
            <Button
              className="w-full"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Start Shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">My Wishlist</h1>
          <p className="text-muted-foreground">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        </div>

        {/* Wishlist Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <Card key={item.productId} className="overflow-hidden">
              {/* Product Image */}
              <div className="aspect-square bg-muted relative overflow-hidden">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}

                {/* Remove Button */}
                <button
                  onClick={() => removeItem(item.productId)}
                  className="absolute top-2 right-2 p-2 bg-white rounded-full hover:bg-red-50 transition"
                >
                  <Heart className="w-5 h-5 fill-red-500 text-red-500" />
                </button>
              </div>

              {/* Product Info */}
              <CardContent className="p-4">
                <h3 className="font-medium line-clamp-2 mb-2">{item.title}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-primary">
                    £{item.price.toFixed(2)}
                  </span>
                </div>

                {/* Add to Cart Button */}
                <Button
                  className="w-full mt-3"
                  size="sm"
                  onClick={() => handleAddToCart(item)}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
