import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";

export interface CartItem {
  productId: number;
  title: string;
  price: number;
  imageUrl: string;
  quantity: number;
}

const CART_STORAGE_KEY = "smartcart-cart";
const CART_EVENT = "smartcart-cart-change";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load cart from localStorage:", error);
    }
    setIsInitialized(true);
  }, []);

  // Listen for cart changes from other components
  useEffect(() => {
    const handleCartChange = (event: any) => {
      try {
        const newItems = event.detail;
        setItems(newItems);
      } catch (error) {
        console.error("Failed to handle cart change event:", error);
      }
    };

    window.addEventListener(CART_EVENT, handleCartChange);
    return () => window.removeEventListener(CART_EVENT, handleCartChange);
  }, []);

  // Persist to localStorage whenever items change
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: items }));
    } catch (error) {
      console.error("Failed to save cart to localStorage:", error);
    }
  }, [items, isInitialized]);

  // Server-side interaction tracking (fire-and-forget)
  const recordInteraction = trpc.session.recordInteraction.useMutation();

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      // Track cart addition on the server for recommendations (only for new items)
      recordInteraction.mutate({
        productId: item.productId,
        interactionType: "add_to_cart",
      });
      return [...prev, item];
    });
  }, [recordInteraction]);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.productId === productId ? { ...i, quantity } : i
        )
      );
    }
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    subtotal,
  };
}
