"""
SmartCart AI Service - FastAPI
Provides semantic search capabilities using Sentence-BERT embeddings.

This service handles:
- Generating embeddings for products using sentence-transformers
- Computing cosine similarity for semantic search
- Generating explainable ranking scores
- Providing "Why Suggested?" explanations
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
from sentence_transformers import SentenceTransformer
import logging
from functools import lru_cache
from datetime import datetime, timezone
import math
import os
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SmartCart AI Service",
    description="Semantic search and explainable AI for e-commerce",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance (loaded lazily)
_model: Optional[SentenceTransformer] = None

# Model configuration — BAAI/bge-small-en-v1.5 is a stronger retrieval model than
# all-MiniLM-L6-v2 at the same embedding dimension (384) and CPU footprint.
# Override with MODEL_NAME env var if needed (e.g., for offline eval).
MODEL_NAME = os.environ.get("MODEL_NAME", "BAAI/bge-small-en-v1.5")

# BGE models expect a query prefix for asymmetric retrieval.
# See https://huggingface.co/BAAI/bge-small-en-v1.5
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# Per-model embedding cache (survives across requests). Keyed by product id.
# Cleared via /admin/clear-cache.
_embedding_cache: Dict[int, np.ndarray] = {}


def _is_bge_model(name: str) -> bool:
    return name.lower().startswith("baai/bge")


def encode_query(text: str) -> np.ndarray:
    """Encode a search query, applying the BGE prefix if needed."""
    model = get_model()
    if _is_bge_model(MODEL_NAME):
        text = BGE_QUERY_PREFIX + text
    return model.encode(text, convert_to_numpy=True, normalize_embeddings=True)


def encode_passage(text: str) -> np.ndarray:
    """Encode a passage/product text (no prefix)."""
    model = get_model()
    return model.encode(text, convert_to_numpy=True, normalize_embeddings=True)


def get_model() -> SentenceTransformer:
    """Lazy load the Sentence-BERT model."""
    global _model
    if _model is None:
        logger.info(f"Loading embedding model ({MODEL_NAME})...")
        start_time = time.time()
        _model = SentenceTransformer(MODEL_NAME)
        logger.info(f"Model loaded in {time.time() - start_time:.2f}s")
    return _model


# ==================== Pydantic Models ====================

class EmbeddingRequest(BaseModel):
    """Request to generate embedding for text."""
    text: str

class EmbeddingResponse(BaseModel):
    """Response containing the embedding vector."""
    embedding: List[float]
    dimension: int

class BatchEmbeddingRequest(BaseModel):
    """Request to generate embeddings for multiple texts."""
    texts: List[str]

class BatchEmbeddingResponse(BaseModel):
    """Response containing multiple embedding vectors."""
    embeddings: List[List[float]]
    dimension: int
    count: int

class Product(BaseModel):
    """Product data for search."""
    id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    availability: Optional[str] = None
    stock_quantity: Optional[int] = None
    embedding: Optional[List[float]] = None
    created_at: Optional[str] = None

class RankingWeights(BaseModel):
    """Weights for the explainable ranking formula."""
    alpha: float = 0.5   # Semantic similarity weight
    beta: float = 0.2    # Rating weight
    gamma: float = 0.15  # Price weight (lower is better)
    delta: float = 0.1   # Stock availability weight
    epsilon: float = 0.05  # Recency weight

class SemanticSearchRequest(BaseModel):
    """Request for semantic search."""
    query: str
    products: List[Product]
    weights: Optional[RankingWeights] = None
    limit: int = 20
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    category: Optional[str] = None

class ScoreBreakdown(BaseModel):
    """Breakdown of scoring factors for explainability."""
    semantic_score: float
    rating_score: float
    price_score: float
    stock_score: float
    recency_score: float
    final_score: float
    matched_terms: List[str]
    explanation: str

class SearchResult(BaseModel):
    """A single search result with explainability."""
    product: Product
    score_breakdown: ScoreBreakdown
    rank: int

class SemanticSearchResponse(BaseModel):
    """Response from semantic search."""
    results: List[SearchResult]
    query: str
    query_embedding: List[float]
    total_results: int
    response_time_ms: int

class SimilarProductsRequest(BaseModel):
    """Request for similar products."""
    product_embedding: List[float]
    products: List[Product]
    exclude_id: Optional[int] = None
    limit: int = 5

class SimilarProductsResponse(BaseModel):
    """Response with similar products."""
    similar_products: List[SearchResult]


# ==================== Helper Functions ====================

def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    if vec1.shape != vec2.shape:
        logger.warning(f"Vector dimension mismatch: {vec1.shape} vs {vec2.shape}")
        return 0.0
    
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(np.dot(vec1, vec2) / (norm1 * norm2))


def extract_matched_terms(query: str, product: Product) -> List[str]:
    """Extract terms from query that match in product text."""
    query_terms = set(query.lower().split())
    product_text = f"{product.title} {product.description or ''} {product.category or ''}".lower()
    
    matched = []
    for term in query_terms:
        if len(term) > 2 and term in product_text:
            matched.append(term)
    
    return matched


def generate_explanation(
    product: Product,
    breakdown: Dict[str, float],
    matched_terms: List[str]
) -> str:
    """Generate human-readable explanation for why a product was suggested."""
    parts = []
    
    # Matched terms
    if matched_terms:
        parts.append(f"Matches: {', '.join(matched_terms)}")
    
    # Rating explanation
    if product.rating and product.rating >= 4.5:
        parts.append(f"Highly rated ({product.rating:.1f}★)")
    elif product.rating and product.rating >= 4.0:
        parts.append(f"Well rated ({product.rating:.1f}★)")
    
    # Price explanation
    if breakdown.get('price_score', 0) > 0.7:
        parts.append("Great value")
    elif breakdown.get('price_score', 0) > 0.5:
        parts.append("Good price")
    
    # Stock explanation
    if product.availability == "in_stock":
        parts.append("In stock")
    elif product.availability == "low_stock":
        parts.append("Limited stock")
    
    # Semantic match
    if breakdown.get('semantic_score', 0) > 0.8:
        parts.append("Strong semantic match")
    elif breakdown.get('semantic_score', 0) > 0.6:
        parts.append("Good semantic match")
    
    return " • ".join(parts) if parts else "Relevant to your search"


def _compute_recency_score(created_at: Optional[str]) -> float:
    """Compute a recency score in [0, 1] from a product's created_at ISO timestamp.

    Uses exponential decay with a half-life of 180 days, so a brand-new product
    gets ~1.0 and a product added 6 months ago gets ~0.5. Products older than
    ~2 years asymptote toward 0. Missing timestamps get a neutral 0.5.
    """
    if not created_at:
        return 0.5
    try:
        # Support both naive ISO and 'Z' suffix
        ts = created_at.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age_days = max(0.0, (now - dt).total_seconds() / 86400.0)
        half_life_days = 180.0
        score = math.exp(-math.log(2) * age_days / half_life_days)
        return float(max(0.0, min(1.0, score)))
    except Exception as e:
        logger.debug(f"Failed to parse created_at '{created_at}': {e}")
        return 0.5


def _get_or_build_product_embedding(product: Product) -> np.ndarray:
    """Return the product embedding, generating & caching it if missing."""
    # If the DB sent a precomputed embedding, trust it (normalized downstream).
    if product.embedding:
        vec = np.asarray(product.embedding, dtype=np.float32)
        # Normalize in case the DB stored an un-normalized vector
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    # In-memory cache keyed by product id (per-model lifetime)
    cached = _embedding_cache.get(product.id)
    if cached is not None:
        return cached

    product_text = " ".join(filter(None, [
        product.title,
        product.description or "",
        product.category or "",
    ])).strip()
    vec = encode_passage(product_text)
    _embedding_cache[product.id] = vec
    return vec


def calculate_scores(
    query_embedding: np.ndarray,
    product: Product,
    weights: RankingWeights,
    all_prices: List[float],
    query: str
) -> ScoreBreakdown:
    """Calculate all scoring components for a product.

    This is a PURE dense-retrieval score for the semantic component — no
    keyword boosting. Keyword matches are only surfaced in the explanation and
    `matched_terms` so the UI can highlight them, but they do NOT move the
    ranking. This keeps the dissertation claim honest: the α term reflects
    semantic similarity, not lexical overlap.
    """

    # --- Semantic similarity (pure cosine on normalized embeddings) ---
    product_embedding = _get_or_build_product_embedding(product)
    # Embeddings are normalized so cosine == dot product, but we keep the
    # safe helper in case an un-normalized vector slips through.
    raw_sim = cosine_similarity(query_embedding, product_embedding)
    # BGE cosines typically land in [0.2, 0.85]. Keep the raw value (clamped
    # to [0, 1]) rather than rescaling from [-1, 1]: the linear rescale
    # compresses the discriminative range so much that rating/price/stock
    # terms can easily beat semantic relevance. Clamping to [0, 1] preserves
    # the full ~0.65 spread between unrelated and highly-related products.
    semantic_score = max(0.0, min(1.0, raw_sim))

    # Matched terms are informational only (not added to the score).
    matched_terms = extract_matched_terms(query, product)

    # Rating score (normalized 0-1)
    rating_score = (product.rating or 0) / 5.0

    # Price score (lower is better, normalized)
    if all_prices and product.price:
        max_price = max(all_prices) if all_prices else 1
        min_price = min(all_prices) if all_prices else 0
        price_range = max_price - min_price
        if price_range > 0:
            price_score = 1 - ((product.price - min_price) / price_range)
        else:
            price_score = 1.0
    else:
        price_score = 0.5

    # Stock score
    stock_map = {"in_stock": 1.0, "low_stock": 0.5, "out_of_stock": 0.0}
    stock_score = stock_map.get(product.availability or "in_stock", 0.5)

    # Recency score: exponential decay on created_at (half-life 180d).
    recency_score = _compute_recency_score(product.created_at)
    
    # Calculate final weighted score
    final_score = (
        weights.alpha * semantic_score +
        weights.beta * rating_score +
        weights.gamma * price_score +
        weights.delta * stock_score +
        weights.epsilon * recency_score
    )
    
    breakdown = {
        'semantic_score': semantic_score,
        'rating_score': rating_score,
        'price_score': price_score,
        'stock_score': stock_score,
        'recency_score': recency_score,
    }
    
    explanation = generate_explanation(product, breakdown, matched_terms)
    
    return ScoreBreakdown(
        semantic_score=round(semantic_score, 4),
        rating_score=round(rating_score, 4),
        price_score=round(price_score, 4),
        stock_score=round(stock_score, 4),
        recency_score=round(recency_score, 4),
        final_score=round(final_score, 4),
        matched_terms=matched_terms,
        explanation=explanation
    )


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "SmartCart AI Service",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    model_loaded = _model is not None
    return {
        "status": "healthy",
        "model_loaded": model_loaded,
        "model_name": MODEL_NAME if model_loaded else "not loaded",
        "embedding_cache_size": len(_embedding_cache),
    }


class EmbeddingCheckRequest(BaseModel):
    """Request to sanity-check a set of stored embeddings."""
    samples: List[Dict[str, Any]]  # each: { id, text, embedding }


@app.post("/admin/embedding-health")
async def embedding_health(request: EmbeddingCheckRequest):
    """Diagnose whether stored product embeddings come from the current
    embedding model (BGE) or from a stale/different model (e.g. the old
    TF-IDF hash vectors that used to poison the table).

    For each sample we re-embed the product text with the live BGE model
    and compute cosine similarity against the stored vector. If the live
    model matches what produced the stored vector, cosine should be ~1.0.
    A cosine near 0 means the vectors are from completely different spaces
    (classic TF-IDF-vs-BGE), which is the signature of a broken regeneration.
    """
    try:
        results = []
        for sample in request.samples:
            stored = sample.get("embedding")
            text = sample.get("text", "")
            pid = sample.get("id")
            if not stored or not text:
                results.append({
                    "id": pid,
                    "cosine_to_fresh": None,
                    "status": "missing_data",
                })
                continue

            stored_vec = np.asarray(stored, dtype=np.float32)
            s_norm = np.linalg.norm(stored_vec)
            if s_norm == 0:
                results.append({
                    "id": pid,
                    "cosine_to_fresh": 0.0,
                    "status": "stored_zero_vector",
                })
                continue
            stored_vec = stored_vec / s_norm

            fresh = encode_passage(text)
            cos = float(np.dot(stored_vec, fresh))
            if cos >= 0.95:
                status = "ok_bge"
            elif cos >= 0.5:
                status = "suspicious_partial_match"
            else:
                status = "mismatch_different_model"
            results.append({
                "id": pid,
                "cosine_to_fresh": round(cos, 4),
                "status": status,
                "stored_dim": len(stored),
                "fresh_dim": int(fresh.shape[0]),
            })

        # Aggregate verdict
        oks = sum(1 for r in results if r.get("status") == "ok_bge")
        total = len(results)
        verdict = (
            "healthy" if oks == total and total > 0
            else "broken" if oks == 0
            else "mixed"
        )
        return {
            "model_name": MODEL_NAME,
            "verdict": verdict,
            "ok_count": oks,
            "total": total,
            "samples": results,
        }
    except Exception as e:
        logger.error(f"Error in embedding-health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/clear-cache")
async def clear_cache():
    """Clear the in-memory product-embedding cache used by /search fallback.

    This does NOT evict the loaded model (reloading a 130MB model is wasteful).
    It only flushes the product-embedding dict so that the next search
    recomputes embeddings for products without a precomputed one.
    """
    size = len(_embedding_cache)
    _embedding_cache.clear()
    return {
        "status": "success",
        "cleared_entries": size,
        "model_name": MODEL_NAME,
    }


@app.post("/embed", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest):
    """Generate embedding for a single text (passage, no query prefix).

    Use this for products / documents. For search queries use `/embed/query`
    so the BGE query prefix is applied — mixing the two breaks retrieval.
    """
    try:
        embedding = encode_passage(request.text)
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            dimension=len(embedding)
        )
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/query", response_model=EmbeddingResponse)
async def generate_query_embedding(request: EmbeddingRequest):
    """Generate embedding for a SEARCH QUERY.

    For BGE models this prepends the required query prefix
    ("Represent this sentence for searching relevant passages: ") so the
    resulting vector lives in the same space the model expects to compare
    against passage vectors. Using `/embed` for queries silently degrades
    retrieval quality — always use this endpoint for user queries.
    """
    try:
        embedding = encode_query(request.text)
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            dimension=len(embedding)
        )
    except Exception as e:
        logger.error(f"Error generating query embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/batch", response_model=BatchEmbeddingResponse)
async def generate_batch_embeddings(request: BatchEmbeddingRequest):
    """Generate embeddings for multiple texts (passages, no query prefix)."""
    try:
        model = get_model()
        embeddings = model.encode(
            request.texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return BatchEmbeddingResponse(
            embeddings=[emb.tolist() for emb in embeddings],
            dimension=embeddings.shape[1] if len(embeddings) > 0 else 0,
            count=len(embeddings)
        )
    except Exception as e:
        logger.error(f"Error generating batch embeddings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(request: SemanticSearchRequest):
    """
    Perform semantic search with explainable ranking.
    
    The ranking formula is:
    Score = α×Semantic + β×Rating + γ×Price + δ×Stock + ε×Recency
    
    Where:
    - α (alpha): Weight for semantic similarity (default 0.5)
    - β (beta): Weight for product rating (default 0.2)
    - γ (gamma): Weight for price competitiveness (default 0.15)
    - δ (delta): Weight for stock availability (default 0.1)
    - ε (epsilon): Weight for recency (default 0.05)
    """
    start_time = time.time()

    try:
        weights = request.weights or RankingWeights()

        # Generate query embedding (with BGE prefix if applicable, normalized)
        query_embedding = encode_query(request.query)
        
        # Filter products
        filtered_products = request.products
        
        if request.category:
            filtered_products = [
                p for p in filtered_products 
                if p.category and request.category.lower() in p.category.lower()
            ]
        
        if request.min_price is not None:
            filtered_products = [
                p for p in filtered_products 
                if p.price and p.price >= request.min_price
            ]
        
        if request.max_price is not None:
            filtered_products = [
                p for p in filtered_products 
                if p.price and p.price <= request.max_price
            ]
        
        # Get all prices for normalization
        all_prices = [p.price for p in filtered_products if p.price]
        
        # Calculate scores for each product
        scored_products = []
        for product in filtered_products:
            score_breakdown = calculate_scores(
                query_embedding, product, weights, all_prices, request.query
            )
            scored_products.append((product, score_breakdown))
        
        # Sort by final score descending
        scored_products.sort(key=lambda x: x[1].final_score, reverse=True)
        
        # Build results
        results = []
        for rank, (product, breakdown) in enumerate(scored_products[:request.limit], 1):
            results.append(SearchResult(
                product=product,
                score_breakdown=breakdown,
                rank=rank
            ))
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        return SemanticSearchResponse(
            results=results,
            query=request.query,
            query_embedding=query_embedding.tolist(),
            total_results=len(results),
            response_time_ms=response_time_ms
        )
        
    except Exception as e:
        logger.error(f"Error in semantic search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/similar", response_model=SimilarProductsResponse)
async def find_similar_products(request: SimilarProductsRequest):
    """Find products similar to a given product embedding."""
    try:
        source_embedding = np.array(request.product_embedding, dtype=np.float32)
        src_norm = np.linalg.norm(source_embedding)
        if src_norm > 0:
            source_embedding = source_embedding / src_norm

        # Calculate similarity for each product
        similarities = []
        for product in request.products:
            if request.exclude_id and product.id == request.exclude_id:
                continue

            product_embedding = _get_or_build_product_embedding(product)
            similarity = cosine_similarity(source_embedding, product_embedding)
            similarities.append((product, similarity))
        
        # Sort by similarity descending
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        # Build results
        results = []
        for rank, (product, similarity) in enumerate(similarities[:request.limit], 1):
            normalized_sim = max(0.0, min(1.0, similarity))
            breakdown = ScoreBreakdown(
                semantic_score=round(normalized_sim, 4),
                rating_score=round((product.rating or 0) / 5.0, 4),
                price_score=0.5,
                stock_score=1.0 if product.availability == "in_stock" else 0.5,
                recency_score=round(_compute_recency_score(product.created_at), 4),
                final_score=round(normalized_sim, 4),
                matched_terms=[],
                explanation="Similar to viewed product"
            )
            results.append(SearchResult(
                product=product,
                score_breakdown=breakdown,
                rank=rank
            ))
        
        return SimilarProductsResponse(similar_products=results)
        
    except Exception as e:
        logger.error(f"Error finding similar products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/preload-model")
async def preload_model():
    """Preload the Sentence-BERT model."""
    try:
        get_model()
        return {
            "status": "success",
            "message": "Model loaded successfully",
            "model_name": MODEL_NAME,
        }
    except Exception as e:
        logger.error(f"Error preloading model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
