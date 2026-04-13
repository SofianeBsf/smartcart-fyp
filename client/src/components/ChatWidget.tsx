import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  User,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
}

interface ProductCard {
  id: number;
  title: string;
  price: string | null;
  rating: string | null;
  imageUrl: string | null;
  availability: string | null;
  category: string | null;
}

// ─── Suggested prompts ──────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Find me wireless headphones",
  "What's in my cart?",
  "Recommend a gaming laptop",
  "Show me popular shoes",
];

// ─── Product Card Component ─────────────────────────────────────────

function MiniProductCard({ product }: { product: ProductCard }) {
  return (
    <a
      href={`/product/${product.id}`}
      className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 hover:bg-accent transition-colors text-xs group"
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-10 h-10 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate group-hover:text-primary transition-colors">
          {product.title}
        </p>
        <div className="flex items-center gap-2 text-muted-foreground">
          {product.price && <span>£{product.price}</span>}
          {product.rating && <span>{product.rating}★</span>}
        </div>
      </div>
      <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </a>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  // Strip [ID:x] tokens from display text
  const cleanContent = message.content.replace(/\[ID:\d+\]/g, "").trim();

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-7 h-7 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-2")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{cleanContent}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ul>li]:my-0">
              <Streamdown>{cleanContent}</Streamdown>
            </div>
          )}
        </div>

        {/* Product cards attached to this message */}
        {!isUser && message.products && message.products.length > 0 && (
          <div className="space-y-1.5">
            {message.products.slice(0, 4).map((p) => (
              <MiniProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-7 h-7 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}

// ─── Main Widget ────────────────────────────────────────────────────

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.chat.send.useMutation();

  // Scroll to bottom on new messages
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLDivElement | null;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, chatMutation.isPending]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chatMutation.isPending) return;

      // Add user message immediately
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setInput("");

      try {
        const result = await chatMutation.mutateAsync({
          message: trimmed,
          conversationId,
        });

        setConversationId(result.conversationId);

        // Add assistant reply with product cards
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.reply,
            products: result.products,
          },
        ]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I ran into an issue processing your request. Please try again in a moment.",
          },
        ]);
      }
    },
    [chatMutation, conversationId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating bubble — higher on mobile to avoid overlapping filter buttons */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          {/* Notification dot */}
          {messages.length === 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </button>
      )}

      {/* Chat panel — full screen on mobile, floating card on desktop */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 z-50 w-full sm:w-[380px] h-full sm:h-[560px] sm:max-h-[80vh] bg-card sm:border sm:border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">
                  SmartCart Assistant
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  AI-powered shopping help
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-hidden">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-primary/50" />
                </div>
                <p className="text-sm font-medium mb-1">Hi there! 👋</p>
                <p className="text-xs text-muted-foreground mb-5">
                  I can help you find products, check your cart, or answer
                  shopping questions.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        sendMessage(prompt);
                      }}
                      disabled={chatMutation.isPending}
                      className="text-xs text-left px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-3 p-4">
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))}

                  {chatMutation.isPending && (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                        <div className="flex gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 p-3 border-t bg-background/50"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm min-h-[38px] max-h-[100px] focus:outline-none focus:ring-1 focus:ring-primary/50"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || chatMutation.isPending}
              className="shrink-0 h-[38px] w-[38px] rounded-xl"
            >
              {chatMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
