-- ==============================================================================
-- Migration 020: Add PDF RAG Documents & Passages
-- ==============================================================================
-- Implements Stage 1 of RAG: Document-level tracking, page-aware passage chunks,
-- and vector embeddings using pgvector (768 dimensions for gemini-embedding-001).
-- ==============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create pdf_documents table (document-level registry and ingestion status)
CREATE TABLE IF NOT EXISTS public.pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_hash TEXT NOT NULL UNIQUE, -- SHA-256 for cryptographic deduplication
  file_size_bytes BIGINT DEFAULT 0,
  total_pages INT NOT NULL DEFAULT 0,
  total_chunks INT NOT NULL DEFAULT 0,
  total_chars BIGINT NOT NULL DEFAULT 0,
  avg_chars_per_page NUMERIC(10,2) DEFAULT 0.0,
  ocr_needed BOOLEAN NOT NULL DEFAULT false,
  ocr_warning TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'SUCCESS'
    CHECK (extraction_status IN ('SUCCESS', 'OCR_REQUIRED', 'CORRUPTED', 'ENCRYPTED', 'EMPTY')),
  ingestion_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'processing', 'indexed', 'failed')),
  error_message TEXT,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  syllabus_topic_id UUID REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for pdf_documents
CREATE INDEX IF NOT EXISTS idx_pdf_docs_hash ON public.pdf_documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_status ON public.pdf_documents(ingestion_status);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_exam ON public.pdf_documents(exam_id);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_subject ON public.pdf_documents(subject_id);
CREATE INDEX IF NOT EXISTS idx_pdf_docs_topic ON public.pdf_documents(syllabus_topic_id);

-- 3. Create pdf_passages table (page-aware passage chunks + vector embeddings)
CREATE TABLE IF NOT EXISTS public.pdf_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.pdf_documents(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL, -- Stable deterministic chunk ID e.g. <doc_hash>_chk_<idx>
  chunk_index INT NOT NULL,
  passage_text TEXT NOT NULL,
  word_count INT NOT NULL DEFAULT 0,
  char_count INT NOT NULL DEFAULT 0,
  start_page INT NOT NULL,
  end_page INT NOT NULL,
  page_reference TEXT NOT NULL, -- "Page 4" or "Pages 4-5"
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  syllabus_topic_id UUID REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  embedding vector(768), -- Configured for gemini-embedding-001 (768 dimensions)
  embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
  embedding_dimensions INT NOT NULL DEFAULT 768,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for pdf_passages
CREATE INDEX IF NOT EXISTS idx_pdf_passages_doc ON public.pdf_passages(document_id);
CREATE INDEX IF NOT EXISTS idx_pdf_passages_chunk ON public.pdf_passages(chunk_id);
CREATE INDEX IF NOT EXISTS idx_pdf_passages_exam ON public.pdf_passages(exam_id);
CREATE INDEX IF NOT EXISTS idx_pdf_passages_subject ON public.pdf_passages(subject_id);
CREATE INDEX IF NOT EXISTS idx_pdf_passages_topic ON public.pdf_passages(syllabus_topic_id);

-- Full-text search index (English BM25) for hybrid retrieval preparedness
CREATE INDEX IF NOT EXISTS idx_pdf_passages_fts ON public.pdf_passages
  USING gin (to_tsvector('english', passage_text));

-- Vector similarity index (HNSW with cosine distance for semantic retrieval)
CREATE INDEX IF NOT EXISTS idx_pdf_passages_embedding ON public.pdf_passages
  USING hnsw (embedding vector_cosine_ops);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_passages ENABLE ROW LEVEL SECURITY;

-- Read policies: allow reading documents and passages
DROP POLICY IF EXISTS "Allow read access to pdf_documents" ON public.pdf_documents;
CREATE POLICY "Allow read access to pdf_documents"
  ON public.pdf_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow read access to pdf_passages" ON public.pdf_passages;
CREATE POLICY "Allow read access to pdf_passages"
  ON public.pdf_passages FOR SELECT
  USING (true);

-- Write policies: allow admin/moderator roles and service_role to manage documents
DROP POLICY IF EXISTS "Allow admin write access to pdf_documents" ON public.pdf_documents;
CREATE POLICY "Allow admin write access to pdf_documents"
  ON public.pdf_documents FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admin write access to pdf_passages" ON public.pdf_passages;
CREATE POLICY "Allow admin write access to pdf_passages"
  ON public.pdf_passages FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
