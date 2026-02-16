CREATE TABLE "catalog_upload_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"status" "status" DEFAULT 'pending' NOT NULL,
	"totalRows" integer DEFAULT 0,
	"processedRows" integer DEFAULT 0,
	"embeddedRows" integer DEFAULT 0,
	"errorMessage" text,
	"uploadedBy" integer,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metricType" "metricType" NOT NULL,
	"value" numeric(8, 6) NOT NULL,
	"queryCount" integer DEFAULT 0,
	"notes" text,
	"evaluatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"embedding" jsonb NOT NULL,
	"embeddingModel" varchar(100) DEFAULT 'all-MiniLM-L6-v2',
	"textUsed" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_embeddings_productId_unique" UNIQUE("productId")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"asin" varchar(20),
	"title" text NOT NULL,
	"description" text,
	"category" varchar(255),
	"subcategory" varchar(255),
	"imageUrl" text,
	"price" numeric(10, 2),
	"originalPrice" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'GBP',
	"rating" numeric(3, 2),
	"reviewCount" integer DEFAULT 0,
	"availability" "availability" DEFAULT 'in_stock',
	"stockQuantity" integer DEFAULT 100,
	"brand" varchar(255),
	"features" jsonb,
	"isFeatured" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_asin_unique" UNIQUE("asin")
);
--> statement-breakpoint
CREATE TABLE "ranking_weights" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) DEFAULT 'default' NOT NULL,
	"alpha" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"beta" numeric(4, 3) DEFAULT '0.200' NOT NULL,
	"gamma" numeric(4, 3) DEFAULT '0.150' NOT NULL,
	"delta" numeric(4, 3) DEFAULT '0.100' NOT NULL,
	"epsilon" numeric(4, 3) DEFAULT '0.050' NOT NULL,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"queryEmbedding" jsonb,
	"resultsCount" integer DEFAULT 0,
	"responseTimeMs" integer,
	"filters" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_result_explanations" (
	"id" serial PRIMARY KEY NOT NULL,
	"searchLogId" integer NOT NULL,
	"productId" integer NOT NULL,
	"position" integer NOT NULL,
	"finalScore" numeric(8, 6) NOT NULL,
	"semanticScore" numeric(8, 6) NOT NULL,
	"ratingScore" numeric(8, 6) NOT NULL,
	"priceScore" numeric(8, 6) NOT NULL,
	"stockScore" numeric(8, 6) NOT NULL,
	"recencyScore" numeric(8, 6) NOT NULL,
	"matchedTerms" jsonb,
	"explanation" text,
	"wasClicked" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"productId" integer NOT NULL,
	"interactionType" "interactionType" NOT NULL,
	"searchQuery" text,
	"position" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"userId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastActiveAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	CONSTRAINT "sessions_sessionId_unique" UNIQUE("sessionId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
