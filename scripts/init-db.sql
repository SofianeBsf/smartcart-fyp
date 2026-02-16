-- SmartCart Database Initialization Script
-- Creates the pgvector extension and initial schema

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Products table with vector embedding column
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    asin VARCHAR(20) UNIQUE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(255),
    subcategory VARCHAR(255),
    brand VARCHAR(255),
    image_url TEXT,
    price DECIMAL(10, 2),
    original_price DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'GBP',
    rating DECIMAL(3, 2),
    review_count INTEGER DEFAULT 0,
    availability VARCHAR(50) DEFAULT 'in_stock',
    stock_quantity INTEGER DEFAULT 100,
    features JSONB,
    is_featured BOOLEAN DEFAULT FALSE,
    embedding vector(384),  -- Sentence-BERT all-MiniLM-L6-v2 produces 384-dim vectors
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for vector similarity search (IVFFlat for faster queries)
CREATE INDEX IF NOT EXISTS products_embedding_idx ON products 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Sessions table for anonymous user tracking
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- User interactions for session-based recommendations
CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    product_id INTEGER REFERENCES products(id),
    interaction_type VARCHAR(50) NOT NULL,  -- view, click, search_click, add_to_cart, purchase
    search_query TEXT,
    position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS interactions_session_idx ON interactions(session_id);
CREATE INDEX IF NOT EXISTS interactions_product_idx ON interactions(product_id);

-- Ranking weights for explainable AI formula
CREATE TABLE IF NOT EXISTS ranking_weights (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    alpha DECIMAL(5, 4) DEFAULT 0.5,    -- Semantic similarity weight
    beta DECIMAL(5, 4) DEFAULT 0.2,     -- Rating weight
    gamma DECIMAL(5, 4) DEFAULT 0.15,   -- Price weight
    delta DECIMAL(5, 4) DEFAULT 0.1,    -- Stock availability weight
    epsilon DECIMAL(5, 4) DEFAULT 0.05, -- Recency weight
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default weights
INSERT INTO ranking_weights (name, alpha, beta, gamma, delta, epsilon, is_active)
VALUES ('default', 0.5, 0.2, 0.15, 0.1, 0.05, TRUE)
ON CONFLICT DO NOTHING;

-- Search logs for evaluation and IR metrics
CREATE TABLE IF NOT EXISTS search_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64),
    query TEXT NOT NULL,
    query_embedding vector(384),
    results_count INTEGER,
    response_time_ms INTEGER,
    filters JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS search_logs_session_idx ON search_logs(session_id);
CREATE INDEX IF NOT EXISTS search_logs_created_idx ON search_logs(created_at);

-- Search result explanations for evaluation
CREATE TABLE IF NOT EXISTS search_result_explanations (
    id SERIAL PRIMARY KEY,
    search_log_id INTEGER REFERENCES search_logs(id),
    product_id INTEGER REFERENCES products(id),
    position INTEGER,
    final_score DECIMAL(10, 6),
    semantic_score DECIMAL(10, 6),
    rating_score DECIMAL(10, 6),
    price_score DECIMAL(10, 6),
    stock_score DECIMAL(10, 6),
    recency_score DECIMAL(10, 6),
    matched_terms TEXT[],
    explanation TEXT
);

CREATE INDEX IF NOT EXISTS explanations_search_idx ON search_result_explanations(search_log_id);

-- Evaluation metrics storage
CREATE TABLE IF NOT EXISTS evaluation_metrics (
    id SERIAL PRIMARY KEY,
    search_log_id INTEGER REFERENCES search_logs(id),
    metric_type VARCHAR(50) NOT NULL,  -- ndcg@10, recall@10, precision@10, mrr
    metric_value DECIMAL(10, 6),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Catalog upload jobs for tracking CSV imports
CREATE TABLE IF NOT EXISTS catalog_upload_jobs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, embedding, completed, failed
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for products table
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO smartcart;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO smartcart;
