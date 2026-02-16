import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { 
  InsertUser, users, 
  products, InsertProduct, Product,
  productEmbeddings, InsertProductEmbedding,
  sessions, InsertSession,
  sessionInteractions, InsertSessionInteraction,
  rankingWeights, InsertRankingWeight,
  searchLogs, InsertSearchLog,
  searchResultExplanations, InsertSearchResultExplanation,
  catalogUploadJobs, InsertCatalogUploadJob,
  evaluationMetrics, InsertEvaluationMetric
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;


let _legacyProductColumnsBackfilled = false;

async function backfillLegacyProductColumns(db: ReturnType<typeof drizzle>) {
  if (_legacyProductColumnsBackfilled) return;

  await db.execute(sql`
    DO $$
    BEGIN
      -- Backfill legacy snake_case columns into canonical camelCase columns (if both exist)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'imageUrl'
      ) THEN
        UPDATE products
        SET "imageUrl" = COALESCE("imageUrl", image_url)
        WHERE image_url IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'original_price'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'originalPrice'
      ) THEN
        UPDATE products
        SET "originalPrice" = COALESCE("originalPrice", original_price)
        WHERE original_price IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'review_count'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'reviewCount'
      ) THEN
        UPDATE products
        SET "reviewCount" = COALESCE("reviewCount", review_count)
        WHERE review_count IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_quantity'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stockQuantity'
      ) THEN
        UPDATE products
        SET "stockQuantity" = COALESCE("stockQuantity", stock_quantity)
        WHERE stock_quantity IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_featured'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'isFeatured'
      ) THEN
        UPDATE products
        SET "isFeatured" = COALESCE("isFeatured", is_featured)
        WHERE is_featured IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'created_at'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'createdAt'
      ) THEN
        UPDATE products
        SET "createdAt" = COALESCE("createdAt", created_at)
        WHERE created_at IS NOT NULL;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_at'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updatedAt'
      ) THEN
        UPDATE products
        SET "updatedAt" = COALESCE("updatedAt", updated_at)
        WHERE updated_at IS NOT NULL;
      END IF;
    END $$;
  `);

  _legacyProductColumnsBackfilled = true;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      await backfillLegacyProductColumns(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USER OPERATIONS ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: { ...updateSet, updatedAt: new Date() },
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== PRODUCT OPERATIONS ====================

export async function createProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(products).values(product).returning({ id: products.id });
  return result[0]?.id;
}

export async function createProducts(productList: InsertProduct[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (productList.length === 0) return [];
  
  await db.insert(products).values(productList);
  return productList;
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function getProductsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  
  return db.select().from(products).where(inArray(products.id, ids));
}

export async function getAllProducts(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(products).limit(limit).offset(offset).orderBy(desc(products.createdAt));
}

export async function getProductCount() {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` }).from(products);
  return result[0]?.count ?? 0;
}

export async function searchProductsByKeyword(keyword: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  
  const searchTerm = `%${keyword.trim()}%`;
  return db.select()
    .from(products)
    .where(
      sql`${products.title} ILIKE ${searchTerm}
        OR coalesce(${products.description}, '') ILIKE ${searchTerm}
        OR coalesce(${products.category}, '') ILIKE ${searchTerm}`
    )
    .limit(limit);
}

export async function getProductsByCategory(category: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(products)
    .where(eq(products.category, category))
    .limit(limit)
    .orderBy(desc(products.rating));
}

export async function getFeaturedProducts(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(products)
    .where(eq(products.isFeatured, true))
    .limit(limit)
    .orderBy(desc(products.rating));
}

export async function updateProduct(id: number, updates: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(products).set(updates).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(products).where(eq(products.id, id));
}

export async function getCategories() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.selectDistinct({ category: products.category }).from(products);
  return result.map(r => r.category).filter(Boolean) as string[];
}

// ==================== EMBEDDING OPERATIONS ====================

export async function createEmbedding(embedding: InsertProductEmbedding) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(productEmbeddings).values(embedding).onConflictDoUpdate({
    target: productEmbeddings.productId,
    set: {
      embedding: embedding.embedding,
      textUsed: embedding.textUsed,
      updatedAt: new Date(),
    },
  });
}

export async function createEmbeddings(embeddings: InsertProductEmbedding[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (embeddings.length === 0) return;
  
  // Insert one by one with upsert to handle duplicates
  for (const emb of embeddings) {
    await createEmbedding(emb);
  }
}

export async function getEmbeddingByProductId(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(productEmbeddings)
    .where(eq(productEmbeddings.productId, productId))
    .limit(1);
  return result[0];
}

export async function getAllEmbeddings() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(productEmbeddings);
}

export async function getProductsWithEmbeddings() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select({
    product: products,
    embedding: productEmbeddings.embedding,
  })
  .from(products)
  .innerJoin(productEmbeddings, eq(products.id, productEmbeddings.productId));
}

export async function getEmbeddingCount() {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select({ count: sql<number>`count(*)` }).from(productEmbeddings);
  return result[0]?.count ?? 0;
}

// ==================== SESSION OPERATIONS ====================

export async function createSession(session: InsertSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(sessions).values(session);
}

export async function getSessionById(sessionId: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(sessions)
    .where(eq(sessions.sessionId, sessionId))
    .limit(1);
  return result[0];
}

export async function updateSessionActivity(sessionId: string) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.sessionId, sessionId));
}

// ==================== SESSION INTERACTION OPERATIONS ====================

export async function recordInteraction(interaction: InsertSessionInteraction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(sessionInteractions).values(interaction);
}

export async function getSessionInteractions(sessionId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(sessionInteractions)
    .where(eq(sessionInteractions.sessionId, sessionId))
    .orderBy(desc(sessionInteractions.createdAt))
    .limit(limit);
}

export async function getRecentlyViewedProducts(sessionId: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  
  const interactions = await db.select({ productId: sessionInteractions.productId })
    .from(sessionInteractions)
    .where(and(
      eq(sessionInteractions.sessionId, sessionId),
      eq(sessionInteractions.interactionType, "view")
    ))
    .orderBy(desc(sessionInteractions.createdAt))
    .limit(limit);
  
  const productIds = Array.from(new Set(interactions.map(i => i.productId)));
  if (productIds.length === 0) return [];
  
  return getProductsByIds(productIds);
}

// ==================== RANKING WEIGHTS OPERATIONS ====================

export async function getActiveRankingWeights() {
  const db = await getDb();
  if (!db) {
    // Return default weights if DB not available
    return {
      id: 0,
      name: "default",
      alpha: "0.500",
      beta: "0.200",
      gamma: "0.150",
      delta: "0.100",
      epsilon: "0.050",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  const result = await db.select()
    .from(rankingWeights)
    .where(eq(rankingWeights.isActive, true))
    .limit(1);
  
  if (result.length === 0) {
    // Create default weights if none exist
    await db.insert(rankingWeights).values({
      name: "default",
      alpha: "0.500",
      beta: "0.200",
      gamma: "0.150",
      delta: "0.100",
      epsilon: "0.050",
      isActive: true,
    });
    return getActiveRankingWeights();
  }
  
  return result[0];
}

export async function updateRankingWeights(id: number, weights: Partial<InsertRankingWeight>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(rankingWeights).set(weights).where(eq(rankingWeights.id, id));
}

export async function getAllRankingWeights() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(rankingWeights).orderBy(desc(rankingWeights.createdAt));
}

// ==================== SEARCH LOG OPERATIONS ====================

export async function logSearch(log: InsertSearchLog) {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.insert(searchLogs).values(log).returning({ id: searchLogs.id });
  return result[0]?.id ?? 0;
}

export async function getSearchLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(searchLogs)
    .orderBy(desc(searchLogs.createdAt))
    .limit(limit);
}

export async function getSearchLogsWithResults(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const logs = await db.select()
    .from(searchLogs)
    .orderBy(desc(searchLogs.createdAt))
    .limit(limit);
  
  // Fetch top results for each log
  const logsWithResults = await Promise.all(logs.map(async (log) => {
    const results = await db.select({
      productId: searchResultExplanations.productId,
      position: searchResultExplanations.position,
      finalScore: searchResultExplanations.finalScore,
    })
      .from(searchResultExplanations)
      .where(eq(searchResultExplanations.searchLogId, log.id))
      .orderBy(searchResultExplanations.position)
      .limit(10);
    
    return {
      ...log,
      topResults: results,
    };
  }));
  
  return logsWithResults;
}

// ==================== SEARCH RESULT EXPLANATION OPERATIONS ====================

export async function saveSearchExplanations(explanations: InsertSearchResultExplanation[]) {
  const db = await getDb();
  if (!db || explanations.length === 0) return;
  
  await db.insert(searchResultExplanations).values(explanations);
}

export async function getExplanationsForSearch(searchLogId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(searchResultExplanations)
    .where(eq(searchResultExplanations.searchLogId, searchLogId))
    .orderBy(searchResultExplanations.position);
}

export async function markResultClicked(searchLogId: number, productId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(searchResultExplanations)
    .set({ wasClicked: true })
    .where(and(
      eq(searchResultExplanations.searchLogId, searchLogId),
      eq(searchResultExplanations.productId, productId)
    ));
}

// ==================== CATALOG UPLOAD JOB OPERATIONS ====================

export async function createUploadJob(job: InsertCatalogUploadJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(catalogUploadJobs).values(job).returning({ id: catalogUploadJobs.id });
  return result[0]?.id;
}

export async function updateUploadJob(id: number, updates: Partial<InsertCatalogUploadJob>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(catalogUploadJobs).set(updates).where(eq(catalogUploadJobs.id, id));
}

export async function getUploadJob(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(catalogUploadJobs)
    .where(eq(catalogUploadJobs.id, id))
    .limit(1);
  return result[0];
}

export async function getRecentUploadJobs(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(catalogUploadJobs)
    .orderBy(desc(catalogUploadJobs.createdAt))
    .limit(limit);
}

// ==================== EVALUATION METRICS OPERATIONS ====================

export async function saveEvaluationMetric(metric: InsertEvaluationMetric) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(evaluationMetrics).values(metric);
}

export async function getEvaluationMetrics(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(evaluationMetrics)
    .orderBy(desc(evaluationMetrics.evaluatedAt))
    .limit(limit);
}

export async function getEvaluationMetricsBySearchLogId(searchLogId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(evaluationMetrics)
    .where(eq(evaluationMetrics.notes, `SearchLogId: ${searchLogId}`))
    .orderBy(desc(evaluationMetrics.evaluatedAt));
}

export async function getSearchLogById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(searchLogs).where(eq(searchLogs.id, id)).limit(1);
  return result[0];
}
