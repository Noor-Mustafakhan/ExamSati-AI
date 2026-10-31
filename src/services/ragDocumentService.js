/**
 * ExamSathi AI - Client-Side RAG Document Service
 * Interacts with /api/rag/* endpoints and Supabase for document ingestion,
 * passage tracking, and RAG status.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const ragDocumentService = {
  /**
   * Retrieves overall RAG status and embedding configuration.
   */
  async getStatus() {
    try {
      const res = await fetch('/api/rag/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Could not fetch /api/rag/status, falling back to local client status:', err.message);
      return {
        status: 'online',
        ragEnabled: true,
        embeddingModel: 'gemini-embedding-001',
        embeddingDimensions: 768,
        databaseConnected: isSupabaseConfigured,
        metrics: { totalDocuments: 0, totalPassages: 0, statusBreakdown: {} }
      };
    }
  },

  /**
   * Fetches the list of ingested PDF documents from Supabase.
   */
  async getDocuments({ status = null, limit = 50, offset = 0 } = {}) {
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('pdf_documents')
          .select(`
            id,
            file_name,
            file_path,
            file_hash,
            file_size_bytes,
            total_pages,
            total_chunks,
            avg_chars_per_page,
            ocr_needed,
            ocr_warning,
            extraction_status,
            ingestion_status,
            error_message,
            exam_id,
            subject_id,
            syllabus_topic_id,
            created_at,
            updated_at
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status && status !== 'all') {
          query = query.eq('ingestion_status', status);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data;
        }
      } catch (err) {
        console.warn('Direct Supabase document fetch failed, using server API fallback:', err.message);
      }
    }

    // Server API fallback
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const res = await fetch(`/api/rag/documents?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to list documents: HTTP ${res.status}`);
    const body = await res.json();
    return body.documents || [];
  },

  /**
   * Fetches a single document and its passage chunks.
   */
  async getDocument(id) {
    const res = await fetch(`/api/rag/documents/${id}`);
    if (!res.ok) throw new Error(`Failed to get document ${id}: HTTP ${res.status}`);
    const body = await res.json();
    return body.document;
  },

  /**
   * Ingests a PDF document by path.
   */
  async ingestDocument({ filePath, examId = null, subjectId = null, topicId = null, dryRun = false, force = false }) {
    const res = await fetch('/api/rag/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, examId, subjectId, topicId, dryRun, force })
    });

    const data = await res.json();
    if (!res.ok && !data.success) {
      throw new Error(data.error || `Ingestion failed (HTTP ${res.status})`);
    }
    return data;
  },

  /**
   * Retries ingestion for a failed document.
   */
  async retryDocument(id) {
    const res = await fetch(`/api/rag/retry/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (!res.ok && !data.success) {
      throw new Error(data.error || `Retry failed (HTTP ${res.status})`);
    }
    return data;
  }
};
