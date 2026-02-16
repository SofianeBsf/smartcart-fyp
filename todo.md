# SmartCart FYP - Project TODO

## PPRS Architecture Requirements (Completed)

### FastAPI Python AI Service
- [x] Create FastAPI service structure with async support
- [x] Implement Sentence-BERT embedding generation using sentence-transformers library
- [x] Create vector similarity search endpoint
- [x] Implement explainable re-ranking formula
- [x] Add "Why Suggested?" explanation generator
- [x] Create Swagger/OpenAPI documentation (auto-generated at /docs)

### PostgreSQL with pgvector
- [x] Setup PostgreSQL database schema (MySQL in hosted version, pgvector in Docker)
- [x] Create products table with vector embedding column
- [x] Implement cosine similarity search
- [x] Create indexes for fast vector retrieval

### Backend Orchestrator (tRPC - Alternative to NestJS)
- [x] Create tRPC project structure with type safety
- [x] Implement API gateway to route requests
- [x] Connect to FastAPI AI service via HTTP
- [x] Connect to database
- [x] Implement session management for recommendations
- [x] Create admin endpoints for catalog upload and weight adjustment

### Next.js Frontend
- [x] Update API calls to use backend
- [x] Maintain existing UI components
- [x] Ensure responsive design

### Redis + BullMQ (Docker Configuration Ready)
- [x] Docker configuration for Redis
- [ ] Runtime integration for search result caching (deferred)
- [ ] BullMQ job queue integration (deferred)

### Docker Containerization
- [x] Create Dockerfile for FastAPI AI service
- [x] Create Dockerfile for backend
- [x] Create Dockerfile for frontend
- [x] Create docker-compose.yml for full stack
- [x] Include PostgreSQL (pgvector) and Redis containers
- [x] Health checks for all services

## Core Features (From PPRS)

### Must Have
- [x] Semantic product search using natural-language queries
- [x] Vector embeddings with similarity retrieval
- [x] "Why Suggested?" explanations with matched terms and weighted factors
- [x] Detailed product information display (image, price, rating, availability)
- [x] Admin CSV catalog upload with automatic embedding generation
- [x] Graceful error handling

### Should Have
- [x] Session-based recommendations ("You may also like")
- [x] Admin ranking weight adjustment (α, β, γ, δ, ε)

### Could Have
- [x] Search query logging for evaluation
- [ ] Q&A chatbot for product questions (not implemented)

## Evaluation System
- [x] Search query logging
- [x] IR metrics calculation (nDCG@10, Recall@10, Precision@10, MRR)
- [x] Ranking explanation storage
- [x] Auto relevance judgments generation

## Non-Functional Requirements
- [x] Search responses < 500ms (achieved ~266ms with AI service)
- [ ] Handle 10,000+ products (needs testing with full dataset)
- [x] Responsive, accessible design
- [x] Clear "Why Suggested?" explanations
- [x] Docker containerization for reproducibility

## Documentation
- [x] README.md with architecture documentation
- [x] API documentation
- [x] Setup instructions
- [x] Unit tests for core functionality
