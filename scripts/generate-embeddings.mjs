import { Client } from "pg";
import axios from "axios";

const DATABASE_URL = process.env.DATABASE_URL;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function generateAllEmbeddings() {
  console.log("Connecting to database...");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Get all products
  const { rows: products } = await client.query(
    "SELECT id, title, description, category, subcategory, brand, features FROM products"
  );

  console.log(`Found ${products.length} products to process`);

  let success = 0;
  let failed = 0;

  for (const product of products) {
    try {
      const features = Array.isArray(product.features)
        ? product.features
        : [];

      const textToEmbed = [
        product.title,
        product.description,
        product.category,
        product.subcategory,
        product.brand,
        ...features,
      ]
        .filter(Boolean)
        .join(" ");

      console.log(`Generating embedding for: ${product.title.slice(0, 50)}...`);

      const response = await axios.post(`${AI_SERVICE_URL}/embed`, { text: textToEmbed });
      const embedding = response.data.embedding;

      // Insert or update embedding
      await client.query(
        `INSERT INTO product_embeddings (product_id, embedding, embedding_model, text_used, created_at, updated_at)
         VALUES ($1, $2, 'all-MiniLM-L6-v2', $3, NOW(), NOW())
         ON CONFLICT (product_id) DO UPDATE SET
           embedding = EXCLUDED.embedding,
           embedding_model = EXCLUDED.embedding_model,
           text_used = EXCLUDED.text_used,
           updated_at = NOW()`,
        [product.id, JSON.stringify(embedding), textToEmbed.slice(0, 1000)]
      );

      success++;
      console.log(`✓ Saved embedding for: ${product.title.slice(0, 50)}...`);
    } catch (error) {
      failed++;
      console.error(`✗ Failed for ${product.title}:`, error.message);
    }
  }

  await client.end();

  console.log("\nEmbedding generation complete!");
  console.log(`Success: ${success}, Failed: ${failed}`);
}

generateAllEmbeddings().catch(console.error);
