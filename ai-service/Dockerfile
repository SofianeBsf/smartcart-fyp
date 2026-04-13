# SmartCart AI Service Dockerfile
# Python FastAPI + BAAI/bge-small-en-v1.5 for semantic embeddings

FROM python:3.11-slim

WORKDIR /app

# System deps for building numpy/torch wheels
RUN apt-get update && apt-get install -y \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the BGE model during build so first request is instant
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
