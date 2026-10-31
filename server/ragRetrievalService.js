/**
 * ExamSathi AI - Stage 2: Server-Side Hybrid RAG Retrieval Service
 * ===============================================================
 * Combines PostgreSQL Full-Text Search (Sparse BM25) and
 * Supabase pgvector (Dense Semantic Search) via Reciprocal Rank Fusion (RRF).
 *
 * Principles:
 * 1. Independent candidate retrieval: Sparse and Dense run independently.
 * 2. Configurable RRF parameters: candidate count, match count, weights, k.
 * 3. Exact metadata traceability: Document title, original page reference,
 *    subject, topic, and exam profile filters preserved.
 * 4. Never fabricates page numbers, rankings, or similarity scores.
 */

import { loadServerEnv, getGeminiApiKey } from './env.js';
import { createClient } from '@supabase/supabase-js';

loadServerEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const RETRIEVAL_CONFIG = {
  embeddingModel: 'gemini-embedding-001',
  embeddingDimensions: 768,
  defaultCandidateCount: 10,
  defaultMatchCount: 5,
  defaultSparseWeight: 1.0,
  defaultDenseWeight: 1.0,
  defaultRrfK: 60,
};

/**
 * Generates a 768-dimensional query embedding via official gemini-embedding-001.
 */
export async function generateQueryEmbedding(queryText) {
  if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
    throw new Error('Search query must be a non-empty string.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Dense retrieval requires an active API key.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${RETRIEVAL_CONFIG.embeddingModel}:embedContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: {
        parts: [{ text: queryText.trim() }],
      },
      outputDimensionality: RETRIEVAL_CONFIG.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Embedding API Error (HTTP ${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Malformed embedding response from Gemini API.');
  }

  return values;
}

/**
 * Resilient retry wrapper for database RPC calls to withstand transient socket closures.
 */
async function callWithRetry(fn, retries = 3, delayMs = 600) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fn();
      if (res?.error && /fetch failed|socket|econnreset|und_err_socket|other side closed/i.test(res.error.message || '')) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (/fetch failed|socket|econnreset|und_err_socket|other side closed/i.test(err.message || '')) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt));
          continue;
        }
      }
      throw err;
    }
  }
  return fn();
}

/**
 * Executes Sparse Retrieval (PostgreSQL full-text search with to_tsvector & websearch_to_tsquery).
 */
export async function retrieveSparse({
  query,
  examId = null,
  subjectId = null,
  topicId = null,
  candidateCount = RETRIEVAL_CONFIG.defaultCandidateCount,
}) {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await callWithRetry(() =>
    supabase.rpc('search_pdf_passages_sparse', {
      query_text: query,
      filter_exam_id: examId || null,
      filter_subject_id: subjectId || null,
      filter_topic_id: topicId || null,
      match_count: candidateCount,
    })
  );

  if (error) {
    console.error('[RAG Retrieval] Sparse search RPC error:', error);
    throw new Error(`Sparse search error: ${error.message}`);
  }

  return (data || []).map((row, idx) => ({
    ...row,
    sparse_rank: row.sparse_rank || idx + 1,
  }));
}

/**
 * Executes Dense Retrieval (Supabase pgvector cosine similarity search).
 */
export async function retrieveDense({
  queryEmbedding,
  examId = null,
  subjectId = null,
  topicId = null,
  candidateCount = RETRIEVAL_CONFIG.defaultCandidateCount,
}) {
  if (!supabase) throw new Error('Supabase client is not configured.');
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== RETRIEVAL_CONFIG.embeddingDimensions) {
    throw new Error(`Dense search requires a valid ${RETRIEVAL_CONFIG.embeddingDimensions}-dimensional vector.`);
  }

  const { data, error } = await callWithRetry(() =>
    supabase.rpc('search_pdf_passages_dense', {
      query_embedding: queryEmbedding,
      filter_exam_id: examId || null,
      filter_subject_id: subjectId || null,
      filter_topic_id: topicId || null,
      match_count: candidateCount,
    })
  );

  if (error) {
    console.error('[RAG Retrieval] Dense search RPC error:', error);
    throw new Error(`Dense search error: ${error.message}`);
  }

  return (data || []).map((row, idx) => ({
    ...row,
    dense_rank: row.dense_rank || idx + 1,
  }));
}

/**
 * Combines sparse candidates and dense candidates using Reciprocal Rank Fusion (RRF).
 * Formula: RRF_Score(d) = w_sparse * (1 / (k + rank_sparse)) + w_dense * (1 / (k + rank_dense))
 */
export function fuseWithRRF({
  sparseCandidates = [],
  denseCandidates = [],
  sparseWeight = 1.0,
  denseWeight = 1.0,
  rrfK = 60,
  matchCount = 5,
}) {
  const map = new Map();

  // Process sparse candidates
  sparseCandidates.forEach((item, idx) => {
    const rank = item.sparse_rank || idx + 1;
    const key = item.passage_id;
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        sparse_rank: rank,
        dense_rank: null,
        dense_score: null,
      });
    } else {
      const existing = map.get(key);
      existing.sparse_rank = rank;
      existing.sparse_score = item.sparse_score;
    }
  });

  // Process dense candidates
  denseCandidates.forEach((item, idx) => {
    const rank = item.dense_rank || idx + 1;
    const key = item.passage_id;
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        sparse_rank: null,
        sparse_score: null,
        dense_rank: rank,
      });
    } else {
      const existing = map.get(key);
      existing.dense_rank = rank;
      existing.dense_score = item.dense_score;
    }
  });

  // Calculate RRF scores
  const combined = Array.from(map.values()).map(doc => {
    const sparseContribution = doc.sparse_rank
      ? sparseWeight / (rrfK + doc.sparse_rank)
      : 0;
    const denseContribution = doc.dense_rank
      ? denseWeight / (rrfK + doc.dense_rank)
      : 0;

    const rrfScore = Number((sparseContribution + denseContribution).toFixed(6));

    let method = 'dense_only';
    let explanation = '';
    if (doc.sparse_rank && doc.dense_rank) {
      method = 'both';
      explanation = `Validated by both keyword matches (Rank #${doc.sparse_rank}) and semantic similarity (Rank #${doc.dense_rank}).`;
    } else if (doc.sparse_rank) {
      method = 'sparse_only';
      explanation = `Found via exact technical term / full-text search match (Rank #${doc.sparse_rank}).`;
    } else {
      method = 'dense_only';
      explanation = `Found via semantic conceptual similarity (Rank #${doc.dense_rank}, score: ${doc.dense_score?.toFixed(3) || 'N/A'}).`;
    }

    return {
      ...doc,
      rrf_score: rrfScore,
      retrieval_method: method,
      relevance_explanation: explanation,
    };
  });

  // Sort descending by RRF score
  combined.sort((a, b) => b.rrf_score - a.rrf_score);

  // Take top matchCount and assign combined_rank
  return combined.slice(0, matchCount).map((doc, idx) => ({
    ...doc,
    combined_rank: idx + 1,
  }));
}

/**
 * Main Hybrid Retrieval Function:
 * 1. Generates query embedding
 * 2. Runs sparse and dense searches independently
 * 3. Merges via Reciprocal Rank Fusion (RRF)
 * 4. Returns comprehensive, traceable results
 */
export async function retrieveHybridPassages({
  query,
  examId = null,
  subjectId = null,
  topicId = null,
  difficulty = null,
  candidateCount = RETRIEVAL_CONFIG.defaultCandidateCount,
  matchCount = RETRIEVAL_CONFIG.defaultMatchCount,
  sparseWeight = RETRIEVAL_CONFIG.defaultSparseWeight,
  denseWeight = RETRIEVAL_CONFIG.defaultDenseWeight,
  rrfK = RETRIEVAL_CONFIG.defaultRrfK,
}) {
  const t0 = Date.now();

  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('A valid non-empty search query is required.');
  }

  // 1. Generate query embedding
  const tEmbStart = Date.now();
  let queryEmbedding = null;
  let embeddingError = null;

  try {
    queryEmbedding = await generateQueryEmbedding(query);
  } catch (err) {
    console.warn('[RAG Retrieval] Query embedding generation failed:', err.message);
    embeddingError = err.message;
  }
  const tEmbEnd = Date.now();

  // 2. Run Sparse Search
  const tSparseStart = Date.now();
  let sparseCandidates = [];
  try {
    sparseCandidates = await retrieveSparse({
      query,
      examId,
      subjectId,
      topicId,
      candidateCount,
    });
  } catch (err) {
    console.warn('[RAG Retrieval] Sparse candidate search failed:', err.message);
  }
  const tSparseEnd = Date.now();

  // 3. Run Dense Search (if embedding succeeded)
  const tDenseStart = Date.now();
  let denseCandidates = [];
  if (queryEmbedding) {
    try {
      denseCandidates = await retrieveDense({
        queryEmbedding,
        examId,
        subjectId,
        topicId,
        candidateCount,
      });
    } catch (err) {
      console.warn('[RAG Retrieval] Dense candidate search failed:', err.message);
    }
  }
  const tDenseEnd = Date.now();

  // 4. Combine via Reciprocal Rank Fusion (RRF)
  const hybridResults = fuseWithRRF({
    sparseCandidates,
    denseCandidates,
    sparseWeight,
    denseWeight,
    rrfK,
    matchCount,
  });

  const totalTimeMs = Date.now() - t0;

  return {
    query,
    filters: {
      examId,
      subjectId,
      topicId,
      difficulty,
    },
    params: {
      candidateCount,
      matchCount,
      sparseWeight,
      denseWeight,
      rrfK,
    },
    timings: {
      embeddingMs: tEmbEnd - tEmbStart,
      sparseSearchMs: tSparseEnd - tSparseStart,
      denseSearchMs: tDenseEnd - tDenseStart,
      totalMs: totalTimeMs,
    },
    diagnostics: {
      embeddingGenerated: Boolean(queryEmbedding),
      embeddingError,
      sparseCandidatesCount: sparseCandidates.length,
      denseCandidatesCount: denseCandidates.length,
      hybridMatchesCount: hybridResults.length,
    },
    sparseCandidates,
    denseCandidates,
    hybridResults,
  };
}
