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

def get_model() -> SentenceTransformer:
    """Lazy load the Sentence-BERT model."""
    global _model
    if _model is None:
        logger.info("Loading Sentence-BERT model (all-MiniLM-L6-v2)...")
        start_time = time.time()
        _model = SentenceTransformer('all-MiniLM-L6-v2')
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


def calculate_scores(
    query_embedding: np.ndarray,
    product: Product,
    weights: RankingWeights,
    all_prices: List[float],
    query: str
) -> ScoreBreakdown:
    """Calculate all scoring components for a product."""
    
    # Semantic similarity score
    if product.embedding:
        product_embedding = np.array(product.embedding)
        semantic_score = cosine_similarity(query_embedding, product_embedding)
    else:
        semantic_score = 0.0
    
    # Keyword boost - boost products that contain query terms
    matched_terms = extract_matched_terms(query, product)
    keyword_boost = min(len(matched_terms) * 0.15, 0.5)  # Up to 0.5 boost
    semantic_score = min(semantic_score + keyword_boost, 1.0)
    
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
    
    # Recency score (placeholder - would use created_at in production)
    recency_score = 0.5
    
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
        "model_name": "all-MiniLM-L6-v2" if model_loaded else "not loaded"
    }


@app.post("/embed", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest):
    """Generate embedding for a single text."""
    try:
        model = get_model()
        embedding = model.encode(request.text, convert_to_numpy=True)
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            dimension=len(embedding)
        )
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/batch", response_model=BatchEmbeddingResponse)
async def generate_batch_embeddings(request: BatchEmbeddingRequest):
    """Generate embeddings for multiple texts."""
    try:
        model = get_model()
        embeddings = model.encode(request.texts, convert_to_numpy=True)
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
        model = get_model()
        weights = request.weights or RankingWeights()
        
        # Generate query embedding
        query_embedding = model.encode(request.query, convert_to_numpy=True)
        
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
        source_embedding = np.array(request.product_embedding)
        
        # Calculate similarity for each product
        similarities = []
        for product in request.products:
            if request.exclude_id and product.id == request.exclude_id:
                continue
            
            if product.embedding:
                product_embedding = np.array(product.embedding)
                similarity = cosine_similarity(source_embedding, product_embedding)
                similarities.append((product, similarity))
        
        # Sort by similarity descending
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        # Build results
        results = []
        for rank, (product, similarity) in enumerate(similarities[:request.limit], 1):
            breakdown = ScoreBreakdown(
                semantic_score=round(similarity, 4),
                rating_score=round((product.rating or 0) / 5.0, 4),
                price_score=0.5,
                stock_score=1.0 if product.availability == "in_stock" else 0.5,
                recency_score=0.5,
                final_score=round(similarity, 4),
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
        model = get_model()
        return {
            "status": "success",
            "message": "Model loaded successfully",
            "model_name": "all-MiniLM-L6-v2"
        }
    except Exception as e:
        logger.error(f"Error preloading model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
