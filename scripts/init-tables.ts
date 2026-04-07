import "dotenv/config";
import { getDb } from "../server/db";
import { users, rankingWeights } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Database initialization script
 * Creates all necessary tables and seeds default data
 * Run with: npx tsx scripts/init-tables.ts
 */

let bcrypt: any = null;
try {
  bcrypt = require("bcryptjs");
} catch (e) {
  console.error("[Init] bcryptjs not available. Install with: npm install bcryptjs");
  process.exit(1);
}

async function initDatabase() {
  console.log("[Init] Starting database initialization...");

  const db = await getDb();
  if (!db) {
    console.error("[Init] Failed to connect to database");
    process.exit(1);
  }

  try {
    // Create cart_items table if it doesn't exist
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
    console.log("[Init] cart_items table ready");

    // Create wishlist_items table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        product_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);
    console.log("[Init] wishlist_items table ready");

    // Check if admin user already exists
    const adminResult = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@smartcart.com"))
      .limit(1);

    if (adminResult.length === 0) {
      console.log("[Init] Creating admin user...");

      const adminPassword = process.env.ADMIN_PASSWORD || "SmartCart2024!";
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      await db.insert(users).values({
        openId: "admin-seed",
        name: "Admin",
        email: "admin@smartcart.com",
        passwordHash,
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      });

      console.log(
        "[Init] Admin user created: admin@smartcart.com / SmartCart2024!"
      );
    } else {
      console.log(
        "[Init] Admin user already exists: admin@smartcart.com"
      );
    }

    // Check if default ranking weights exist
    const weightsResult = await db
      .select()
      .from(rankingWeights)
      .where(eq(rankingWeights.name, "default"))
      .limit(1);

    if (weightsResult.length === 0) {
      console.log("[Init] Creating default ranking weights...");

      await db.insert(rankingWeights).values({
        name: "default",
        alpha: "0.500",
        beta: "0.200",
        gamma: "0.150",
        delta: "0.100",
        epsilon: "0.050",
        isActive: true,
      });

      console.log("[Init] Default ranking weights created");
    } else {
      console.log("[Init] Default ranking weights already exist");
    }

    console.log("[Init] Database initialization complete!");
    process.exit(0);
  } catch (error) {
    console.error("[Init] Initialization failed:", error);
    process.exit(1);
  }
}

initDatabase().catch(console.error);
