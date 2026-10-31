import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase.js';
import { calculateBufferSha256, RAG_CONFIG, getRAGStatus } from '../server/ragDocumentService.js';

describe('Stage 1 RAG Document Ingestion & Storage Test Suite', () => {

  it('1. Verifies RAG configuration parameters match gemini-embedding-001 (768d)', async () => {
    assert.equal(RAG_CONFIG.embeddingModel, 'gemini-embedding-001', 'Must use gemini-embedding-001 model');
    assert.equal(RAG_CONFIG.embeddingDimensions, 768, 'Must use 768 dimensions for PostgreSQL vector');
    assert.ok(RAG_CONFIG.targetChunkWords >= 300 && RAG_CONFIG.targetChunkWords <= 500, 'Target chunk size in 300-500 word range');
    assert.ok(RAG_CONFIG.overlapWords >= 40 && RAG_CONFIG.overlapWords <= 60, 'Overlap in ~50 words range');
  });

  it('2. Cryptographic SHA-256 calculation produces valid 64-char hex digest', () => {
    const sampleBuffer = Buffer.from('ExamSathi AI Sample Curriculum Notes for Competitive Exams', 'utf8');
    const hash = calculateBufferSha256(sampleBuffer);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);

    // Idempotency: same content yields same hash
    const hash2 = calculateBufferSha256(sampleBuffer);
    assert.equal(hash, hash2, 'SHA-256 calculation must be deterministic');
  });

  it('3. Verifies RAG status returns online and reports database connectivity', async () => {
    const status = await getRAGStatus();
    assert.equal(status.status, 'online');
    assert.equal(status.embeddingModel, 'gemini-embedding-001');
    assert.equal(status.embeddingDimensions, 768);
    assert.ok(typeof status.metrics === 'object');
    assert.ok(typeof status.metrics.totalDocuments === 'number');
    assert.ok(typeof status.metrics.totalPassages === 'number');
  });

  it('4. Queries pdf_documents and pdf_passages tables in Supabase without schema errors', async () => {
    if (!isSupabaseConfigured) {
      console.log('Skipping live Supabase query (credentials not configured)');
      return;
    }

    // Verify pdf_documents table exists and can be queried
    const { data: docs, error: docErr } = await supabase
      .from('pdf_documents')
      .select('id, file_name, file_hash, ingestion_status')
      .limit(5);

    assert.equal(docErr, null, `pdf_documents query must succeed: ${docErr?.message}`);
    assert.ok(Array.isArray(docs), 'pdf_documents query should return an array');

    // Verify pdf_passages table exists and can be queried
    const { data: passages, error: passErr } = await supabase
      .from('pdf_passages')
      .select('id, chunk_id, chunk_index, page_reference, word_count, embedding_model, embedding_dimensions')
      .limit(5);

    assert.equal(passErr, null, `pdf_passages query must succeed: ${passErr?.message}`);
    assert.ok(Array.isArray(passages), 'pdf_passages query should return an array');
  });

  it('5. Verifies safe insertion of document and passage record with cascade deletion test', async () => {
    if (!isSupabaseConfigured) return;

    const testHash = 'test_' + Date.now().toString(16) + Math.random().toString(16).slice(2, 8).padEnd(50, '0').slice(0, 59);

    // 1. Insert test document
    const { data: newDoc, error: insertErr } = await supabase
      .from('pdf_documents')
      .insert({
        file_name: 'test_pipeline_document.pdf',
        file_hash: testHash,
        file_size_bytes: 12345,
        total_pages: 2,
        total_chunks: 1,
        total_chars: 500,
        avg_chars_per_page: 250.0,
        ocr_needed: false,
        extraction_status: 'SUCCESS',
        ingestion_status: 'indexed',
        metadata: { test: true }
      })
      .select()
      .single();

    assert.equal(insertErr, null, `Insert test doc error: ${insertErr?.message}`);
    assert.ok(newDoc?.id, 'Created document must have a UUID');

    // 2. Insert test passage linked to document
    const mockEmbedding = Array(768).fill(0.01);
    const { data: newPassage, error: passErr } = await supabase
      .from('pdf_passages')
      .insert({
        document_id: newDoc.id,
        chunk_id: `${testHash.slice(0, 12)}_chk_1`,
        chunk_index: 1,
        passage_text: 'Test passage text for operating systems process scheduling.',
        word_count: 8,
        char_count: 59,
        start_page: 1,
        end_page: 1,
        page_reference: 'Page 1',
        embedding: mockEmbedding,
        embedding_model: 'gemini-embedding-001',
        embedding_dimensions: 768,
        metadata: { test: true }
      })
      .select()
      .single();

    assert.equal(passErr, null, `Insert test passage error: ${passErr?.message}`);
    assert.ok(newPassage?.id, 'Created passage must have a UUID');
    assert.equal(newPassage.page_reference, 'Page 1');

    // 3. Clean up: Delete test document (cascades to test passage)
    const { error: delErr } = await supabase
      .from('pdf_documents')
      .delete()
      .eq('id', newDoc.id);

    assert.equal(delErr, null, `Delete test doc error: ${delErr?.message}`);

    // Verify cascade deleted the passage
    const { data: orphanCheck } = await supabase
      .from('pdf_passages')
      .select('id')
      .eq('document_id', newDoc.id);

    assert.equal(orphanCheck?.length || 0, 0, 'Passages must be cascade-deleted with document');
  });

});
