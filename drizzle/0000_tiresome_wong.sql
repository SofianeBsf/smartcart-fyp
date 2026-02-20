CREATE TABLE "catalog_upload_jobs" (
    "id" serial PRIMARY KEY NOT NULL,
    "filename" varchar(255) NOT NULL,
    "status" "status" DEFAULT 'pending' NOT NULL,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    embedded_rows integer DEFAULT 0,
    error_message text,
    uploaded_by integer,
    started_at timestamp,
    completed_at timestamp,
    created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_metrics" (
    "id" serial PRIMARY KEY NOT NULL,
    metric_type metric_type NOT NULL,
    "value" numeric(8, 6) NOT NULL,
    query_count integer DEFAULT 0,
    "notes" text,
    evaluated_at timestamp DEFAULT now() NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_embeddings" (
    "id" serial PRIMARY KEY NOT NULL,
    product_id integer NOT NULL,
    embedding jsonb NOT NULL,
    embedding_model varchar(100) DEFAULT 'all-MiniLM-L6-v2',
    text_used text,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT product_embeddings_product_id_unique UNIQUE(product_id)
);
--> statement-breakpoint
CREATE TABLE "products" (
    "id" serial PRIMARY KEY NOT NULL,
    "asin" varchar(20),
    "title" text NOT NULL,
    "description" text,
    "category" varchar(255),
    "subcategory" varchar(255),
    image_url text,
    price numeric(10, 2),
    original_price numeric(10, 2),
    "currency" varchar(10) DEFAULT 'GBP',
    "rating" numeric(3, 2),
    review_count integer DEFAULT 0,
    "availability" "availability" DEFAULT 'in_stock',
    stock_quantity integer DEFAULT 100,
    "brand" varchar(255),
    "features" jsonb,
    is_featured boolean DEFAULT false,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT products_asin_unique UNIQUE("asin")
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
    is_active boolean DEFAULT true,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
    "id" serial PRIMARY KEY NOT NULL,
    session_id varchar(64) NOT NULL,
    "query" text NOT NULL,
    query_embedding jsonb,
    results_count integer DEFAULT 0,
    response_time_ms integer,
    "filters" jsonb,
    created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_result_explanations" (
    "id" serial PRIMARY KEY NOT NULL,
    search_log_id integer NOT NULL,
    product_id integer NOT NULL,
    "position" integer NOT NULL,
    final_score numeric(8, 6) NOT NULL,
    semantic_score numeric(8, 6) NOT NULL,
    rating_score numeric(8, 6) NOT NULL,
    price_score numeric(8, 6) NOT NULL,
    stock_score numeric(8, 6) NOT NULL,
    recency_score numeric(8, 6) NOT NULL,
    matched_terms jsonb,
    "explanation" text,
    was_clicked boolean DEFAULT false,
    created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_interactions" (
    "id" serial PRIMARY KEY NOT NULL,
    session_id varchar(64) NOT NULL,
    product_id integer NOT NULL,
    interaction_type interaction_type NOT NULL,
    search_query text,
    "position" integer,
    created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    session_id varchar(64) NOT NULL,
    user_id integer,
    created_at timestamp DEFAULT now() NOT NULL,
    last_active_at timestamp DEFAULT now() NOT NULL,
    expires_at timestamp NOT NULL,
    CONSTRAINT sessions_session_id_unique UNIQUE(session_id)
);
--> statement-breakpoint
CREATE TABLE "users" (
    "id" serial PRIMARY KEY NOT NULL,
    open_id varchar(64) NOT NULL,
    "name" text,
    "email" varchar(320),
    login_method varchar(64),
    "role" "role" DEFAULT 'user' NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    last_signed_in timestamp DEFAULT now() NOT NULL,
    CONSTRAINT users_open_id_unique UNIQUE(open_id)
);
