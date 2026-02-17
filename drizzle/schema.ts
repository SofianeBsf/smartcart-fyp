import {
  serial,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  decimal,
  jsonb,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

const userRoleEnum = pgEnum("role", ["user", "admin"]);
const availabilityEnum = pgEnum("availability", ["in_stock", "low_stock", "out_of_stock"]);
const interactionTypeEnum = pgEnum("interaction_type", ["view", "click", "search_click", "add_to_cart", "purchase"]);
const uploadStatusEnum = pgEnum("status", ["pending", "processing", "embedding", "completed", "failed"]);
const metricTypeEnum = pgEnum("metric_type", ["ndcg@10", "recall@10", "precision@10", "mrr", "custom"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),

  role: userRoleEnum("role").default("user").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Product catalog table storing all product metadata.
 */
export const products = pgTable("products", {
  id: serial("id").primaryKey(),

  asin: varchar("asin", { length: 20 }).unique(), // Amazon Standard Identification Number
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),

  category: varchar("category", { length: 255 }),
  subcategory: varchar("subcategory", { length: 255 }),
  brand: varchar("brand", { length: 255 }),

  imageUrl: text("image_url"),

  price: decimal("price", { precision: 10, scale: 2 }),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("GBP"),

  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),

  availability: availabilityEnum("availability").default("in_stock"),
  stockQuantity: integer("stock_quantity").default(100),

  features: jsonb("features").$type<string[]>(),
  isFeatured: boolean("is_featured").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * If you DON'T have `product_embeddings` table in Postgres, remove this block.
 */
export const productEmbeddings = pgTable("product_embeddings", {
  id: serial("id").primaryKey(),

  productId: integer("product_id").notNull().unique(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
  embeddingModel: varchar("embedding_model", { length: 100 }).default("all-MiniLM-L6-v2"),
  textUsed: text("text_used"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProductEmbedding = typeof productEmbeddings.$inferSelect;
export type InsertProductEmbedding = typeof productEmbeddings.$inferInsert;

/**
 * Anonymous session table for tracking user interactions without login.
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),

  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Your DB table is `interactions`
 */
export const interactions = pgTable("interactions", {
  id: serial("id").primaryKey(),

  sessionId: varchar("session_id", { length: 64 }).notNull(),
  productId: integer("product_id").notNull(),
  interactionType: interactionTypeEnum("interaction_type").notNull(),

  searchQuery: text("search_query"),
  position: integer("position"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = typeof interactions.$inferInsert;

/**
 * ✅ COMPAT EXPORT (FIXES YOUR DOCKER BUILD)
 * server/db.ts imports `sessionInteractions`, so we alias it to `interactions`.
 */
export const sessionInteractions = interactions;
export type SessionInteraction = Interaction;
export type InsertSessionInteraction = InsertInteraction;

/**
 * Ranking weights configuration for the explainable AI formula.
 */
export const rankingWeights = pgTable("ranking_weights", {
  id: serial("id").primaryKey(),

  name: varchar("name", { length: 100 }).notNull().default("default"),

  alpha: decimal("alpha", { precision: 4, scale: 3 }).default("0.500").notNull(),
  beta: decimal("beta", { precision: 4, scale: 3 }).default("0.200").notNull(),
  gamma: decimal("gamma", { precision: 4, scale: 3 }).default("0.150").notNull(),
  delta: decimal("delta", { precision: 4, scale: 3 }).default("0.100").notNull(),
  epsilon: decimal("epsilon", { precision: 4, scale: 3 }).default("0.050").notNull(),

  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RankingWeight = typeof rankingWeights.$inferSelect;
export type InsertRankingWeight = typeof rankingWeights.$inferInsert;

/**
 * Search logs for evaluation and IR metrics.
 */
export const searchLogs = pgTable("search_logs", {
  id: serial("id").primaryKey(),

  sessionId: varchar("session_id", { length: 64 }).notNull(),
  query: text("query").notNull(),

  queryEmbedding: jsonb("query_embedding").$type<number[]>(),
  resultsCount: integer("results_count").default(0),
  responseTimeMs: integer("response_time_ms"),
  filters: jsonb("filters").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SearchLog = typeof searchLogs.$inferSelect;
export type InsertSearchLog = typeof searchLogs.$inferInsert;

/**
 * Search result explanations for XAI transparency.
 */
export const searchResultExplanations = pgTable("search_result_explanations", {
  id: serial("id").primaryKey(),

  searchLogId: integer("search_log_id").notNull(),
  productId: integer("product_id").notNull(),
  position: integer("position").notNull(),

  finalScore: decimal("final_score", { precision: 8, scale: 6 }).notNull(),
  semanticScore: decimal("semantic_score", { precision: 8, scale: 6 }).notNull(),
  ratingScore: decimal("rating_score", { precision: 8, scale: 6 }).notNull(),
  priceScore: decimal("price_score", { precision: 8, scale: 6 }).notNull(),
  stockScore: decimal("stock_score", { precision: 8, scale: 6 }).notNull(),
  recencyScore: decimal("recency_score", { precision: 8, scale: 6 }).notNull(),

  matchedTerms: jsonb("matched_terms").$type<string[]>(),
  explanation: text("explanation"),
  wasClicked: boolean("was_clicked").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SearchResultExplanation = typeof searchResultExplanations.$inferSelect;
export type InsertSearchResultExplanation = typeof searchResultExplanations.$inferInsert;

/**
 * Catalog upload jobs for tracking CSV imports.
 */
export const catalogUploadJobs = pgTable("catalog_upload_jobs", {
  id: serial("id").primaryKey(),

  filename: varchar("filename", { length: 255 }).notNull(),
  status: uploadStatusEnum("status").default("pending").notNull(),

  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  embeddedRows: integer("embedded_rows").default(0),

  errorMessage: text("error_message"),
  uploadedBy: integer("uploaded_by"),

  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CatalogUploadJob = typeof catalogUploadJobs.$inferSelect;
export type InsertCatalogUploadJob = typeof catalogUploadJobs.$inferInsert;

/**
 * Evaluation metrics for IR performance tracking.
 */
export const evaluationMetrics = pgTable("evaluation_metrics", {
  id: serial("id").primaryKey(),

  metricType: metricTypeEnum("metric_type").notNull(),
  value: decimal("value", { precision: 8, scale: 6 }).notNull(),

  queryCount: integer("query_count").default(0),
  notes: text("notes"),

  evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EvaluationMetric = typeof evaluationMetrics.$inferSelect;
export type InsertEvaluationMetric = typeof evaluationMetrics.$inferInsert;
