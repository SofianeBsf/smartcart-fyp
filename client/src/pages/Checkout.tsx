import { useState } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/useCart";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Loader, ArrowLeft, CheckCircle } from "lucide-react";
import Header from "@/components/Header";

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { items, subtotal, clearCart } = useCart();
  const recordInteraction = trpc.session.recordInteraction.useMutation();

  const [isProcessing, setIsProcessing] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  const [formData, setFormData] = useState({
    name: "John Doe",
    address: "123 Main Street",
    city: "London",
    postcode: "SW1A 1AA",
    country: "United Kingdom",
  });

  const [cardData, setCardData] = useState({
    number: "4242 4242 4242 4242",
    expiry: "12/25",
    cvc: "123",
    name: "John Doe",
  });

  const shipping = subtotal > 50 ? 0 : 5.99;
  const total = subtotal + shipping;

  if (items.length === 0 && !orderConfirmed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/cart")}
            className="gap-2 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </Button>
          <Card className="max-w-md mx-auto p-8 text-center">
            <p className="text-muted-foreground">Your cart is empty. Please add items before checking out.</p>
            <Button className="w-full mt-4" onClick={() => setLocation("/")}>
              Continue Shopping
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    setIsProcessing(true);

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate order number
    const newOrderNumber = "ORD-" + Math.random().toString(36).substr(2, 9).toUpperCase();
    setOrderNumber(newOrderNumber);

    // Record purchase interactions for each product
    for (const item of items) {
      recordInteraction.mutate({
        productId: item.productId,
        interactionType: "purchase",
      });
    }

    // Clear cart
    clearCart();
    setOrderConfirmed(true);
    setIsProcessing(false);
  };

  if (orderConfirmed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
            <p className="text-muted-foreground mb-6">
              Thank you for your purchase. Your order has been placed successfully.
            </p>

            <Card className="p-6 mb-6 bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">Order Number</p>
              <p className="text-2xl font-bold text-primary">{orderNumber}</p>
            </Card>

            <p className="text-sm text-muted-foreground mb-6">
              You'll receive an email confirmation shortly with tracking information.
            </p>

            <Button
              className="w-full"
              onClick={() => setLocation("/")}
            >
              Back to Home
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
            onClick={() => setLocation("/cart")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Checkout Form */}
          <div className="lg:col-span-2 space-y-6">
            <h1 className="text-3xl font-bold">Checkout</h1>

            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    disabled={isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    disabled={isProcessing}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">City</label>
                    <Input
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      disabled={isProcessing}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Postcode</label>
                    <Input
                      value={formData.postcode}
                      onChange={(e) =>
                        setFormData({ ...formData, postcode: e.target.value })
                      }
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Country</label>
                  <Input
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    disabled={isProcessing}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Details */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-blue-900 mb-1">Demo Payment</p>
                  <p className="text-blue-800">
                    Use the pre-filled test card (4242 4242 4242 4242) to complete this demo purchase.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cardholder Name</label>
                  <Input
                    value={cardData.name}
                    onChange={(e) =>
                      setCardData({ ...cardData, name: e.target.value })
                    }
                    disabled={isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Card Number</label>
                  <Input
                    value={cardData.number}
                    disabled={isProcessing}
                    placeholder="0000 0000 0000 0000"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expiry Date</label>
                    <Input
                      value={cardData.expiry}
                      disabled={isProcessing}
                      placeholder="MM/YY"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CVC</label>
                    <Input
                      value={cardData.cvc}
                      disabled={isProcessing}
                      placeholder="123"
                      type="password"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.productId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.title} × {item.quantity}
                      </span>
                      <span className="font-medium">
                        £{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">£{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="font-medium">£{shipping.toFixed(2)}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">£{total.toFixed(2)}</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Place Order"
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/cart")}
                  disabled={isProcessing}
                >
                  Back to Cart
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
