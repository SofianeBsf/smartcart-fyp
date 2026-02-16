/**
 * Seed script to populate the database with sample products.
 * Run with: node scripts/seed-products.mjs
 */

import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sampleProducts = [
  // Electronics - Headphones
  {
    title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    description: "Industry-leading noise cancellation with Auto NC Optimizer. Crystal clear hands-free calling with 4 beamforming microphones. Up to 30-hour battery life with quick charging.",
    category: "Electronics",
    subcategory: "Headphones",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
    price: "329.99",
    originalPrice: "379.99",
    currency: "GBP",
    rating: "4.80",
    reviewCount: 12453,
    availability: "in_stock",
    stockQuantity: 150,
    brand: "Sony",
    features: ["Active Noise Cancellation", "30-hour battery", "Bluetooth 5.2", "Multipoint connection"],
    isFeatured: true,
  },
  {
    title: "Apple AirPods Pro (2nd Generation)",
    description: "Active Noise Cancellation reduces unwanted background noise. Adaptive Transparency lets outside sounds in while reducing loud environmental noise.",
    category: "Electronics",
    subcategory: "Headphones",
    imageUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=500",
    price: "229.00",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 28934,
    availability: "in_stock",
    stockQuantity: 200,
    brand: "Apple",
    features: ["Active Noise Cancellation", "Spatial Audio", "MagSafe Charging", "IPX4 water resistant"],
    isFeatured: true,
  },
  {
    title: "Bose QuietComfort Ultra Headphones",
    description: "World-class noise cancellation with Immersive Audio. CustomTune technology personalizes sound to your ears.",
    category: "Electronics",
    subcategory: "Headphones",
    imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500",
    price: "449.95",
    currency: "GBP",
    rating: "4.60",
    reviewCount: 5621,
    availability: "in_stock",
    stockQuantity: 75,
    brand: "Bose",
    features: ["Immersive Audio", "CustomTune technology", "24-hour battery", "Quiet Mode"],
    isFeatured: true,
  },
  // Electronics - Laptops
  {
    title: "MacBook Pro 14-inch M3 Pro",
    description: "Supercharged by M3 Pro chip. Up to 18 hours of battery life. Stunning Liquid Retina XDR display.",
    category: "Electronics",
    subcategory: "Laptops",
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500",
    price: "1899.00",
    originalPrice: "1999.00",
    currency: "GBP",
    rating: "4.90",
    reviewCount: 8932,
    availability: "in_stock",
    stockQuantity: 50,
    brand: "Apple",
    features: ["M3 Pro chip", "18GB unified memory", "512GB SSD", "Liquid Retina XDR display"],
    isFeatured: true,
  },
  {
    title: "Dell XPS 15 Gaming Laptop",
    description: "15.6-inch 4K OLED display. Intel Core i9 processor. NVIDIA GeForce RTX 4070 graphics.",
    category: "Electronics",
    subcategory: "Laptops",
    imageUrl: "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=500",
    price: "1799.99",
    currency: "GBP",
    rating: "4.50",
    reviewCount: 3421,
    availability: "in_stock",
    stockQuantity: 30,
    brand: "Dell",
    features: ["4K OLED display", "Intel Core i9", "RTX 4070", "32GB RAM"],
    isFeatured: false,
  },
  {
    title: "ASUS ROG Zephyrus G14 Gaming Laptop",
    description: "AMD Ryzen 9 processor. NVIDIA GeForce RTX 4090. 14-inch QHD 165Hz display.",
    category: "Electronics",
    subcategory: "Laptops",
    imageUrl: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500",
    price: "2199.00",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 2156,
    availability: "low_stock",
    stockQuantity: 10,
    brand: "ASUS",
    features: ["AMD Ryzen 9", "RTX 4090", "165Hz display", "AniMe Matrix LED"],
    isFeatured: true,
  },
  // Electronics - Mice
  {
    title: "Logitech MX Master 3S Wireless Mouse",
    description: "Ultra-quiet clicks. 8K DPI tracking on any surface. USB-C quick charging.",
    category: "Electronics",
    subcategory: "Computer Accessories",
    imageUrl: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500",
    price: "99.99",
    currency: "GBP",
    rating: "4.80",
    reviewCount: 15678,
    availability: "in_stock",
    stockQuantity: 300,
    brand: "Logitech",
    features: ["Quiet clicks", "8K DPI sensor", "USB-C charging", "Multi-device"],
    isFeatured: true,
  },
  {
    title: "Razer DeathAdder V3 Pro Gaming Mouse",
    description: "Ultra-lightweight at 63g. Focus Pro 30K optical sensor. Up to 90 hours battery life.",
    category: "Electronics",
    subcategory: "Computer Accessories",
    imageUrl: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500",
    price: "149.99",
    currency: "GBP",
    rating: "4.60",
    reviewCount: 4532,
    availability: "in_stock",
    stockQuantity: 120,
    brand: "Razer",
    features: ["63g lightweight", "30K DPI sensor", "90-hour battery", "HyperSpeed Wireless"],
    isFeatured: false,
  },
  // Home & Kitchen
  {
    title: "Nespresso Vertuo Next Coffee Machine",
    description: "Centrifusion technology for perfect crema. 5 cup sizes from espresso to alto. One-touch brewing.",
    category: "Home & Kitchen",
    subcategory: "Coffee Machines",
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500",
    price: "149.00",
    originalPrice: "179.00",
    currency: "GBP",
    rating: "4.40",
    reviewCount: 8765,
    availability: "in_stock",
    stockQuantity: 80,
    brand: "Nespresso",
    features: ["Centrifusion technology", "5 cup sizes", "One-touch brewing", "Automatic capsule ejection"],
    isFeatured: true,
  },
  {
    title: "Dyson V15 Detect Cordless Vacuum",
    description: "Laser reveals microscopic dust. Piezo sensor counts and sizes particles. Up to 60 minutes run time.",
    category: "Home & Kitchen",
    subcategory: "Vacuum Cleaners",
    imageUrl: "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=500",
    price: "649.99",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 6234,
    availability: "in_stock",
    stockQuantity: 45,
    brand: "Dyson",
    features: ["Laser dust detection", "Piezo sensor", "60-min runtime", "HEPA filtration"],
    isFeatured: true,
  },
  {
    title: "Instant Pot Duo 7-in-1 Electric Pressure Cooker",
    description: "7 appliances in 1: pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker, and warmer.",
    category: "Home & Kitchen",
    subcategory: "Kitchen Appliances",
    imageUrl: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=500",
    price: "89.99",
    originalPrice: "109.99",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 45678,
    availability: "in_stock",
    stockQuantity: 200,
    brand: "Instant Pot",
    features: ["7-in-1 functionality", "6-quart capacity", "14 smart programs", "Dishwasher safe"],
    isFeatured: false,
  },
  // Fitness & Sports
  {
    title: "Apple Watch Series 9 GPS + Cellular",
    description: "Advanced health features including blood oxygen and ECG. Always-On Retina display. Carbon neutral.",
    category: "Fitness & Sports",
    subcategory: "Smart Watches",
    imageUrl: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500",
    price: "499.00",
    currency: "GBP",
    rating: "4.80",
    reviewCount: 12345,
    availability: "in_stock",
    stockQuantity: 100,
    brand: "Apple",
    features: ["Blood oxygen sensor", "ECG app", "Always-On display", "Crash Detection"],
    isFeatured: true,
  },
  {
    title: "Garmin Forerunner 965 Running Watch",
    description: "Brilliant AMOLED display. Advanced training metrics. Up to 23 days battery life.",
    category: "Fitness & Sports",
    subcategory: "Smart Watches",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500",
    price: "599.99",
    currency: "GBP",
    rating: "4.60",
    reviewCount: 3456,
    availability: "in_stock",
    stockQuantity: 60,
    brand: "Garmin",
    features: ["AMOLED display", "Training readiness", "23-day battery", "Full maps"],
    isFeatured: false,
  },
  {
    title: "Nike Air Zoom Pegasus 40 Running Shoes",
    description: "Responsive Zoom Air cushioning. Breathable mesh upper. Durable rubber outsole.",
    category: "Fitness & Sports",
    subcategory: "Running Shoes",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
    price: "114.95",
    currency: "GBP",
    rating: "4.50",
    reviewCount: 8765,
    availability: "in_stock",
    stockQuantity: 250,
    brand: "Nike",
    features: ["Zoom Air cushioning", "Breathable mesh", "Rubber outsole", "Flywire cables"],
    isFeatured: true,
  },
  {
    title: "Theragun Elite Massage Gun",
    description: "QuietForce Technology. 5 built-in speeds. OLED screen. 120-minute battery life.",
    category: "Fitness & Sports",
    subcategory: "Recovery Equipment",
    imageUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500",
    price: "375.00",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 4321,
    availability: "in_stock",
    stockQuantity: 40,
    brand: "Therabody",
    features: ["QuietForce Technology", "5 speeds", "OLED screen", "Bluetooth app"],
    isFeatured: false,
  },
  // Office & Furniture
  {
    title: "Herman Miller Aeron Chair",
    description: "Ergonomic design with PostureFit SL. 8Z Pellicle suspension. Fully adjustable arms.",
    category: "Office & Furniture",
    subcategory: "Office Chairs",
    imageUrl: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=500",
    price: "1329.00",
    currency: "GBP",
    rating: "4.80",
    reviewCount: 5678,
    availability: "in_stock",
    stockQuantity: 25,
    brand: "Herman Miller",
    features: ["PostureFit SL", "8Z Pellicle", "Adjustable arms", "12-year warranty"],
    isFeatured: true,
  },
  {
    title: "Secretlab Titan Evo Gaming Chair",
    description: "4-way L-ADAPT lumbar support. Magnetic memory foam head pillow. Cold-cure foam seat.",
    category: "Office & Furniture",
    subcategory: "Office Chairs",
    imageUrl: "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=500",
    price: "449.00",
    currency: "GBP",
    rating: "4.60",
    reviewCount: 9876,
    availability: "in_stock",
    stockQuantity: 70,
    brand: "Secretlab",
    features: ["4-way lumbar support", "Memory foam pillow", "Cold-cure foam", "5-year warranty"],
    isFeatured: false,
  },
  {
    title: "FlexiSpot E7 Standing Desk",
    description: "Dual motor lift system. Height range 58-123cm. Anti-collision technology.",
    category: "Office & Furniture",
    subcategory: "Desks",
    imageUrl: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=500",
    price: "499.99",
    currency: "GBP",
    rating: "4.50",
    reviewCount: 3456,
    availability: "in_stock",
    stockQuantity: 35,
    brand: "FlexiSpot",
    features: ["Dual motor", "58-123cm height", "Anti-collision", "4 memory presets"],
    isFeatured: true,
  },
  // Books & Media
  {
    title: "Kindle Paperwhite (16 GB)",
    description: "6.8-inch display with adjustable warm light. Waterproof design. Up to 10 weeks battery.",
    category: "Books & Media",
    subcategory: "E-Readers",
    imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500",
    price: "149.99",
    currency: "GBP",
    rating: "4.70",
    reviewCount: 34567,
    availability: "in_stock",
    stockQuantity: 180,
    brand: "Amazon",
    features: ["6.8-inch display", "Adjustable warm light", "IPX8 waterproof", "10-week battery"],
    isFeatured: true,
  },
  {
    title: "Sony WF-1000XM5 Wireless Earbuds",
    description: "Industry-leading noise cancellation in truly wireless. Dynamic Driver X. 8-hour battery.",
    category: "Electronics",
    subcategory: "Headphones",
    imageUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500",
    price: "259.00",
    currency: "GBP",
    rating: "4.60",
    reviewCount: 6789,
    availability: "in_stock",
    stockQuantity: 90,
    brand: "Sony",
    features: ["Noise cancellation", "Dynamic Driver X", "8-hour battery", "IPX4 water resistant"],
    isFeatured: false,
  },
];

async function seedProducts() {
  console.log("Connecting to database...");
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  console.log("Seeding products...");
  
  for (const product of sampleProducts) {
    try {
      await client.query(
        `INSERT INTO products ("title", "description", "category", "subcategory", "imageUrl", "price", "originalPrice", "currency", "rating", "reviewCount", "availability", "stockQuantity", "brand", "features", "isFeatured", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW(), NOW())`,
        [
          product.title,
          product.description,
          product.category,
          product.subcategory,
          product.imageUrl,
          product.price,
          product.originalPrice || null,
          product.currency,
          product.rating,
          product.reviewCount,
          product.availability,
          product.stockQuantity,
          product.brand,
          JSON.stringify(product.features),
          product.isFeatured,
        ]
      );
      console.log(`✓ Added: ${product.title}`);
    } catch (error) {
      console.error(`✗ Failed to add ${product.title}:`, error.message);
    }
  }
  
  // Create default ranking weights if not exists
  try {
    await client.query(
      `INSERT INTO ranking_weights ("name", "alpha", "beta", "gamma", "delta", "epsilon", "isActive", "createdAt", "updatedAt")
       VALUES ('default', '0.500', '0.200', '0.150', '0.100', '0.050', TRUE, NOW(), NOW())
       ON CONFLICT DO NOTHING`
    );
    console.log("✓ Created default ranking weights");
  } catch (error) {
    console.log("Ranking weights already exist");
  }
  
  await client.end();
  console.log("\nSeeding complete!");
}

seedProducts().catch(console.error);
