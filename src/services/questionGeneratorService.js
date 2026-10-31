/**
 * Client-Side Question Generator Service for ExamSathi AI
 * ========================================================
 * Connects Admin Question Review to Server-Side Stage 3 Grounded MCQ Generation.
 *
 * Rules:
 * 1. Strictly calls server-side /api/rag/generate-mcq — all secrets remain on server.
 * 2. Questions are generated from retrieved PDF curriculum evidence only.
 * 3. Does NOT synthesize fake templates or hallucinated notice numbers when evidence is lacking.
 * 4. Surface clear INSUFFICIENT_EVIDENCE errors when evidence is missing.
 */

export const SYLLABUS_TOPIC_REGISTRY = {
  'fpsc-lecturer-cs-2026': [
    {
      topic: 'Operating Systems: Process Management, Virtual Memory & Concurrency',
      subject: 'Computer Science',
      concepts: ['Bankers Algorithm for deadlock avoidance', 'Belady Anomaly and FIFO page replacement', 'Semaphores vs Mutexes', 'TLB hit ratio']
    },
    {
      topic: 'Database Systems: Normalization, BCNF & ACID Transactions',
      subject: 'Computer Science',
      concepts: ['Boyce-Codd Normal Form (BCNF) vs 3NF', 'ACID transaction properties', 'Two-phase locking protocol (2PL)', 'B-Tree & B+ Tree index structures']
    }
  ],
  'fpsc-ad-fia-2026': [
    {
      topic: 'Constitutional History & 1973 Constitution Fundamental Rights',
      subject: 'Pakistan Affairs',
      concepts: ['Articles 8 to 28 Fundamental Rights', 'Writ jurisdiction Article 199', 'Separation of powers', 'High Treason Article 6']
    }
  ],
  'fpsc-inspector-customs-2026': [
    {
      topic: 'Constitutional History & 1973 Constitution Fundamental Rights',
      subject: 'Pakistan Affairs',
      concepts: ['Articles 8 to 28 Fundamental Rights', 'Writ jurisdiction Article 199']
    }
  ]
};

export const questionGeneratorService = {
  /**
   * Generates grounded practice questions via server-side RAG pipeline.
   *
   * @param {Object} options
   * @param {string} [options.examSlug] - e.g. 'fpsc-lecturer-cs-2026'
   * @param {string} [options.query] - Custom query or topic string
   * @param {string} [options.difficulty] - 'Easy', 'Moderate', 'Advanced'
   * @param {number} [options.count] - Number of questions to generate (1 to 5)
   * @returns {Promise<Object>} Generation and ingestion report
   */
  async generateBatch({
    examSlug = 'fpsc-lecturer-cs-2026',
    query = '',
    difficulty = 'Moderate',
    count = 1,
  } = {}) {
    const topics = SYLLABUS_TOPIC_REGISTRY[examSlug] || SYLLABUS_TOPIC_REGISTRY['fpsc-lecturer-cs-2026'];
    const selectedTopic = topics ? topics[0] : null;
    const effectiveQuery = (query || '').trim() || (selectedTopic ? `${selectedTopic.topic}: ${selectedTopic.concepts.slice(0, 2).join(', ')}` : 'Operating Systems');

    const response = await fetch('/api/rag/generate-mcq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: effectiveQuery,
        difficulty,
        count: Math.min(Math.max(parseInt(count, 10) || 1, 1), 5),
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Generation failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.success && data.error === 'INSUFFICIENT_EVIDENCE') {
      return {
        success: false,
        error: 'INSUFFICIENT_EVIDENCE',
        message: data.message || 'The uploaded curriculum documents do not contain sufficient evidence for this topic.',
        insertedCount: 0,
        duplicateCount: 0,
      };
    }

    const insertedCount = data.insertedCount ?? (data.status === 'inserted' ? 1 : 0);
    const duplicateCount = data.duplicateCount ?? (data.status === 'duplicate' ? 1 : 0);

    return {
      success: insertedCount > 0,
      isAiLive: true,
      difficulty,
      insertedCount,
      duplicateCount,
      insertedIds: data.question_id ? [data.question_id] : (data.questions || []).map(q => q.question_id),
      data,
    };
  },
};
