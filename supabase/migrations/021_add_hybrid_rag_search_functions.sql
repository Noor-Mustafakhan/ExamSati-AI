-- ==============================================================================
-- Migration 021: Add Hybrid RAG Search Functions (Sparse, Dense, RRF Hybrid)
-- ==============================================================================
-- Implements Stage 2 of RAG:
-- 1. search_pdf_passages_sparse: PostgreSQL FTS using to_tsvector, websearch_to_tsquery, and GIN
-- 2. search_pdf_passages_dense: Cosine vector similarity search via pgvector (vector(768))
-- 3. search_pdf_passages_hybrid: Independent candidate retrieval combined with Reciprocal Rank Fusion (RRF)
-- ==============================================================================

-- 1. Sparse Search Function (PostgreSQL Full-Text Search)
CREATE OR REPLACE FUNCTION public.search_pdf_passages_sparse(
  query_text TEXT,
  filter_exam_id UUID DEFAULT NULL,
  filter_subject_id UUID DEFAULT NULL,
  filter_topic_id UUID DEFAULT NULL,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  passage_id UUID,
  document_id UUID,
  document_title TEXT,
  chunk_id TEXT,
  chunk_index INT,
  passage_text TEXT,
  word_count INT,
  start_page INT,
  end_page INT,
  page_reference TEXT,
  subject_id UUID,
  subject_name TEXT,
  syllabus_topic_id UUID,
  topic_title TEXT,
  exam_id UUID,
  exam_title TEXT,
  sparse_score FLOAT8,
  sparse_rank INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  parsed_query tsquery;
BEGIN
  -- Parse query safely using websearch_to_tsquery, fall back to plainto_tsquery if empty
  BEGIN
    parsed_query := websearch_to_tsquery('english', query_text);
  EXCEPTION WHEN OTHERS THEN
    parsed_query := plainto_tsquery('english', query_text);
  END;

  IF parsed_query IS NULL OR parsed_query = ''::tsquery THEN
    parsed_query := plainto_tsquery('english', query_text);
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT
      p.id AS passage_id,
      p.document_id,
      COALESCE(d.file_name, 'Unknown Document') AS document_title,
      p.chunk_id,
      p.chunk_index,
      p.passage_text,
      p.word_count,
      p.start_page,
      p.end_page,
      p.page_reference,
      p.subject_id,
      COALESCE(s.name, '') AS subject_name,
      p.syllabus_topic_id,
      COALESCE(t.topic_title, '') AS topic_title,
      p.exam_id,
      COALESCE(e.title, '') AS exam_title,
      ts_rank_cd(to_tsvector('english', p.passage_text), parsed_query)::FLOAT8 AS sparse_score
    FROM public.pdf_passages p
    JOIN public.pdf_documents d ON d.id = p.document_id
    LEFT JOIN public.subjects s ON s.id = p.subject_id
    LEFT JOIN public.syllabus_topics t ON t.id = p.syllabus_topic_id
    LEFT JOIN public.exams e ON e.id = p.exam_id
    WHERE to_tsvector('english', p.passage_text) @@ parsed_query
      AND (filter_exam_id IS NULL OR p.exam_id = filter_exam_id)
      AND (filter_subject_id IS NULL OR p.subject_id = filter_subject_id)
      AND (filter_topic_id IS NULL OR p.syllabus_topic_id = filter_topic_id)
  )
  SELECT
    m.passage_id,
    m.document_id,
    m.document_title,
    m.chunk_id,
    m.chunk_index,
    m.passage_text,
    m.word_count,
    m.start_page,
    m.end_page,
    m.page_reference,
    m.subject_id,
    m.subject_name,
    m.syllabus_topic_id,
    m.topic_title,
    m.exam_id,
    m.exam_title,
    m.sparse_score,
    ROW_NUMBER() OVER (ORDER BY m.sparse_score DESC)::INT AS sparse_rank
  FROM matches m
  ORDER BY m.sparse_score DESC
  LIMIT match_count;
END;
$$;


-- 2. Dense Search Function (Supabase pgvector Cosine Distance Search)
CREATE OR REPLACE FUNCTION public.search_pdf_passages_dense(
  query_embedding vector(768),
  filter_exam_id UUID DEFAULT NULL,
  filter_subject_id UUID DEFAULT NULL,
  filter_topic_id UUID DEFAULT NULL,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  passage_id UUID,
  document_id UUID,
  document_title TEXT,
  chunk_id TEXT,
  chunk_index INT,
  passage_text TEXT,
  word_count INT,
  start_page INT,
  end_page INT,
  page_reference TEXT,
  subject_id UUID,
  subject_name TEXT,
  syllabus_topic_id UUID,
  topic_title TEXT,
  exam_id UUID,
  exam_title TEXT,
  dense_score FLOAT8,
  dense_rank INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  WITH matches AS (
    SELECT
      p.id AS passage_id,
      p.document_id,
      COALESCE(d.file_name, 'Unknown Document') AS document_title,
      p.chunk_id,
      p.chunk_index,
      p.passage_text,
      p.word_count,
      p.start_page,
      p.end_page,
      p.page_reference,
      p.subject_id,
      COALESCE(s.name, '') AS subject_name,
      p.syllabus_topic_id,
      COALESCE(t.topic_title, '') AS topic_title,
      p.exam_id,
      COALESCE(e.title, '') AS exam_title,
      (1 - (p.embedding <=> query_embedding))::FLOAT8 AS dense_score,
      p.embedding <=> query_embedding AS raw_distance
    FROM public.pdf_passages p
    JOIN public.pdf_documents d ON d.id = p.document_id
    LEFT JOIN public.subjects s ON s.id = p.subject_id
    LEFT JOIN public.syllabus_topics t ON t.id = p.syllabus_topic_id
    LEFT JOIN public.exams e ON e.id = p.exam_id
    WHERE p.embedding IS NOT NULL
      AND (filter_exam_id IS NULL OR p.exam_id = filter_exam_id)
      AND (filter_subject_id IS NULL OR p.subject_id = filter_subject_id)
      AND (filter_topic_id IS NULL OR p.syllabus_topic_id = filter_topic_id)
  )
  SELECT
    m.passage_id,
    m.document_id,
    m.document_title,
    m.chunk_id,
    m.chunk_index,
    m.passage_text,
    m.word_count,
    m.start_page,
    m.end_page,
    m.page_reference,
    m.subject_id,
    m.subject_name,
    m.syllabus_topic_id,
    m.topic_title,
    m.exam_id,
    m.exam_title,
    m.dense_score,
    ROW_NUMBER() OVER (ORDER BY m.raw_distance ASC)::INT AS dense_rank
  FROM matches m
  ORDER BY m.raw_distance ASC
  LIMIT match_count;
END;
$$;


-- 3. Hybrid Search Function (Reciprocal Rank Fusion - RRF)
CREATE OR REPLACE FUNCTION public.search_pdf_passages_hybrid(
  query_text TEXT,
  query_embedding vector(768),
  filter_exam_id UUID DEFAULT NULL,
  filter_subject_id UUID DEFAULT NULL,
  filter_topic_id UUID DEFAULT NULL,
  sparse_weight FLOAT8 DEFAULT 1.0,
  dense_weight FLOAT8 DEFAULT 1.0,
  candidate_count INT DEFAULT 10,
  match_count INT DEFAULT 5,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  passage_id UUID,
  document_id UUID,
  document_title TEXT,
  chunk_id TEXT,
  chunk_index INT,
  passage_text TEXT,
  word_count INT,
  start_page INT,
  end_page INT,
  page_reference TEXT,
  subject_id UUID,
  subject_name TEXT,
  syllabus_topic_id UUID,
  topic_title TEXT,
  exam_id UUID,
  exam_title TEXT,
  sparse_rank INT,
  dense_rank INT,
  sparse_score FLOAT8,
  dense_score FLOAT8,
  rrf_score FLOAT8,
  combined_rank INT,
  retrieval_method TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  WITH sparse_res AS (
    SELECT *
    FROM public.search_pdf_passages_sparse(
      query_text,
      filter_exam_id,
      filter_subject_id,
      filter_topic_id,
      candidate_count
    )
  ),
  dense_res AS (
    SELECT *
    FROM public.search_pdf_passages_dense(
      query_embedding,
      filter_exam_id,
      filter_subject_id,
      filter_topic_id,
      candidate_count
    )
  ),
  combined AS (
    SELECT
      COALESCE(s.passage_id, d.passage_id) AS passage_id,
      COALESCE(s.document_id, d.document_id) AS document_id,
      COALESCE(s.document_title, d.document_title) AS document_title,
      COALESCE(s.chunk_id, d.chunk_id) AS chunk_id,
      COALESCE(s.chunk_index, d.chunk_index) AS chunk_index,
      COALESCE(s.passage_text, d.passage_text) AS passage_text,
      COALESCE(s.word_count, d.word_count) AS word_count,
      COALESCE(s.start_page, d.start_page) AS start_page,
      COALESCE(s.end_page, d.end_page) AS end_page,
      COALESCE(s.page_reference, d.page_reference) AS page_reference,
      COALESCE(s.subject_id, d.subject_id) AS subject_id,
      COALESCE(s.subject_name, d.subject_name) AS subject_name,
      COALESCE(s.syllabus_topic_id, d.syllabus_topic_id) AS syllabus_topic_id,
      COALESCE(s.topic_title, d.topic_title) AS topic_title,
      COALESCE(s.exam_id, d.exam_id) AS exam_id,
      COALESCE(s.exam_title, d.exam_title) AS exam_title,
      s.sparse_rank,
      d.dense_rank,
      s.sparse_score,
      d.dense_score,
      (
        COALESCE(sparse_weight / (rrf_k + s.sparse_rank), 0.0::FLOAT8) +
        COALESCE(dense_weight / (rrf_k + d.dense_rank), 0.0::FLOAT8)
      )::FLOAT8 AS rrf_score,
      CASE
        WHEN s.sparse_rank IS NOT NULL AND d.dense_rank IS NOT NULL THEN 'both'
        WHEN s.sparse_rank IS NOT NULL THEN 'sparse_only'
        ELSE 'dense_only'
      END AS retrieval_method
    FROM sparse_res s
    FULL OUTER JOIN dense_res d ON s.passage_id = d.passage_id
  )
  SELECT
    c.passage_id,
    c.document_id,
    c.document_title,
    c.chunk_id,
    c.chunk_index,
    c.passage_text,
    c.word_count,
    c.start_page,
    c.end_page,
    c.page_reference,
    c.subject_id,
    c.subject_name,
    c.syllabus_topic_id,
    c.topic_title,
    c.exam_id,
    c.exam_title,
    c.sparse_rank,
    c.dense_rank,
    c.sparse_score,
    c.dense_score,
    c.rrf_score,
    ROW_NUMBER() OVER (ORDER BY c.rrf_score DESC)::INT AS combined_rank,
    c.retrieval_method
  FROM combined c
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.search_pdf_passages_sparse TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.search_pdf_passages_dense TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.search_pdf_passages_hybrid TO authenticated, anon, service_role;
