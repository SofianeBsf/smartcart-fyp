import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_NAME = 'BAAI/bge-small-en-v1.5';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const LRU_MAX_SIZE = 200;

// ---------------------------------------------------------------------------
// Lazy singleton pipeline
// ---------------------------------------------------------------------------
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      console.log(`[localEmbedding] Loading model ${MODEL_NAME}...`);
      env.allowLocalModels = true;
      const extractor = await pipeline('feature-extraction', MODEL_NAME, {
        dtype: 'fp32',
      });
      console.log(`[localEmbedding] Model ${MODEL_NAME} loaded successfully.`);
      return extractor;
    })();
  }
  return extractorPromise;
}

// ---------------------------------------------------------------------------
// Simple LRU cache for query embeddings
// ---------------------------------------------------------------------------
class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry)
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const queryCache = new LRUCache<string, number[]>(LRU_MAX_SIZE);

// ---------------------------------------------------------------------------
// Core embedding helper
// ---------------------------------------------------------------------------
async function embed(texts: string | string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const result = await extractor(texts, { pooling: 'cls', normalize: true });
  return result.tolist() as number[][];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an embedding for a passage / product text (no prefix).
 */
export async function generatePassageEmbedding(text: string): Promise<number[]> {
  const [vector] = await embed(text);
  return vector;
}

/**
 * Generate an embedding for a search query.
 * Prepends the BGE query prefix and caches the result.
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const cached = queryCache.get(text);
  if (cached) {
    return cached;
  }

  const prefixed = `${QUERY_PREFIX}${text}`;
  const [vector] = await embed(prefixed);
  queryCache.set(text, vector);
  return vector;
}

/**
 * Generate embeddings for multiple passages in a single batch call.
 */
export async function generateBatchPassageEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return embed(texts);
}

/**
 * Check whether the embedding model can be loaded and is operational.
 */
export async function checkHealth(): Promise<{ healthy: boolean; model_name: string }> {
  try {
    await getExtractor();
    return { healthy: true, model_name: MODEL_NAME };
  } catch {
    return { healthy: false, model_name: MODEL_NAME };
  }
}

/**
 * Force the model to load now instead of waiting for the first embedding call.
 */
export async function preloadModel(): Promise<void> {
  await getExtractor();
}

/**
 * Return the name of the embedding model in use.
 */
export function getModelName(): string {
  return MODEL_NAME;
}
