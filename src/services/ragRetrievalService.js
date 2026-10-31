/**
 * ExamSathi AI - Frontend Client for Stage 2 Hybrid RAG Retrieval
 */

export const ragRetrievalService = {
  /**
   * Performs hybrid sparse + dense retrieval with Reciprocal Rank Fusion.
   *
   * @param {Object} options
   * @param {string} options.query - The search query
   * @param {string} [options.examId] - Optional exam UUID filter
   * @param {string} [options.subjectId] - Optional subject UUID filter
   * @param {string} [options.topicId] - Optional syllabus topic UUID filter
   * @param {string} [options.difficulty] - Optional difficulty filter
   * @param {number} [options.candidateCount=10] - Candidates fetched per method
   * @param {number} [options.matchCount=5] - Final top results to return
   * @param {number} [options.sparseWeight=1.0] - Weight for keyword/BM25 rank
   * @param {number} [options.denseWeight=1.0] - Weight for vector similarity rank
   * @param {number} [options.rrfK=60] - RRF smoothing parameter k
   */
  async retrieve({
    query,
    examId = null,
    subjectId = null,
    topicId = null,
    difficulty = null,
    candidateCount = 10,
    matchCount = 5,
    sparseWeight = 1.0,
    denseWeight = 1.0,
    rrfK = 60,
  }) {
    const res = await fetch('/api/rag/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Retrieval request failed with HTTP ${res.status}`);
    }

    return res.json();
  },
};
