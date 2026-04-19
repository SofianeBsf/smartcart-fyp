# SmartCart: Explainable Semantic Search and Session-Based Recommendation System

A Final Year Project (FYP) implementing an AI-powered e-commerce search and recommendation platform with explainable AI features.

## Project Overview

SmartCart addresses the limitations of traditional keyword-based search engines by implementing:

- **Semantic Search**: Uses Sentence-BERT embeddings to understand the meaning behind user queries
- **Explainable AI**: Shows users "Why Suggested?" explanations for each search result
- **Session-Based Recommendations**: Provides personalized suggestions without requiring login
- **Transparent Ranking**: Weighted formula (α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│                    (React + Vite)                               │
│                      Port: 3000                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend (tRPC + Express + Transformers.js)          │
│              Local BGE Embeddings · Port: 3000                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Neon)                              │
│                      pgvector                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React + Vite + TypeScript + Tailwind | User interface |
| Backend | tRPC + Express | API orchestration |
| Embeddings | Transformers.js (BAAI/bge-small-en-v1.5) | 384-dim local embeddings |
| Database | PostgreSQL + pgvector (Neon) | Vector similarity search |
| Container | Docker + Docker Compose | Local development |

## Features

### Core Features (Must Have)
- ✅ Semantic product search using natural-language queries
- ✅ Vector embeddings with pgvector similarity retrieval
- ✅ "Why Suggested?" explanations with matched terms and weighted factors
- ✅ Detailed product information display
- ✅ Admin CSV catalog upload with automatic embedding generation
- ✅ Graceful error handling

### Extended Features (Should Have)
- ✅ Session-based recommendations ("You may also like")
- ✅ Admin ranking weight adjustment (α, β, γ, δ, ε)

### Evaluation Features (Could Have)
- ✅ Search query logging for evaluation
- ✅ IR metrics calculation (nDCG@10, Recall@10, Precision@10, MRR)
- ✅ Ranking explanation storage

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 22+ (for local development)
- Python 3.11+ (for AI service development)

### Using Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd smartcart-fyp

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access the application
# Frontend: http://localhost:3000
# AI Service Docs: http://localhost:8000/docs
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start the database (requires Docker)
docker-compose up -d postgres

# Start the main application
pnpm dev

# Run tests
pnpm test
```

## API Endpoints

### Search API
- `POST /api/trpc/search.semantic` - Semantic search with explainable ranking

### Admin API
- `POST /api/trpc/admin.catalog.upload` - Upload product catalog
- `POST /api/trpc/admin.weights.update` - Update ranking weights
- `GET /api/trpc/admin.stats` - Get system statistics

## Ranking Formula

The explainable ranking formula is:

```
Score = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency
```

Where:
- **α (alpha)**: Semantic similarity weight (default: 0.5)
- **β (beta)**: Product rating weight (default: 0.2)
- **γ (gamma)**: Price competitiveness weight (default: 0.15)
- **δ (delta)**: Stock availability weight (default: 0.1)
- **ε (epsilon)**: Recency weight (default: 0.05)

## Evaluation Metrics

The system supports standard Information Retrieval metrics:
- **nDCG@10**: Normalized Discounted Cumulative Gain
- **Recall@10**: Fraction of relevant items retrieved
- **Precision@10**: Fraction of retrieved items that are relevant
- **MRR**: Mean Reciprocal Rank

## Project Structure

```
smartcart-fyp/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   └── lib/             # Utilities and tRPC client
├── server/                  # Backend server
│   ├── routers.ts           # tRPC routers
│   ├── db.ts                # Database queries
│   ├── semanticSearch.ts    # Search logic
│   ├── recommendations.ts   # Recommendation engine
│   ├── aiService.ts         # Local embedding service
│   ├── localEmbedding.ts    # Transformers.js BGE model
│   └── irMetrics.ts         # IR metrics calculation
├── drizzle/                 # Database schema
├── scripts/                 # Utility scripts
├── docker-compose.yml       # Docker orchestration
└── README.md                # This file
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test server/semanticSearch.test.ts

# Run with coverage
pnpm test --coverage
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `BUILT_IN_FORGE_API_URL` | Gemini API endpoint | - |
| `BUILT_IN_FORGE_API_KEY` | Gemini API key | - |
| `BASE_URL` | Frontend URL for email links | http://localhost:3000 |

## License

This project is developed as part of the BSc Computer Science Final Year Project at the University of Westminster.

## Author

**Sofiane Boussouf** (w2064559)  
Supervisor: Kosmas Kosmopoulos  
University of Westminster, 2025
