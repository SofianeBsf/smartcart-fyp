import "dotenv/config";
import { SEED_PRODUCTS } from "./seed-products";

/**
 * Complete database seeding script for SmartCart
 * Seeds admin user, ranking weights, and all 150 products
 * Run with: npx tsx scripts/seed-database.ts
 */

async function seedDatabase() {
  console.log("===========================================");
  console.log("  SmartCart Database Seeder");
  console.log("===========================================\n");

  // Dynamic import for bcryptjs (ESM-compatible)
  let bcrypt: any;
  try {
    const bcryptModule = await import("bcryptjs");
    bcrypt = bcryptModule.default || bcryptModule;
    console.log("[Seed] bcryptjs loaded successfully");
  } catch {
    console.warn("[Seed] bcryptjs not installed - admin password won't be hashed. Install with: npm install bcryptjs");
  }

  const { getDb } = await import("../server/db");
  const { sql } = await import("drizzle-orm");
  const { users, products, rankingWeights } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("[Seed] Failed to connect to database. Check DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("[Seed] Connected to database\n");

  // 1. Create ALL tables from scratch (safe with IF NOT EXISTS)
  console.log("[1/5] Creating all tables...");

  // Create enum types first
  await db.execute(sql`DO $$ BEGIN CREATE TYPE role AS ENUM ('user', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE availability AS ENUM ('in_stock', 'low_stock', 'out_of_stock'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE interaction_type AS ENUM ('view', 'click', 'search_click', 'add_to_cart', 'purchase'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE status AS ENUM ('pending', 'processing', 'embedding', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE metric_type AS ENUM ('ndcg@10', 'recall@10', 'precision@10', 'mrr', 'custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

  // Users table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      open_id varchar(64) NOT NULL UNIQUE,
      name text,
      email varchar(320),
      login_method varchar(64),
      password_hash text,
      avatar_url text,
      role role NOT NULL DEFAULT 'user',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      last_signed_in timestamp NOT NULL DEFAULT now()
    );
  `);

  // Products table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS products (
      id serial PRIMARY KEY,
      asin varchar(20) UNIQUE,
      title varchar(500) NOT NULL,
      description text,
      category varchar(255),
      subcategory varchar(255),
      brand varchar(255),
      image_url text,
      price decimal(10,2),
      original_price decimal(10,2),
      currency varchar(10) DEFAULT 'GBP',
      rating decimal(3,2),
      review_count integer DEFAULT 0,
      availability availability DEFAULT 'in_stock',
      stock_quantity integer DEFAULT 100,
      features jsonb,
      is_featured boolean DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Product embeddings table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS product_embeddings (
      id serial PRIMARY KEY,
      product_id integer NOT NULL UNIQUE,
      embedding jsonb NOT NULL,
      embedding_model varchar(100) DEFAULT 'all-MiniLM-L6-v2',
      text_used text,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Sessions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id serial PRIMARY KEY,
      session_id varchar(64) NOT NULL UNIQUE,
      user_id integer,
      created_at timestamp NOT NULL DEFAULT now(),
      last_active_at timestamp NOT NULL DEFAULT now(),
      expires_at timestamp NOT NULL
    );
  `);

  // Interactions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interactions (
      id serial PRIMARY KEY,
      session_id varchar(64) NOT NULL,
      product_id integer NOT NULL,
      interaction_type interaction_type NOT NULL,
      search_query text,
      position integer,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Ranking weights table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ranking_weights (
      id serial PRIMARY KEY,
      name varchar(100) NOT NULL DEFAULT 'default',
      alpha decimal(4,3) NOT NULL DEFAULT 0.500,
      beta decimal(4,3) NOT NULL DEFAULT 0.200,
      gamma decimal(4,3) NOT NULL DEFAULT 0.150,
      delta decimal(4,3) NOT NULL DEFAULT 0.100,
      epsilon decimal(4,3) NOT NULL DEFAULT 0.050,
      is_active boolean DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Search logs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS search_logs (
      id serial PRIMARY KEY,
      session_id varchar(64) NOT NULL,
      query text NOT NULL,
      query_embedding jsonb,
      results_count integer DEFAULT 0,
      response_time_ms integer,
      filters jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Search result explanations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS search_result_explanations (
      id serial PRIMARY KEY,
      search_log_id integer NOT NULL,
      product_id integer NOT NULL,
      position integer NOT NULL,
      final_score decimal(8,6) NOT NULL,
      semantic_score decimal(8,6) NOT NULL,
      rating_score decimal(8,6) NOT NULL,
      price_score decimal(8,6) NOT NULL,
      stock_score decimal(8,6) NOT NULL,
      recency_score decimal(8,6) NOT NULL,
      matched_terms jsonb,
      explanation text,
      was_clicked boolean DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Catalog upload jobs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS catalog_upload_jobs (
      id serial PRIMARY KEY,
      filename varchar(255) NOT NULL,
      status status NOT NULL DEFAULT 'pending',
      total_rows integer DEFAULT 0,
      processed_rows integer DEFAULT 0,
      embedded_rows integer DEFAULT 0,
      error_message text,
      uploaded_by integer,
      started_at timestamp,
      completed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Evaluation metrics table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS evaluation_metrics (
      id serial PRIMARY KEY,
      metric_type metric_type NOT NULL,
      value decimal(8,6) NOT NULL,
      query_count integer DEFAULT 0,
      notes text,
      evaluated_at timestamp NOT NULL DEFAULT now(),
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Cart items table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cart_items (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      product_id integer NOT NULL,
      quantity integer NOT NULL DEFAULT 1,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  // Wishlist items table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      product_id integer NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log("  All tables created/verified.\n");

  // 2. Seed admin user
  console.log("[2/5] Seeding admin user...");
  const adminEmail = process.env.ADMIN_EMAIL || "admin@smartcart.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "SmartCart2024!";
  const adminOpenId = process.env.OWNER_OPEN_ID || "dev-admin";

  let passwordHash: string | null = null;
  if (bcrypt) {
    passwordHash = await bcrypt.hash(adminPassword, 10);
  }

  // Check if admin exists
  const existingAdmin = await db.select().from(users).where(eq(users.openId, adminOpenId)).limit(1);
  if (existingAdmin.length === 0) {
    await db.execute(sql`
      INSERT INTO users (open_id, name, email, login_method, role, password_hash, created_at, updated_at, last_signed_in)
      VALUES (${adminOpenId}, 'Admin', ${adminEmail}, 'password', 'admin', ${passwordHash}, now(), now(), now())
      ON CONFLICT (open_id) DO UPDATE SET
        email = ${adminEmail},
        role = 'admin',
        password_hash = ${passwordHash},
        updated_at = now()
    `);
    console.log(`  Admin created: ${adminEmail} / ${adminPassword}\n`);
  } else {
    // Update existing admin's password
    await db.execute(sql`
      UPDATE users SET
        email = ${adminEmail},
        role = 'admin',
        password_hash = ${passwordHash},
        updated_at = now()
      WHERE open_id = ${adminOpenId}
    `);
    console.log(`  Admin updated: ${adminEmail} / ${adminPassword}\n`);
  }

  // 3. Seed ranking weights (use raw SQL to avoid column mismatch issues)
  console.log("[3/5] Seeding ranking weights...");
  const existingWeightsResult = await db.execute(sql`SELECT count(*) as cnt FROM ranking_weights`);
  const weightsCount = Number((existingWeightsResult as any).rows?.[0]?.cnt ?? (existingWeightsResult as any)[0]?.cnt ?? 0);
  if (weightsCount === 0) {
    await db.execute(sql`
      INSERT INTO ranking_weights (name, alpha, beta, gamma, delta, epsilon, is_active, created_at, updated_at)
      VALUES ('default', 0.500, 0.200, 0.150, 0.100, 0.050, true, now(), now())
    `);
    console.log("  Default ranking weights created.\n");
  } else {
    console.log("  Ranking weights already exist, skipping.\n");
  }

  // 4. Seed products
  console.log("[4/5] Seeding products...");
  const existingCount = await db.select({ count: sql<number>`count(*)` }).from(products);
  const currentCount = Number(existingCount[0]?.count ?? 0);

  if (currentCount >= 100) {
    console.log(`  ${currentCount} products already exist, skipping product seed.\n`);
  } else {
    // Clear existing products if there are some but not enough
    if (currentCount > 0) {
      console.log(`  Clearing ${currentCount} existing products...`);
      await db.execute(sql`DELETE FROM product_embeddings`);
      await db.execute(sql`DELETE FROM products`);
    }

    // Insert products in batches
    const batchSize = 25;
    let inserted = 0;
    for (let i = 0; i < SEED_PRODUCTS.length; i += batchSize) {
      const batch = SEED_PRODUCTS.slice(i, i + batchSize);
      await db.insert(products).values(batch as any);
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${SEED_PRODUCTS.length} products...`);
    }
    console.log(`  All ${SEED_PRODUCTS.length} products seeded.\n`);
  }

  // 5. Generate embeddings for all products
  console.log("[5/5] Generating embeddings for products...");
  const { batchGenerateEmbeddings } = await import("../server/semanticSearch");
  const allProducts = await db.select({ id: products.id }).from(products);
  const productIds = allProducts.map(p => p.id);

  console.log(`  Generating embeddings for ${productIds.length} products...`);
  const result = await batchGenerateEmbeddings(productIds, (completed, total) => {
    if (completed % 25 === 0 || completed === total) {
      console.log(`  Progress: ${completed}/${total}`);
    }
  });
  console.log(`  Embeddings: ${result.success} success, ${result.failed} failed.\n`);

  console.log("===========================================");
  console.log("  Database seeding complete!");
  console.log("===========================================");
  console.log(`\n  Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`  Products: ${SEED_PRODUCTS.length}`);
  console.log(`  Categories: ${[...new Set(SEED_PRODUCTS.map(p => p.category))].length}`);
  console.log(`\n  Run the app with: npm run dev`);

  process.exit(0);
}

seedDatabase().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
