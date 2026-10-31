import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRIEVAL_CONFIG,
  generateQueryEmbedding,
  retrieveSparse,
  retrieveDense,
  fuseWithRRF,
  retrieveHybridPassages,
  supabase
} from '../server/ragRetrievalService.js';

describe('Stage 2 Hybrid RAG Retrieval Test Suite (Sparse + Dense + RRF)', () => {

  it('1. Verifies Stage 2 configuration defaults', () => {
    assert.equal(RETRIEVAL_CONFIG.embeddingModel, 'gemini-embedding-001');
    assert.equal(RETRIEVAL_CONFIG.embeddingDimensions, 768);
    assert.equal(RETRIEVAL_CONFIG.defaultCandidateCount, 10);
    assert.equal(RETRIEVAL_CONFIG.defaultMatchCount, 5);
    assert.equal(RETRIEVAL_CONFIG.defaultSparseWeight, 1.0);
    assert.equal(RETRIEVAL_CONFIG.defaultDenseWeight, 1.0);
    assert.equal(RETRIEVAL_CONFIG.defaultRrfK, 60);
  });

  it('2. Query embedding generation produces a valid 768-dimensional vector', async () => {
    const embedding = await generateQueryEmbedding('test operating systems virtual memory');
    assert.ok(Array.isArray(embedding), 'Embedding must be an array');
    assert.equal(embedding.length, 768, 'Embedding must be exactly 768 dimensions');
    assert.ok(typeof embedding[0] === 'number', 'Values must be floating point numbers');
  });

  it('3. Reciprocal Rank Fusion (RRF) correctly boosts documents found by both methods', () => {
    const mockSparse = [
      { passage_id: 'doc-A', sparse_rank: 1, sparse_score: 0.8, passage_text: 'Text A' },
      { passage_id: 'doc-B', sparse_rank: 2, sparse_score: 0.6, passage_text: 'Text B' },
      { passage_id: 'doc-C', sparse_rank: 3, sparse_score: 0.4, passage_text: 'Text C' },
    ];

    const mockDense = [
      { passage_id: 'doc-D', dense_rank: 1, dense_score: 0.9, passage_text: 'Text D' },
      { passage_id: 'doc-B', dense_rank: 2, dense_score: 0.85, passage_text: 'Text B' },
      { passage_id: 'doc-A', dense_rank: 3, dense_score: 0.8, passage_text: 'Text A' },
    ];

    const fused = fuseWithRRF({
      sparseCandidates: mockSparse,
      denseCandidates: mockDense,
      sparseWeight: 1.0,
      denseWeight: 1.0,
      rrfK: 60,
      matchCount: 5,
    });

    assert.equal(fused.length, 4, 'Must union unique documents');

    // doc-A: 1/(60+1) + 1/(60+3) = 1/61 + 1/63 = 0.016393 + 0.015873 = 0.032266
    // doc-B: 1/(60+2) + 1/(60+2) = 1/62 + 1/62 = 0.016129 + 0.016129 = 0.032258
    // doc-D: 1/(60+1) = 0.016393
    // doc-C: 1/(60+3) = 0.015873
    assert.ok(fused[0].rrf_score > fused[2].rrf_score, 'Multi-match documents must beat single-match documents');
    assert.equal(fused[0].retrieval_method, 'both');
    assert.equal(fused[1].retrieval_method, 'both');
    assert.ok(fused[0].relevance_explanation.includes('both'));
  });

  // 10 Realistic Queries Evaluation
  const testQueries = [
    {
      category: '1. Exact Technical Terminology',
      query: "Belady's Anomaly",
      expectedSnippet: 'Belady',
      expectedSubject: 'Computer Science'
    },
    {
      category: '2. Exact Technical Terminology',
      query: 'Two-Phase Locking (2PL)',
      expectedSnippet: 'Two-Phase Locking',
      expectedSubject: 'Computer Science'
    },
    {
      category: '3. Technical Abbreviation',
      query: 'BCNF',
      expectedSnippet: 'Boyce-Codd',
      expectedSubject: 'Computer Science'
    },
    {
      category: '4. Abbreviation & Properties',
      query: 'ACID transaction properties',
      expectedSnippet: 'Atomicity',
      expectedSubject: 'Computer Science'
    },
    {
      category: '5. Abbreviation & Mechanism',
      query: 'Process Control Block (PCB)',
      expectedSnippet: 'Process Control Block',
      expectedSubject: 'Computer Science'
    },
    {
      category: '6. Hardware/Architecture Acronyms',
      query: 'Memory Management Unit (MMU) page table',
      expectedSnippet: 'Memory Management Unit',
      expectedSubject: 'Computer Science'
    },
    {
      category: '7. Conceptual (Zero exact word overlap)',
      query: 'preventing simultaneous access collision in critical section',
      expectedSnippet: 'Mutual Exclusion',
      expectedSubject: 'Computer Science'
    },
    {
      category: '8. Conceptual Question',
      query: 'deadlock avoidance through safe resource trajectories',
      expectedSnippet: 'Banker',
      expectedSubject: 'Computer Science'
    },
    {
      category: '9. FPSC Subject Query: Constitutional Rights',
      query: '1973 Constitution fundamental rights',
      expectedSnippet: 'Fundamental Rights',
      expectedSubject: 'Pakistan Affairs'
    },
    {
      category: '10. FPSC Subject Query: Inter-provincial Relations',
      query: 'Council of Common Interests (CCI) provincial autonomy',
      expectedSnippet: 'Council of Common Interests',
      expectedSubject: 'Pakistan Affairs'
    }
  ];

  for (const t of testQueries) {
    it(`Evaluates Query: [${t.category}] "${t.query}"`, async () => {
      const res = await retrieveHybridPassages({
        query: t.query,
        candidateCount: 10,
        matchCount: 5,
        sparseWeight: 1.0,
        denseWeight: 1.0,
        rrfK: 60,
      });

      assert.ok(res.hybridResults.length > 0, `Query "${t.query}" must return results`);
      const topMatch = res.hybridResults[0];

      // Verify metadata completeness and traceability
      assert.ok(topMatch.document_title, 'Top match must have document_title');
      assert.ok(topMatch.page_reference, 'Top match must have page_reference');
      assert.ok(topMatch.start_page >= 1, 'start_page must be >= 1');
      assert.ok(topMatch.combined_rank === 1, 'First result must have combined_rank = 1');
      assert.ok(topMatch.rrf_score > 0, 'RRF score must be positive');
      assert.ok(topMatch.relevance_explanation, 'Must have relevance_explanation');

      // Check whether top passage contains expected concept
      const containsExpected = res.hybridResults.some(r =>
        r.passage_text.toLowerCase().includes(t.expectedSnippet.toLowerCase())
      );
      assert.ok(
        containsExpected,
        `Expected snippet "${t.expectedSnippet}" to be present in retrieved passages for query "${t.query}"`
      );

      console.log(`  ✓ Query: "${t.query}" -> Top Result: ${topMatch.document_title} (${topMatch.page_reference}) [${topMatch.retrieval_method.toUpperCase()}] RRF: ${topMatch.rrf_score}`);
    });
  }

});
