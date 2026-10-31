/**
 * Vite Dev Server & Preview Plugin for ExamSathi FPSC API
 * Intercepts /api/* requests and serves server-side retrieval, parsing, and AI tutor endpoints.
 */
import { fetchFpscDocument, getAllArchivalSnapshots, importManualDocument } from './fpscRetrievalService.js';
import { answerStudentQuery, CURRENT_GEMINI_MODEL } from './aiTutorEngine.js';
import { getGeminiConfigStatus, getGroqConfigStatus, loadServerEnv } from './env.js';
import {
  getCurrentOpenJobs,
  getUpcomingJobs,
  getArchivedJobs,
  getAllJobs,
  getJobByIdOrCaseNumber,
  updateJobStatusByAdmin,
  recalculateAllJobStatuses,
  getSchedulerStatus,
} from './jobManagementService.js';
import {
  getRAGStatus,
  listDocuments,
  getDocumentById,
  executePythonIndexer,
  retryDocumentIngestion,
} from './ragDocumentService.js';
import { retrieveHybridPassages } from './ragRetrievalService.js';
import { generateAndIngestGroundedMCQ, generateGroundedMCQBatch } from './ragMcqGeneratorService.js';

loadServerEnv();

// In-Memory IP Rate Limiter for AI Study Buddy & Retrieval endpoints
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests / minute

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(ip, record);
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count += 1;
  rateLimitMap.set(ip, record);
  return true;
}

export function fpscApiPlugin() {
  return {
    name: 'fpsc-api-plugin',
    configureServer(server) {
      server.middlewares.use(handleApiRequests);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApiRequests);
    },
  };
}

async function handleApiRequests(req, res, next) {
  if (!req.url.startsWith('/api/')) {
    return next();
  }

  // Parse URL
  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  // Set JSON headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    // 1. GET /api/fpsc/status
    if (pathname === '/api/fpsc/status' && req.method === 'GET') {
      const geminiStatus = getGeminiConfigStatus();
      const groqStatus = getGroqConfigStatus();
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'online',
          service: 'ExamSathi FPSC Live Retrieval & AI Engine',
          targetDomain: 'fpsc.gov.pk',
          activeLLMProvider: groqStatus.configured ? 'GroqCloud (LPU)' : 'Google Gemini Flash',
          groqConfigured: groqStatus.configured,
          groqModel: groqStatus.model,
          geminiConfigured: geminiStatus.configured,
          geminiModel: CURRENT_GEMINI_MODEL,
          searchGroundingEnabled: true,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 2. GET /api/fpsc/jobs
    if (pathname === '/api/fpsc/jobs' && req.method === 'GET') {
      const q = (urlObj.searchParams.get('q') || '').toLowerCase();
      const category = urlObj.searchParams.get('category') || 'All';
      const statusParam = (urlObj.searchParams.get('status') || 'open').toLowerCase();

      let jobsResult = [];
      if (statusParam === 'open' || statusParam === 'current') {
        jobsResult = getCurrentOpenJobs({ query: q, category });
      } else if (statusParam === 'upcoming') {
        jobsResult = getUpcomingJobs({ query: q, category });
      } else if (statusParam === 'archived' || statusParam === 'expired') {
        jobsResult = getArchivedJobs({ query: q, category });
      } else {
        jobsResult = getAllJobs({ status: statusParam === 'all' ? undefined : statusParam, query: q, category });
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          count: jobsResult.length,
          data: jobsResult,
          statusFilter: statusParam,
          source: 'Federal Public Service Commission Official Publications',
          retrievalTimestamp: new Date().toISOString(),
          timezone: 'Asia/Karachi',
        })
      );
      return;
    }

    // 3. GET /api/fpsc/jobs/:id
    if (pathname.startsWith('/api/fpsc/jobs/') && req.method === 'GET') {
      const jobId = decodeURIComponent(pathname.replace('/api/fpsc/jobs/', ''));
      const job = getJobByIdOrCaseNumber(jobId);

      if (!job) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'FPSC Advertisement not found.' }));
        return;
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ data: job }));
      return;
    }

    // 3b. GET /api/fpsc/scheduler-status
    if (pathname === '/api/fpsc/scheduler-status' && req.method === 'GET') {
      const diag = getSchedulerStatus();
      res.statusCode = 200;
      res.end(JSON.stringify({ data: diag }));
      return;
    }

    // 3c. POST /api/admin/jobs/status (Admin status correction)
    if (pathname === '/api/admin/jobs/status' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { jobId, newStatus, reason, adminUser } = body;

      if (!jobId || !newStatus) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'jobId and newStatus are required.' }));
        return;
      }

      try {
        const updated = updateJobStatusByAdmin({ jobId, newStatus, reason, adminUser });
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: updated }));
      } catch (adminErr) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: adminErr.message }));
      }
      return;
    }

    // 3d. POST /api/admin/jobs/refresh (Admin trigger status recalculation)
    if (pathname === '/api/admin/jobs/refresh' && req.method === 'POST') {
      const result = recalculateAllJobStatuses();
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, result }));
      return;
    }

    // 4. POST /api/fpsc/retrieve (Safe Server-Side Document Fetching)
    if (pathname === '/api/fpsc/retrieve' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const targetUrl = body.url;

      if (!targetUrl) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'URL parameter is required.' }));
        return;
      }

      const doc = await fetchFpscDocument(targetUrl);
      res.statusCode = 200;
      res.end(JSON.stringify({ data: doc }));
      return;
    }

    // 5. POST /api/ai-tutor/chat (Grounded AI Study Buddy with rate limiting)
    if (pathname === '/api/ai-tutor/chat' && req.method === 'POST') {
      const clientIp = req.socket?.remoteAddress || '127.0.0.1';
      if (!checkRateLimit(clientIp)) {
        res.statusCode = 429;
        res.end(
          JSON.stringify({
            error: 'Query rate limit reached (30 queries/minute). Please wait a moment to avoid server overload.',
          })
        );
        return;
      }

      const body = await parseJsonBody(req);
      const query = body.query;
      const conversationHistory = body.conversationHistory || [];
      const language = body.language || 'auto';

      if (!query || !query.trim()) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Query parameter is required.' }));
        return;
      }

      try {
        const result = await answerStudentQuery({ query, conversationHistory, language });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[AI Tutor Chat Error]:', err?.message || err);
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: 'AI Study Buddy service temporarily unavailable. Please retry your request.',
          })
        );
      }
      return;
    }

    // 6. POST /api/fpsc/import-document (Manual Document Import for Syllabi and Announcements)
    if (pathname === '/api/fpsc/import-document' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { title, officialSourceUrl, advertisementNo, publicationDate, text, notes } = body;

      if (!title || !text) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Document title and text content are required for manual import.' }));
        return;
      }

      try {
        const imported = importManualDocument({
          title,
          officialSourceUrl,
          advertisementNo,
          publicationDate,
          text,
          notes,
        });

        res.statusCode = 201;
        res.end(JSON.stringify({ success: true, data: imported }));
      } catch (importErr) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: importErr.message }));
      }
      return;
    }

    // 7. GET /api/fpsc/syllabi
    if (pathname === '/api/fpsc/syllabi' && req.method === 'GET') {
      const snapshots = getAllArchivalSnapshots();
      res.statusCode = 200;
      res.end(JSON.stringify({ data: snapshots }));
      return;
    }

    // ------------------------------------------------------------------------
    // RAG Pipeline Endpoints (Stage 1)
    // ------------------------------------------------------------------------

    // 8. GET /api/rag/status
    if (pathname === '/api/rag/status' && req.method === 'GET') {
      const status = await getRAGStatus();
      res.statusCode = 200;
      res.end(JSON.stringify(status));
      return;
    }

    // 9. GET /api/rag/documents
    if (pathname === '/api/rag/documents' && req.method === 'GET') {
      const status = urlObj.searchParams.get('status') || null;
      const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
      const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
      const docs = await listDocuments({ status, limit, offset });
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, documents: docs }));
      return;
    }

    // 10. GET /api/rag/documents/:id
    if (pathname.startsWith('/api/rag/documents/') && req.method === 'GET') {
      const docId = pathname.replace('/api/rag/documents/', '');
      const doc = await getDocumentById(docId);
      if (!doc) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Document ${docId} not found` }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, document: doc }));
      return;
    }

    // 11. POST /api/rag/ingest
    if (pathname === '/api/rag/ingest' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { filePath, examId, subjectId, topicId, dryRun, force } = body;

      if (!filePath) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing filePath parameter' }));
        return;
      }

      const result = await executePythonIndexer({
        filePath,
        examId,
        subjectId,
        topicId,
        dryRun: Boolean(dryRun),
        force: Boolean(force),
      });

      res.statusCode = result.success ? 200 : 422;
      res.end(JSON.stringify(result));
      return;
    }

    // 12. POST /api/rag/retry/:id
    if (pathname.startsWith('/api/rag/retry/') && req.method === 'POST') {
      const docId = pathname.replace('/api/rag/retry/', '');
      try {
        const result = await retryDocumentIngestion(docId);
        res.statusCode = result.success ? 200 : 422;
        res.end(JSON.stringify(result));
      } catch (retryErr) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: retryErr.message }));
      }
      return;
    }

    // 13. POST /api/rag/retrieve (Stage 2: Hybrid Sparse + Dense Retrieval)
    if (pathname === '/api/rag/retrieve' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const {
        query,
        examId,
        subjectId,
        topicId,
        difficulty,
        candidateCount,
        matchCount,
        sparseWeight,
        denseWeight,
        rrfK,
      } = body;

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Search query is required.' }));
        return;
      }

      try {
        const result = await retrieveHybridPassages({
          query: query.trim(),
          examId,
          subjectId,
          topicId,
          difficulty,
          candidateCount: candidateCount ? parseInt(candidateCount, 10) : undefined,
          matchCount: matchCount ? parseInt(matchCount, 10) : undefined,
          sparseWeight: sparseWeight !== undefined ? parseFloat(sparseWeight) : undefined,
          denseWeight: denseWeight !== undefined ? parseFloat(denseWeight) : undefined,
          rrfK: rrfK ? parseInt(rrfK, 10) : undefined,
        });

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (retrieveErr) {
        console.error('[RAG Retrieve API Error]:', retrieveErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: retrieveErr.message || 'Retrieval failed.' }));
      }
      return;
    }

    // 12. POST /api/rag/generate-mcq (Stage 3: Grounded MCQ Generation from verified PDF passages)
    if (pathname === '/api/rag/generate-mcq' && req.method === 'POST') {
      const clientIp = req.socket?.remoteAddress || '127.0.0.1';
      if (!checkRateLimit(clientIp)) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: 'Generation rate limit reached. Please wait a moment.' }));
        return;
      }

      const body = await parseJsonBody(req);
      const {
        query,
        difficulty,
        examId,
        subjectId,
        topicId,
        count = 1,
        topPassages,
      } = body;

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'A valid query or syllabus topic string is required.' }));
        return;
      }

      try {
        const numCount = parseInt(count, 10) || 1;
        if (numCount > 1) {
          const batchRes = await generateGroundedMCQBatch({
            query: query.trim(),
            difficulty,
            count: numCount,
            examId,
            subjectId,
            topicId,
          });
          res.statusCode = 200;
          res.end(JSON.stringify(batchRes));
        } else {
          const singleRes = await generateAndIngestGroundedMCQ({
            query: query.trim(),
            difficulty,
            examId,
            subjectId,
            topicId,
            topPassages: Array.isArray(topPassages) ? topPassages : null,
          });
          res.statusCode = 200;
          res.end(JSON.stringify(singleRes));
        }
      } catch (genErr) {
        console.error('[RAG Generate MCQ API Error]:', genErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: genErr.message || 'MCQ generation failed.' }));
      }
      return;
    }

    // Fallback 404
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Endpoint not found: ${pathname}` }));
  } catch (err) {
    console.error('API Error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Body payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}
