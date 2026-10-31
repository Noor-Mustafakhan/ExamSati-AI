import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Sliders,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  BookOpen,
  Filter
} from 'lucide-react';
import { ragRetrievalService } from '../../services/ragRetrievalService';

const SAMPLE_QUERIES = [
  "Belady's Anomaly",
  "Two-Phase Locking (2PL)",
  "Coffman conditions for deadlocks",
  "ACID transaction properties",
  "1973 Constitution fundamental rights",
  "Council of Common Interests (CCI)",
  "Paging and Memory Management Unit (MMU)",
  "preventing simultaneous access collision in critical section",
  "BCNF",
  "National Finance Commission (NFC) Award"
];

export const RAGRetrievalTestPanel = ({ refContext = {}, onToast, onQuestionGenerated }) => {
  const [query, setQuery] = useState("Belady's Anomaly");
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');

  // RRF & Search parameters
  const [candidateCount, setCandidateCount] = useState(10);
  const [matchCount, setMatchCount] = useState(5);
  const [sparseWeight, setSparseWeight] = useState(1.0);
  const [denseWeight, setDenseWeight] = useState(1.0);
  const [rrfK, setRrfK] = useState(60);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Results & status
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [activeTab, setActiveTab] = useState('hybrid'); // 'hybrid' | 'sparse' | 'dense'

  // Stage 3 Grounded MCQ generation states per passage
  const [generatingPassageId, setGeneratingPassageId] = useState(null);
  const [selectedDifficultyByPassage, setSelectedDifficultyByPassage] = useState({});
  const [generatedSuccessByPassage, setGeneratedSuccessByPassage] = useState({});

  const handleGenerateMCQFromPassage = async (passage) => {
    const passageKey = passage.passage_id || passage.chunk_id;
    const diff = selectedDifficultyByPassage[passageKey] || 'Moderate';
    setGeneratingPassageId(passageKey);
    try {
      const res = await fetch('/api/rag/generate-mcq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query || passage.topic_title || passage.document_title || 'Curriculum Concept',
          difficulty: diff,
          examId: passage.exam_id || selectedExam || null,
          subjectId: passage.subject_id || selectedSubject || null,
          topicId: passage.syllabus_topic_id || selectedTopic || null,
          topPassages: [passage],
          count: 1,
        }),
      });

      const data = await res.json();
      if (!res.ok || (!data.success && data.error)) {
        throw new Error(data.message || data.error || 'Generation failed');
      }

      setGeneratedSuccessByPassage(prev => ({
        ...prev,
        [passageKey]: {
          status: data.status,
          questionId: data.question_id,
          difficulty: diff,
        }
      }));

      const msg = data.status === 'duplicate'
        ? `Grounded MCQ already exists in database (deduplicated).`
        : `Grounded MCQ generated & queued in Admin Review!`;

      if (onToast) onToast(msg);
      if (onQuestionGenerated) onQuestionGenerated();
    } catch (err) {
      console.error('Failed to generate MCQ from passage:', err);
      if (onToast) onToast(`Generation error: ${err.message}`);
    } finally {
      setGeneratingPassageId(null);
    }
  };

  const handleSearch = async (queryText = query) => {
    const q = (queryText || '').trim();
    if (!q) {
      if (onToast) onToast('Please enter a search query.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await ragRetrievalService.retrieve({
        query: q,
        examId: selectedExam || null,
        subjectId: selectedSubject || null,
        topicId: selectedTopic || null,
        candidateCount: Number(candidateCount) || 10,
        matchCount: Number(matchCount) || 5,
        sparseWeight: Number(sparseWeight) || 1.0,
        denseWeight: Number(denseWeight) || 1.0,
        rrfK: Number(rrfK) || 60,
      });

      setSearchResult(res);
      if (onToast) {
        onToast(`Retrieved ${res.hybridResults?.length || 0} hybrid passages in ${res.timings?.totalMs || 0}ms.`);
      }
    } catch (err) {
      console.error('Hybrid retrieval failed:', err);
      if (onToast) onToast(`Retrieval error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuery = (sample) => {
    setQuery(sample);
    handleSearch(sample);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Query Box */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/60 dark:from-slate-800/80 dark:via-slate-900 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Hybrid RAG Search Console (Stage 2)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Executes independent PostgreSQL FTS (Sparse) and pgvector (Dense, 768d) searches, then combines candidates via Reciprocal Rank Fusion (RRF).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="self-start sm:self-auto px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 inline-flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-500" />
            <span>{showAdvanced ? 'Hide RRF Tuning' : 'Tune RRF Parameters'}</span>
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Query Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter technical term, abbreviation, concept, or curriculum topic..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />
          </div>

          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={isLoading || !query.trim()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Retrieve</span>
          </button>
        </div>

        {/* Quick Sample Queries */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Quick Test Prompts:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_QUERIES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleQuickQuery(sample)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-slate-700 transition-colors"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced RRF & Filter Controls */}
        {showAdvanced && (
          <div className="pt-4 border-t border-indigo-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Candidate Count (per method)
              </label>
              <input
                type="number"
                min="2"
                max="50"
                value={candidateCount}
                onChange={(e) => setCandidateCount(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Top Fused Results (K)
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={matchCount}
                onChange={(e) => setMatchCount(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sparse Weight (FTS)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={sparseWeight}
                onChange={(e) => setSparseWeight(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Dense Weight (Vector)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={denseWeight}
                onChange={(e) => setDenseWeight(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                RRF k Parameter
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={rrfK}
                onChange={(e) => setRrfK(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Latency and Stats Bar */}
      {searchResult && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750 text-xs">
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Latency: <strong>{searchResult.timings?.totalMs}ms</strong></span>
            </span>
            <span>(Embedding: {searchResult.timings?.embeddingMs}ms | Sparse: {searchResult.timings?.sparseSearchMs}ms | Dense: {searchResult.timings?.denseSearchMs}ms)</span>
          </div>

          <div className="flex items-center gap-3 font-medium">
            <span className="text-amber-700 dark:text-amber-400">
              Sparse Candidates: {searchResult.sparseCandidates?.length || 0}
            </span>
            <span className="text-sky-700 dark:text-sky-400">
              Dense Candidates: {searchResult.denseCandidates?.length || 0}
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              Fused Hybrid: {searchResult.hybridResults?.length || 0}
            </span>
          </div>
        </div>
      )}

      {/* Results View Tabs */}
      {searchResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('hybrid')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'hybrid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Final Hybrid Results ({searchResult.hybridResults?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sparse')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'sparse'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Sparse (BM25 FTS) Candidates ({searchResult.sparseCandidates?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dense')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'dense'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Dense (Vector pgvector) Candidates ({searchResult.denseCandidates?.length || 0})</span>
            </button>
          </div>

          {/* TAB 1: HYBRID RESULTS */}
          {activeTab === 'hybrid' && (
            <div className="space-y-3">
              {searchResult.hybridResults?.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  No matching passages found. Try a different query or adjust your filters.
                </div>
              ) : (
                searchResult.hybridResults.map((item) => (
                  <div
                    key={item.passage_id || item.chunk_id}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800/70 shadow-sm transition-all space-y-3"
                  >
                    {/* Header info */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                          #{item.combined_rank}
                        </span>

                        {item.retrieval_method === 'both' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            ★ BOTH METHODS (BOOSTED)
                          </span>
                        )}
                        {item.retrieval_method === 'sparse_only' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            SPARSE (KEYWORD) ONLY
                          </span>
                        )}
                        {item.retrieval_method === 'dense_only' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                            DENSE (SEMANTIC) ONLY
                          </span>
                        )}

                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          RRF: <strong>{item.rrf_score}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>Sparse Rank: {item.sparse_rank ? `#${item.sparse_rank}` : '—'}</span>
                        <span>Dense Rank: {item.dense_rank ? `#${item.dense_rank}` : '—'}</span>
                        {item.dense_score && (
                          <span>Cosine Sim: <strong>{Number(item.dense_score).toFixed(3)}</strong></span>
                        )}
                      </div>
                    </div>

                    {/* Source & Taxonomy Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
                      <span className="flex items-center gap-1 text-slate-900 dark:text-white font-semibold">
                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{item.document_title}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[11px]">
                        {item.page_reference || `Page ${item.start_page}`}
                      </span>

                      {item.subject_name && (
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          <BookOpen className="w-3 h-3" />
                          <span>{item.subject_name}</span>
                        </span>
                      )}

                      {item.topic_title && (
                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Tag className="w-3 h-3" />
                          <span>{item.topic_title}</span>
                        </span>
                      )}
                    </div>

                    {/* Passage Content Excerpt */}
                    <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-slate-50/50 dark:bg-slate-800/20 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                      {item.passage_text}
                    </div>

                    {/* Explainability footnote & Grounded MCQ Generator Action */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 italic flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{item.relevance_explanation}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {generatedSuccessByPassage[item.passage_id || item.chunk_id] ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Queued in Pending Review</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={selectedDifficultyByPassage[item.passage_id || item.chunk_id] || 'Moderate'}
                              onChange={(e) => setSelectedDifficultyByPassage(prev => ({
                                ...prev,
                                [item.passage_id || item.chunk_id]: e.target.value
                              }))}
                              disabled={generatingPassageId === (item.passage_id || item.chunk_id)}
                              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="Easy">Easy</option>
                              <option value="Moderate">Moderate</option>
                              <option value="Advanced">Advanced</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleGenerateMCQFromPassage(item)}
                              disabled={generatingPassageId === (item.passage_id || item.chunk_id)}
                              className="px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                            >
                              {generatingPassageId === (item.passage_id || item.chunk_id) ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                                  <span>Generating...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>Generate MCQ</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: SPARSE CANDIDATES */}
          {activeTab === 'sparse' && (
            <div className="space-y-3">
              {searchResult.sparseCandidates?.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  No sparse keyword matches found for "{searchResult.query}".
                </div>
              ) : (
                searchResult.sparseCandidates.map((item) => (
                  <div
                    key={item.passage_id || item.chunk_id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        Sparse Rank #{item.sparse_rank} • Score: {Number(item.sparse_score || 0).toFixed(4)}
                      </span>
                      <span className="font-mono text-slate-500">
                        {item.document_title} ({item.page_reference})
                      </span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 line-clamp-3">
                      {item.passage_text}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: DENSE CANDIDATES */}
          {activeTab === 'dense' && (
            <div className="space-y-3">
              {searchResult.denseCandidates?.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  No dense vector candidates retrieved.
                </div>
              ) : (
                searchResult.denseCandidates.map((item) => (
                  <div
                    key={item.passage_id || item.chunk_id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-700 dark:text-sky-400">
                        Dense Rank #{item.dense_rank} • Cosine Similarity: {Number(item.dense_score || 0).toFixed(4)}
                      </span>
                      <span className="font-mono text-slate-500">
                        {item.document_title} ({item.page_reference})
                      </span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 line-clamp-3">
                      {item.passage_text}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
