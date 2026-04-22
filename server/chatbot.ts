/**
 * Pick N Take Chatbot Service
 *
 * A RAG-powered conversational assistant that:
 * 1. Classifies user intent (product discovery, order help, general FAQ)
 * 2. Retrieves relevant context from the catalog (semantic search), cart,
 *    and wishlist
 * 3. Calls the LLM with a curated system prompt + context
 * 4. Returns a natural-language response with optional product cards
 *
 * Architecture:
 * - User message → intent classification (lightweight keyword/pattern)
 * - Context retrieval (parallel: semantic search + user data)
 * - LLM call with system prompt + context + conversation history
 * - Parse response for product references → attach product cards
 */

import { invokeLLM, type Message } from "./_core/llm";
import {
  getOrCreateConversation,
  saveChatMessage,
  getChatHistory,
  getUserCartItems,
  getUserWishlistItems,
  searchProductsByKeyword,
  getProductById,
} from "./db";
import {
  checkAIServiceHealth,
  semanticSearchViaAI,
  toAIProduct,
  fromDBWeights,
  type Product as AIProduct,
} from "./aiService";
import {
  getAllProductsWithOptionalEmbeddings,
  getActiveRankingWeights,
} from "./db";

// ─── Intent Classification ───────────────────────────────────────────

type Intent =
  | "product_search"
  | "product_compare"
  | "product_recommendation"
  | "order_help"
  | "cart_help"
  | "wishlist_help"
  | "general_faq"
  | "greeting"
  | "unknown";

const INTENT_PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: "greeting",
    patterns: [/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/i],
  },
  {
    intent: "cart_help",
    patterns: [
      /\b(cart|basket|checkout|buy|purchase|order)\b/i,
      /\bwhat.*in\s*my\s*(cart|basket)\b/i,
    ],
  },
  {
    intent: "wishlist_help",
    patterns: [
      /\bwishlist\b/i,
      /\bsaved\s*items\b/i,
      /\bfavou?rites?\b/i,
    ],
  },
  {
    intent: "order_help",
    patterns: [
      /\b(order|shipping|delivery|return|refund|track)\b/i,
      /\bstatus\b/i,
    ],
  },
  {
    intent: "product_compare",
    patterns: [
      /\bcompare\b/i,
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /\bdifference\s*between\b/i,
      /\bwhich\s*(one|is\s*better)\b/i,
    ],
  },
  {
    intent: "product_recommendation",
    patterns: [
      /\brecommend\b/i,
      /\bsuggest\b/i,
      /\bbest\b/i,
      /\btop\b/i,
      /\bwhat\s*should\s*i\s*(get|buy)\b/i,
      /\blooking\s*for\b/i,
    ],
  },
  {
    intent: "product_search",
    patterns: [
      /\b(find|search|show|give)\s*(me)?\b/i,
      /\bdo\s*you\s*have\b/i,
      /\bhave\s*any\b/i,
      /\bany\b.*\bfor\b/i,
      /\bprice\s*of\b/i,
    ],
  },
  {
    intent: "general_faq",
    patterns: [
      /\b(help|how|what|where|when|policy|policies|return|shipping)\b/i,
    ],
  },
];

function classifyIntent(message: string): Intent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(message))) return intent;
  }
  // If the message is short and contains nouns, assume product search
  if (message.split(/\s+/).length <= 5) return "product_search";
  return "unknown";
}

// ─── Query Extraction ────────────────────────────────────────────────

const SEARCH_FILLER_PATTERNS: RegExp[] = [
  /\b(i'?m?|i\s+am)\s+(looking\s+for|searching\s+for|trying\s+to\s+find|want\s+to\s+buy|interested\s+in)\b/gi,
  /\b(do\s+you\s+have|show\s+me|find\s+me|give\s+me|can\s+you\s+(show|find)|are\s+there\s+any|have\s+you\s+got)\b/gi,
  /\b(i\s+(want|need|would\s+like|'d\s+like)(\s+to\s+(buy|get|see|find))?)\b/gi,
  /\b(please|thanks|thank\s+you|hello|hi|hey|any)\b/gi,
];

/** Strip conversational filler so "i am looking for laptops" → "laptops" */
function extractSearchQuery(message: string): string {
  let q = message;
  for (const pattern of SEARCH_FILLER_PATTERNS) {
    q = q.replace(pattern, " ");
  }
  q = q.replace(/\s{2,}/g, " ").trim();
  return q.length >= 2 ? q : message.trim();
}

/**
 * Explicit product-category hints for terms that embedding models commonly
 * conflate (e.g. paper "notebook" vs laptop "notebook computer").
 */
const CATEGORY_HINTS: Array<{ terms: RegExp; category: string }> = [
  { terms: /\blaptops?\b/i, category: "laptop" },
  { terms: /\bnotebook\s+computer/i, category: "laptop" },
  { terms: /\bsmartphones?\b|\bphones?\b|\bmobiles?\b/i, category: "phone" },
  { terms: /\btablets?\b|\bipads?\b/i, category: "tablet" },
  { terms: /\bheadphones?\b|\bearphones?\b|\bearbuds?\b/i, category: "headphone" },
  { terms: /\btelevisions?\b|\btvs?\b/i, category: "tv" },
  { terms: /\bcameras?\b/i, category: "camera" },
];

function detectCategoryHint(query: string): string | undefined {
  for (const { terms, category } of CATEGORY_HINTS) {
    if (terms.test(query)) return category;
  }
  return undefined;
}

// ─── Context Retrieval ────────────────────────────────────────────────

export interface ProductCard {
  id: number;
  title: string;
  price: string | null;
  rating: string | null;
  imageUrl: string | null;
  availability: string | null;
  category: string | null;
}

interface ChatContext {
  intent: Intent;
  products: ProductCard[];
  cartSummary?: string;
  wishlistSummary?: string;
  /** Raw text blob injected into the system prompt */
  contextBlock: string;
}

async function searchProducts(query: string, limit = 6): Promise<ProductCard[]> {
  // Strip conversational filler so the embedding/SQL sees the actual product term.
  // e.g. "i am looking for laptops" → "laptops"
  const cleanQuery = extractSearchQuery(query);
  // If the clean query explicitly names a known category (laptop, phone, …),
  // pass it as a pre-filter so semantically-adjacent accessories are excluded
  // before scoring begins.
  const categoryHint = detectCategoryHint(query);

  const aiUp = await checkAIServiceHealth();
  if (aiUp) {
    try {
      const productsWithEmbeddings = await getAllProductsWithOptionalEmbeddings(500, 0);
      const weights = await getActiveRankingWeights();
      const aiProducts: AIProduct[] = productsWithEmbeddings.map((row: any) =>
        toAIProduct({
          ...row.product,
          embedding: row.embedding
            ? typeof row.embedding === "string"
              ? JSON.parse(row.embedding)
              : row.embedding
            : null,
        }),
      );
      const result = await semanticSearchViaAI(
        cleanQuery,
        aiProducts,
        weights ? fromDBWeights(weights) : undefined,
        {
          limit,
          category: categoryHint,
          // Reject products whose cosine similarity is below 0.30 so that
          // high-rated accessories don't outrank genuinely relevant items via
          // the rating/price terms in the scoring formula.
          minSemanticScore: 0.30,
        },
      );
      if (result.results.length > 0) {
        return result.results.map((r) => {
          const orig = productsWithEmbeddings.find((p: any) => p.product.id === r.product.id);
          return {
            id: r.product.id,
            title: r.product.title,
            price: r.product.price?.toString() ?? null,
            rating: r.product.rating?.toString() ?? null,
            imageUrl: orig?.product.imageUrl ?? null,
            availability: r.product.availability ?? null,
            category: r.product.category ?? null,
          };
        });
      }
    } catch (e) {
      console.warn("[Chatbot] Semantic search failed, falling back to keyword:", e);
    }
  }

  // Keyword fallback — use the clean query, NOT the raw message.
  // Raw message ("i am looking for laptops") produces an ILIKE pattern that
  // will never match any product title/description/category.
  const kw = await searchProductsByKeyword(cleanQuery, limit);
  return kw.map((p: any) => ({
    id: p.id,
    title: p.title,
    price: p.price,
    rating: p.rating,
    imageUrl: p.imageUrl,
    availability: p.availability,
    category: p.category,
  }));
}

async function buildContext(
  message: string,
  intent: Intent,
  userId?: number,
): Promise<ChatContext> {
  const context: ChatContext = {
    intent,
    products: [],
    contextBlock: "",
  };

  const chunks: string[] = [];

  // Product-related intents → search the catalog
  if (
    intent === "product_search" ||
    intent === "product_compare" ||
    intent === "product_recommendation" ||
    intent === "unknown"
  ) {
    const products = await searchProducts(message, 6);
    context.products = products;
    if (products.length > 0) {
      chunks.push(
        "MATCHING PRODUCTS FROM CATALOG:\n" +
          products
            .map(
              (p, i) =>
                `${i + 1}. [ID:${p.id}] ${p.title} — ${p.price ? `£${p.price}` : "Price N/A"} | Rating: ${p.rating ?? "N/A"}/5 | ${p.availability ?? "unknown"} | Category: ${p.category ?? "N/A"}`,
            )
            .join("\n"),
      );
    } else {
      chunks.push("No matching products found in the catalog for this query.");
    }
  }

  // Cart
  if ((intent === "cart_help" || intent === "order_help") && userId) {
    try {
      const cart = await getUserCartItems(userId);
      if (cart.length > 0) {
        const total = cart.reduce(
          (sum: number, c: any) => sum + (Number(c.product.price) || 0) * (c.cartItem.quantity ?? 1),
          0,
        );
        const summary =
          `USER'S CART (${cart.length} items, total ≈ £${total.toFixed(2)}):\n` +
          cart
            .map(
              (c: any) =>
                `- ${c.product.title} × ${c.cartItem.quantity ?? 1} (£${c.product.price ?? "?"})`,
            )
            .join("\n");
        context.cartSummary = summary;
        chunks.push(summary);
      } else {
        chunks.push("User's cart is empty.");
      }
    } catch {
      // Cart tables might not exist yet
    }
  }

  // Wishlist
  if (intent === "wishlist_help" && userId) {
    try {
      const wl = await getUserWishlistItems(userId);
      if (wl.length > 0) {
        const summary =
          `USER'S WISHLIST (${wl.length} items):\n` +
          wl.map((w: any) => `- ${w.product.title} (£${w.product.price ?? "?"})`).join("\n");
        context.wishlistSummary = summary;
        chunks.push(summary);
      } else {
        chunks.push("User's wishlist is empty.");
      }
    } catch {
      // Wishlist tables might not exist yet
    }
  }

  context.contextBlock = chunks.join("\n\n");
  return context;
}

// ─── System Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Pick N Take Assistant, a friendly and knowledgeable e-commerce shopping assistant.

PERSONALITY:
- Warm, helpful, and concise
- You speak naturally, not robotically
- You use short paragraphs, not walls of text
- You can use bullet points for product lists but keep descriptions brief

CAPABILITIES:
- Help users find and compare products from the Pick N Take catalog
- Answer questions about items in their cart or wishlist
- Provide general shopping advice and recommendations
- Explain product features, ratings, and pricing

RULES:
- ONLY recommend products that appear in the MATCHING PRODUCTS section below. Never invent products.
- When listing products, format each as: **Product Name** — £Price (Rating ★) and include the product ID like [ID:123] so the UI can link it.
- If no products match, say so honestly and suggest the user try different search terms.
- For order/shipping questions: Pick N Take offers standard delivery (3-5 business days) and express delivery (next day). Returns accepted within 30 days.
- Keep responses under 200 words unless the user asks for detail.
- Do NOT make up information about products not in the catalog.
- If the user asks something outside your scope, politely redirect them.

CRITICAL RELEVANCE GATE — apply this before listing anything:
Before presenting a product from MATCHING PRODUCTS, verify it directly satisfies the user's request category.
- A paper notebook, journal, or stationery is NOT a laptop computer. Never list it when the user asks for laptops.
- A bag, backpack, sleeve, or case is an accessory — do not present it as the device itself unless the user asked for bags/accessories.
- If the user asks for "phones", only list smartphones — not phone cases, chargers, or earphones.
- If NONE of the listed products genuinely match the user's stated category, say: "I couldn't find [item] in our catalog right now. Try browsing the shop directly or use a different search term." Do NOT list unrelated products to avoid an empty response.

PRODUCT REFERENCE FORMAT:
When mentioning a product, always include [ID:X] so the frontend can render a clickable card. Example: "I'd recommend the **Sony WH-1000XM5** [ID:42] — £299 (4.8★)"`;

// ─── Main Chat Handler ───────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  sessionId: string;
  userId?: number;
  conversationId?: number;
}

export interface ChatResponse {
  reply: string;
  conversationId: number;
  products: ProductCard[];
  intent: Intent;
}

export async function handleChatMessage(req: ChatRequest): Promise<ChatResponse> {
  const { message, sessionId, userId } = req;

  // 1. Get or create conversation
  const conversationId =
    req.conversationId ?? (await getOrCreateConversation(sessionId, userId));

  // 2. Classify intent
  const intent = classifyIntent(message);

  // 3. Retrieve context
  const context = await buildContext(message, intent, userId);

  // 4. Load recent chat history
  const history = await getChatHistory(conversationId, 10);
  // Reverse so oldest first
  const orderedHistory = history.reverse();

  // 5. Build LLM messages
  const llmMessages: Message[] = [
    {
      role: "system",
      content: context.contextBlock
        ? `${SYSTEM_PROMPT}\n\n---\nCONTEXT FOR THIS TURN:\n${context.contextBlock}`
        : SYSTEM_PROMPT,
    },
  ];

  // Add conversation history (up to last 10 messages)
  for (const msg of orderedHistory) {
    llmMessages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Add current user message
  llmMessages.push({ role: "user", content: message });

  // 6. Save user message to DB
  await saveChatMessage(conversationId, "user", message);

  // 7. Call LLM
  let reply: string;
  try {
    const result = await invokeLLM({
      messages: llmMessages,
      maxTokens: 1024,
    });
    reply =
      typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : Array.isArray(result.choices[0]?.message?.content)
          ? result.choices[0].message.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : "I'm sorry, I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("[Chatbot] LLM call failed:", error);
    if (intent === "greeting") {
      reply =
        "Hi there! Welcome to Pick N Take. I can help you find products, check your cart, or answer questions about shopping. What are you looking for today?";
    } else if (context.products.length > 0) {
      // Only show retrieved products that pass a basic title/category check
      // against the clean query. This prevents the fallback from silently
      // presenting accessories or wrong-category items when the LLM is down.
      const cleanQuery = extractSearchQuery(message);
      const queryTerms = cleanQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const relevant = context.products.filter((p) => {
        const searchable = `${p.title} ${p.category ?? ""}`.toLowerCase();
        return queryTerms.some((term) => searchable.includes(term));
      });
      const toShow = (relevant.length > 0 ? relevant : context.products).slice(0, 4);
      const label = relevant.length > 0 ? `Here are some ${cleanQuery} I found` : "Here are some products that might interest you";
      reply =
        `${label}:\n\n` +
        toShow
          .map((p) => `• **${p.title}** [ID:${p.id}] — ${p.price ? `£${p.price}` : "Price N/A"} (${p.rating ?? "?"}/5★)`)
          .join("\n") +
        "\n\nClick on any product to view more details!";
    } else {
      reply =
        "I'm having trouble connecting to my AI brain right now, but I'm still here! Try asking me to find a specific product, and I'll search the catalog for you.";
    }
  }

  // 8. Extract product IDs mentioned in the reply
  const mentionedIds: number[] = [];
  const idPattern = /\[ID:(\d+)\]/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idPattern.exec(reply)) !== null) {
    mentionedIds.push(parseInt(idMatch[1], 10));
  }

  // 9. Save assistant reply
  await saveChatMessage(conversationId, "assistant", reply, mentionedIds);

  // 10. Merge mentioned products with context products for card rendering
  const allProductIds = new Set([
    ...context.products.map((p) => p.id),
    ...mentionedIds,
  ]);
  // Fetch any mentioned product that wasn't already in context
  const missingIds = mentionedIds.filter(
    (id) => !context.products.find((p) => p.id === id),
  );
  for (const id of missingIds) {
    try {
      const product = await getProductById(id);
      if (product) {
        context.products.push({
          id: product.id,
          title: product.title,
          price: product.price,
          rating: product.rating,
          imageUrl: product.imageUrl,
          availability: product.availability,
          category: product.category,
        });
      }
    } catch {
      // skip
    }
  }

  return {
    reply,
    conversationId,
    products: context.products.filter((p) => allProductIds.has(p.id)),
    intent,
  };
}
