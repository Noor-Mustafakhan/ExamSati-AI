/**
 * ExamSathi AI - Server-Side RAG Document Service
 * Handles PDF document tracking, passage management, and indexing coordination.
 * Securely uses GEMINI_API_KEY from server/env.js.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadServerEnv, getGeminiApiKey, getGeminiConfigStatus } from './env.js';
import { createClient } from '@supabase/supabase-js';

loadServerEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const RAG_CONFIG = {
  embeddingModel: 'gemini-embedding-001',
  embeddingDimensions: 768,
  targetChunkWords: 380,
  overlapWords: 50,
};

/**
 * Calculates cryptographic SHA-256 hash of a file or buffer.
 */
export function calculateBufferSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Returns overall RAG service status and document metrics.
 */
export async function getRAGStatus() {
  const geminiStatus = getGeminiConfigStatus();

  let docsCount = 0;
  let passagesCount = 0;
  let statusBreakdown = { indexed: 0, pending: 0, processing: 0, failed: 0 };

  if (supabase) {
    try {
      const { data: docs, error: dErr } = await supabase
        .from('pdf_documents')
        .select('id, ingestion_status');

      if (!dErr && Array.isArray(docs)) {
        docsCount = docs.length;
        docs.forEach(d => {
          if (statusBreakdown[d.ingestion_status] !== undefined) {
            statusBreakdown[d.ingestion_status] += 1;
          }
        });
      }

      const { count, error: pErr } = await supabase
        .from('pdf_passages')
        .select('*', { count: 'exact', head: true });

      if (!pErr && typeof count === 'number') {
        passagesCount = count;
      }
    } catch (err) {
      console.warn('[RAG Service] Error loading status metrics:', err.message);
    }
  }

  return {
    status: 'online',
    ragEnabled: true,
    embeddingModel: RAG_CONFIG.embeddingModel,
    embeddingDimensions: RAG_CONFIG.embeddingDimensions,
    geminiConfigured: geminiStatus.configured,
    databaseConnected: Boolean(supabase),
    metrics: {
      totalDocuments: docsCount,
      totalPassages: passagesCount,
      statusBreakdown,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Lists ingested PDF documents with optional status filtering.
 */
export async function listDocuments({ status = null, limit = 50, offset = 0 } = {}) {
  if (!supabase) return [];

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
      metadata,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') {
    query = query.eq('ingestion_status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[RAG Service] listDocuments error:', error);
    throw error;
  }
  return data || [];
}

/**
 * Gets a single document by ID along with its passage chunks.
 */
export async function getDocumentById(id) {
  if (!supabase || !id) return null;

  const { data: doc, error: docErr } = await supabase
    .from('pdf_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (docErr) throw docErr;

  const { data: passages, error: passErr } = await supabase
    .from('pdf_passages')
    .select('id, chunk_id, chunk_index, passage_text, word_count, start_page, end_page, page_reference, created_at')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true });

  if (passErr) throw passErr;

  return {
    ...doc,
    passages: passages || [],
  };
}

/**
 * Executes Python RAG document indexer for a given file path.
 */
export async function executePythonIndexer({
  filePath,
  examId = null,
  subjectId = null,
  topicId = null,
  dryRun = false,
  force = false,
}) {
  return new Promise((resolve, reject) => {
    const rootDir = process.cwd();
    const pythonExe = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(rootDir, 'tools', 'rag_document_indexer.py');

    const args = [scriptPath, '--file', filePath];
    if (examId) args.push('--exam', examId);
    if (subjectId) args.push('--subject', subjectId);
    if (topicId) args.push('--topic', topicId);
    if (dryRun) args.push('--dry-run');
    if (force) args.push('--force');

    console.log(`[RAG Service] Spawning indexer: ${pythonExe} ${args.slice(1).join(' ')}`);

    const child = spawn(fs.existsSync(pythonExe) ? pythonExe : 'python', args, {
      cwd: rootDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('close', code => {
      if (code === 0) {
        resolve({
          success: true,
          stdout,
          stderr,
        });
      } else {
        resolve({
          success: false,
          code,
          error: stderr || stdout || `Process exited with code ${code}`,
        });
      }
    });

    child.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Retries processing for a failed document.
 */
export async function retryDocumentIngestion(id) {
  if (!supabase || !id) throw new Error('Missing document ID');

  const { data: doc, error } = await supabase
    .from('pdf_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !doc) throw new Error('Document not found');
  if (!doc.file_path || !fs.existsSync(doc.file_path)) {
    throw new Error(`Source PDF file not found at local path: ${doc.file_path}`);
  }

  return executePythonIndexer({
    filePath: doc.file_path,
    examId: doc.exam_id,
    subjectId: doc.subject_id,
    topicId: doc.syllabus_topic_id,
    force: true,
  });
}
