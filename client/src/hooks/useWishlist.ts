import { useState, useCallback, useEffect } from "react";

export interface WishlistItem {
  productId: number;
  title: string;
  price: number;
  imageUrl: string;
  addedAt: string;
}

const WISHLIST_STORAGE_KEY = "smartcart-wishlist";
const WISHLIST_EVENT = "smartcart-wishlist-change";

export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load wishlist from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load wishlist from localStorage:", error);
    }
    setIsInitialized(true);
  }, []);

  // Listen for wishlist changes from other components
  useEffect(() => {
    const handleWishlistChange = (event: any) => {
      try {
        const newItems = event.detail;
        setItems(newItems);
      } catch (error) {
        console.error("Failed to handle wishlist change event:", error);
      }
    };

    window.addEventListener(WISHLIST_EVENT, handleWishlistChange);
    return () => window.removeEventListener(WISHLIST_EVENT, handleWishlistChange);
  }, []);

  // Persist to localStorage whenever items change
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: items }));
    } catch (error) {
      console.error("Failed to save wishlist to localStorage:", error);
    }
  }, [items, isInitialized]);

  const addItem = useCallback((item: Omit<WishlistItem, "addedAt">) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.productId === item.productId);
      if (exists) return prev;
      return [...prev, { ...item, addedAt: new Date().toISOString() }];
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const toggleItem = useCallback((item: Omit<WishlistItem, "addedAt">) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.productId === item.productId);
      if (exists) {
        return prev.filter((i) => i.productId !== item.productId);
      }
      return [...prev, { ...item, addedAt: new Date().toISOString() }];
    });
  }, []);

  const isInWishlist = useCallback((productId: number) => {
    return items.some((i) => i.productId === productId);
  }, [items]);

  const clearWishlist = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    addItem,
    removeItem,
    toggleItem,
    isInWishlist,
    clearWishlist,
  };
}
