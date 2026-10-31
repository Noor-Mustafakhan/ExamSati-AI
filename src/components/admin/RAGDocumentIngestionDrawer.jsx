import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Clock,
  Sparkles,
  RotateCcw,
  Search
} from 'lucide-react';
import { ragDocumentService } from '../../services/ragDocumentService';
import { RAGRetrievalTestPanel } from './RAGRetrievalTestPanel';

export const RAGDocumentIngestionDrawer = ({ isOpen, onClose, refContext, onToast, onQuestionGenerated }) => {
  const [activeMainTab, setActiveMainTab] = useState('retrieval'); // 'retrieval' | 'ingestion'
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [ragStatus, setRagStatus] = useState(null);

  // Ingestion form state
  const [filePath, setFilePath] = useState('sample_notes/test_operating_systems.pdf');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [isDryRun, setIsDryRun] = useState(false);
  const [isForce, setIsForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  // Inspection modal
  const [inspectedDoc, setInspectedDoc] = useState(null);
  const [loadingPassages, setLoadingPassages] = useState(false);

  const loadData = async () => {
    setLoadingDocs(true);
    try {
      const [statusRes, docsRes] = await Promise.all([
        ragDocumentService.getStatus(),
        ragDocumentService.getDocuments({ limit: 100 })
      ]);
      setRagStatus(statusRes);
      setDocuments(docsRes || []);
    } catch (err) {
      console.error('Failed to load RAG document data:', err);
      if (onToast) onToast(`RAG Error: ${err.message}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!filePath.trim()) {
      if (onToast) onToast('Please specify a PDF file path.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await ragDocumentService.ingestDocument({
        filePath: filePath.trim(),
        examId: selectedExam || null,
        subjectId: selectedSubject || null,
        topicId: selectedTopic || null,
        dryRun: isDryRun,
        force: isForce
      });

      if (res.success) {
        if (onToast) {
          onToast(
            isDryRun
              ? `Dry-run complete: Extracted ${res.total_chunks || 0} chunks without indexing.`
              : `Successfully indexed ${res.file_name || 'document'} (${res.total_chunks || 0} passages).`
          );
        }
        await loadData();
      } else {
        if (onToast) onToast(`Ingestion failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      if (onToast) onToast(`Ingestion error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async (docId) => {
    setRetryingId(docId);
    try {
      const res = await ragDocumentService.retryDocument(docId);
      if (res.success) {
        if (onToast) onToast('Document re-indexed successfully.');
        await loadData();
      } else {
        if (onToast) onToast(`Retry failed: ${res.error || 'Failed'}`);
      }
    } catch (err) {
      if (onToast) onToast(`Retry error: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleInspect = async (doc) => {
    setLoadingPassages(true);
    setInspectedDoc(doc);
    try {
      const fullDoc = await ragDocumentService.getDocument(doc.id);
      setInspectedDoc(fullDoc || doc);
    } catch (err) {
      console.warn('Could not load detailed passages:', err);
    } finally {
      setLoadingPassages(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mb-6 p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs tracking-wider uppercase">
            <Database className="w-4 h-4" />
            <span>RAG Document Ingestion & Passage Indexing (Stage 1)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            Curriculum PDF Passage Repository
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Extract local PDFs, partition into 300–500 word page-aware passages, and generate official 768-dim embeddings via <code className="font-mono text-indigo-600 dark:text-indigo-400">gemini-embedding-001</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {ragStatus?.geminiConfigured ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>gemini-embedding-001 (768d)</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>API Key Missing</span>
            </span>
          )}

          <button
            type="button"
            onClick={loadData}
            disabled={loadingDocs}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Refresh document repository"
          >
            <RefreshCw className={`w-4 h-4 ${loadingDocs ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Stage 1 Ingestion vs Stage 2 Hybrid Retrieval) */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab('retrieval')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            activeMainTab === 'retrieval'
              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Stage 2: Hybrid Retrieval Tester</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('ingestion')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
            activeMainTab === 'ingestion'
              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Stage 1: PDF Document Repository ({documents.length})</span>
        </button>
      </div>

      {activeMainTab === 'retrieval' ? (
        <RAGRetrievalTestPanel refContext={refContext} onToast={onToast} onQuestionGenerated={onQuestionGenerated} />
      ) : (
        <>
          {/* Ingestion Form */}
          <form onSubmit={handleIngest} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-indigo-500" />
              <span>Ingest New PDF Document</span>
            </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* File Path Input */}
          <div className="space-y-1 lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Local PDF Path (Relative to project root or absolute)
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="sample_notes/test_operating_systems.pdf"
              className="w-full h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          {/* Exam Profile */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Exam Profile (Optional)
            </label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="">Auto-Detect from Content</option>
              {refContext?.exams?.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Subject (Optional)
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="">Auto-Detect from Content</option>
              {refContext?.subjects?.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Options & Submit */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Dry-Run (Test Extraction & Chunking Only)</span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isForce}
                onChange={(e) => setIsForce(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Force Re-index (Overwrite duplicate)</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-9 px-5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm inline-flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing PDF...</span>
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5" />
                <span>{isDryRun ? 'Extract & Preview Chunks' : 'Index Document & Embeddings'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Ingested Documents List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Ingested Documents ({documents.length})
          </h3>
          <span className="text-xs text-slate-500">
            Total Passages in Index: <strong className="text-indigo-600 dark:text-indigo-400">{ragStatus?.metrics?.totalPassages || 0}</strong>
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
            No PDF documents ingested yet. Enter a PDF path above and click Index Document.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-semibold">Document</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Pages / Chunks</th>
                  <th className="py-2.5 px-3 font-semibold">SHA-256 Hash</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.map((doc) => {
                  const isRetrying = retryingId === doc.id;
                  const isIndexed = doc.ingestion_status === 'indexed';
                  const isFailed = doc.ingestion_status === 'failed';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{doc.file_name}</span>
                        </div>
                        {doc.ocr_needed && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Scanned image PDF (&lt;50 chars/page)</span>
                          </div>
                        )}
                        {doc.error_message && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 line-clamp-1">
                            {doc.error_message}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isIndexed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Indexed</span>
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            <XCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            <Clock className="w-3 h-3" />
                            <span>{doc.ingestion_status}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        <div>{doc.total_pages} page(s)</div>
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                          {doc.total_chunks || 0} passage(s)
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {doc.file_hash ? doc.file_hash.slice(0, 12) + '...' : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleInspect(doc)}
                            className="px-2 py-1 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            View Passages
                          </button>
                          {isFailed && (
                            <button
                              type="button"
                              onClick={() => handleRetry(doc.id)}
                              disabled={isRetrying}
                              className="px-2 py-1 rounded text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 inline-flex items-center gap-1"
                            >
                              <RotateCcw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspected Document Passages Modal */}
      {inspectedDoc && (
        <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Passage Chunks for: {inspectedDoc.file_name}</span>
              </h4>
              <p className="text-xs text-slate-500">
                Hash: <code className="font-mono text-slate-700 dark:text-slate-300">{inspectedDoc.file_hash}</code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedDoc(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              Close
            </button>
          </div>

          {loadingPassages ? (
            <div className="py-6 text-center text-xs text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto text-indigo-600 mb-1" />
              Loading passage chunks...
            </div>
          ) : inspectedDoc.passages?.length ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {inspectedDoc.passages.map((p, pIdx) => (
                <div key={p.id || pIdx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono">
                      {p.chunk_id || `Chunk ${p.chunk_index}`}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      {p.page_reference || `Pages ${p.start_page}-${p.end_page}`} ({p.word_count || 0} words)
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                    {p.passage_text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-500">
              No passages found for this document.
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};
