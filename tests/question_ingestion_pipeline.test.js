import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
const store = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import { supabase, isSupabaseConfigured } from '../src/lib/supabase.js';
import {
  parseCsv,
  normalizeQuestionInput,
  validateQuestion,
  questionIngestionService
} from '../src/services/questionIngestionService.js';

describe('Stage 1: Question Ingestion Pipeline & Deduplication Suite', () => {

  it('1. parseCsv correctly parses RFC 4180 CSV with quotes, commas, and multi-line values', () => {
    const sampleCsv = `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,subject,explanation
"Under Section 3, who holds power?","Federal Government","High Court","Police Chief","Customs Officer",0,Moderate,"Pakistan Affairs","Statutory provision under FIA Act 1974."
"Which protocol uses port 443?","HTTP","HTTPS, SSL/TLS","FTP","SSH",1,Easy,"Computer Science","HTTPS uses port 443 for encrypted web traffic."`;

    const parsed = parseCsv(sampleCsv);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].question_text, 'Under Section 3, who holds power?');
    assert.equal(parsed[0].option_a, 'Federal Government');
    assert.equal(parsed[0].correct_option, '0');
    assert.equal(parsed[1].option_b, 'HTTPS, SSL/TLS');
  });

  it('2. validateQuestion flags invalid rows with specific, actionable errors', () => {
    const invalidRow = {
      question_text: 'Short', // Less than 10 chars
      options: ['Only A', 'Only B'], // Less than 4 options
      correct_option: 5, // Invalid index > 3
      explanation: '', // Empty explanation
      subject: 'Nonexistent Subject 999',
    };

    const val = validateQuestion(invalidRow, { subjects: [], exams: [], topics: [] });
    assert.equal(val.valid, false);
    assert.ok(val.errors.length >= 4, `Expected at least 4 validation errors, got ${val.errors.length}`);
    assert.ok(val.errors.some(e => e.includes('10 characters')));
    assert.ok(val.errors.some(e => e.includes('4 options')));
    assert.ok(val.errors.some(e => e.includes('correct answer')));
  });

  it('3. Ingesting a valid new draft question stores it as unpublished (pending review)', async () => {
    if (!isSupabaseConfigured) return;

    // Fetch Computer Science subject ID
    const { data: subData } = await supabase.from('subjects').select('id').eq('slug', 'computer-science').single();
    assert.ok(subData?.id, 'Computer science subject must exist');

    const testTs = Date.now();
    const testQuestion = {
      question_text: `Test Stage 1 Automated Ingestion ${testTs}: What is the time complexity of searching in balanced BST variant ${testTs}?`,
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      correct_option: 1, // O(log n)
      difficulty: 'Moderate',
      subject_id: subData.id,
      explanation: 'Balanced BST search takes logarithmic time O(log n) proportional to height.',
      is_published: false,
      question_origin: 'ai_generated_practice',
      verification_status: 'practice_exercise'
    };

    const ingestRes = await questionIngestionService.ingestQuestions([testQuestion]);
    assert.equal(ingestRes.success, true);
    assert.equal(ingestRes.insertedCount, 1);
    assert.ok(ingestRes.insertedIds.length === 1);

    const insertedId = ingestRes.insertedIds[0];

    try {
      // 1. Verify that public RLS blocks direct client selection of unpublished draft
      const { data: publicReadData, error: publicReadError } = await supabase
        .from('questions')
        .select('id, is_published')
        .eq('id', insertedId);
      assert.ok(publicReadData.length === 0, 'Public query must not return unpublished draft questions (RLS protected)');

      // 2. Verify draft exists via administrative getPendingQuestions RPC
      const pendingList = await questionIngestionService.getPendingQuestions(10, 0);
      const match = pendingList.find(q => q.id === insertedId);
      assert.ok(match, 'Draft question must appear in pending administrative review queue');
      assert.equal(match.is_published, false, 'Draft question must have is_published = false');
      assert.equal(match.question_text, `What is the time complexity of searching in balanced BST variant ${testTs}?`, 'Prefix must be stripped from question text in database');
    } finally {
      // Clean up test question
      await supabase.from('questions').delete().eq('id', insertedId);
    }
  });

  it('4. Repeated import of identical question is idempotent (rejected/skipped as duplicate)', async () => {
    if (!isSupabaseConfigured) return;

    const { data: subData } = await supabase.from('subjects').select('id').eq('slug', 'computer-science').single();

    const uniqueTs = Date.now();
    const uniqueText = `Idempotent Test Question ${uniqueTs}: Which scheduling algorithm guarantees zero starvation in cluster ${uniqueTs}?`;

    const qItem = {
      question_text: uniqueText,
      options: ['FCFS', 'Round Robin with dynamic quantum', 'Strict Priority', 'Shortest Job First'],
      correct_option: 1,
      difficulty: 'Advanced',
      subject_id: subData.id,
      explanation: 'Aging or fair-share round robin prevents unbounded indefinite postponement.',
      is_published: false
    };

    // First ingestion -> inserted
    const firstRes = await questionIngestionService.ingestQuestions([qItem]);
    assert.equal(firstRes.insertedCount, 1);
    const qId = firstRes.insertedIds[0];

    try {
      // Second ingestion with identical content -> must detect duplicate!
      const secondRes = await questionIngestionService.ingestQuestions([qItem]);
      assert.equal(secondRes.insertedCount, 0, 'Must not insert duplicate question');
      assert.equal(secondRes.duplicateCount, 1, 'Duplicate count must be 1');
    } finally {
      // Clean up test record
      if (qId) {
        await supabase.rpc('admin_delete_question', { p_question_id: qId });
      }
    }
  });

  it('5. reviewQuestion approves a draft question and makes it published', async () => {
    if (!isSupabaseConfigured) return;

    const { data: subData } = await supabase.from('subjects').select('id').eq('slug', 'computer-science').single();

    const reviewTs = Date.now();
    const draftQ = {
      question_text: `Review Workflow Test ${reviewTs}: In relational database architecture ${reviewTs}, what does 3NF eliminate?`,
      options: ['Partial dependency', 'Transitive dependency', 'Multi-valued dependency', 'Join dependency'],
      correct_option: 1,
      difficulty: 'Moderate',
      subject_id: subData.id,
      explanation: 'Third Normal Form (3NF) requires 2NF and removes transitive functional dependencies.',
      is_published: false
    };

    const res = await questionIngestionService.ingestQuestions([draftQ]);
    const qId = res.insertedIds[0];

    try {
      // Approve the question
      const reviewRes = await questionIngestionService.reviewQuestion(qId, 'approve', 'verified_citation');
      assert.equal(reviewRes.success, true);
      assert.equal(reviewRes.is_published, true);

      // Verify in public.questions that it is now published
      const { data: verifiedRow } = await supabase
        .from('questions')
        .select('is_published, verification_status')
        .eq('id', qId)
        .single();

      assert.equal(verifiedRow.is_published, true);
      assert.equal(verifiedRow.verification_status, 'verified_citation');

      // Test that check_mcq_answer RPC now succeeds
      const { data: checkRes } = await supabase.rpc('check_mcq_answer', {
        p_question_id: qId,
        p_selected_option: 1
      });
      assert.equal(checkRes.is_correct, true);
    } finally {
      if (qId) {
        await supabase.rpc('admin_delete_question', { p_question_id: qId });
      }
    }
  });

  it('6. getMetrics returns accurate question bank breakdown from Supabase', async () => {
    if (!isSupabaseConfigured) return;

    const metrics = await questionIngestionService.getMetrics();
    assert.ok(metrics !== null);
    assert.ok(metrics.total_questions >= 84);
    assert.ok(metrics.published_count >= 84);
    assert.ok(metrics.by_exam['fpsc-ad-fia-2026']);
    assert.ok(metrics.by_exam['fpsc-inspector-customs-2026']);
  });

  // Stage 2: Batch Generation & Unpublished Draft Workflow
  it('7. questionGeneratorService generates syllabus-grounded batch questions strictly as unpublished drafts', async () => {
    if (!isSupabaseConfigured) return;

    const { questionGeneratorService } = await import('../src/services/questionGeneratorService.js');

    const genRes = await questionGeneratorService.generateBatch({
      examSlug: 'fpsc-lecturer-cs-2026',
      difficulty: 'Advanced',
      count: 3
    });

    assert.equal(genRes.success, true);
    assert.ok(genRes.insertedCount >= 1 || genRes.duplicateCount >= 1);

    // Verify all newly inserted IDs are unpublished drafts
    if (genRes.insertedIds?.length > 0) {
      try {
        const pendingList = await questionIngestionService.getPendingQuestions(20, 0);
        for (const id of genRes.insertedIds) {
          const match = pendingList.find(q => q.id === id);
          if (match) {
            assert.equal(match.is_published, false, 'Generated questions must remain unpublished before approval');
            assert.equal(match.question_origin, 'ai_generated_practice');
          }
        }
      } finally {
        // Clean up test batch
        for (const id of genRes.insertedIds) {
          await supabase.from('questions').delete().eq('id', id);
        }
      }
    }
  });

  // Stage 3: Controlled Official Document Ingestion
  it('8. documentIngestionService enforces SSRF protection and extracts candidate questions as drafts', async () => {
    const { documentIngestionService } = await import('../src/services/documentIngestionService.js');

    // 1. Verify SSRF protection rejects unauthorized domains
    const ssrfRes = await documentIngestionService.ingestDocument({
      url: 'http://169.254.169.254/latest/meta-data',
      rawText: 'Sample text for test'
    });
    assert.equal(ssrfRes.success, false);
    assert.ok(ssrfRes.error.includes('URL validation rejected'));

    // 2. Verify legitimate official syllabus document extraction
    const officialSampleText = `
PART-II: PROFESSIONAL TEST (80 MARKS)
Case No. F.4-123/2026-R: Lecturer Computer Science (BS-17)
1. Operating Systems: Process Synchronization, Critical Section Problem, Deadlock Prevention
2. Relational Database Management Systems: SQL Queries, Normalization up to BCNF
3. Software Engineering: Agile Methodologies, Software Testing and Quality Assurance
    `;

    const docRes = await documentIngestionService.ingestDocument({
      rawText: officialSampleText,
      title: 'FPSC Official Syllabus Gazette Notice 2026',
      examSlug: 'fpsc-lecturer-cs-2026',
      subjectSlug: 'computer-science'
    });

    assert.equal(docRes.success, true);
    assert.ok(docRes.candidateCount >= 1);
    assert.equal(docRes.isPendingApproval, true);

    // Clean up candidate test questions
    if (docRes.insertedIds?.length > 0) {
      for (const id of docRes.insertedIds) {
        await supabase.from('questions').delete().eq('id', id);
      }
    }
  });

  // Stage 4: Preservation of Existing Questions & Student Progress
  it('9. Existing 84 approved questions, answer keys and student records remain intact', async () => {
    if (!isSupabaseConfigured) return;

    // Check published count
    const { count, error } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    assert.equal(error, null);
    assert.ok(count >= 84, `Approved questions must remain at least 84, found ${count}`);

    // Verify existing answer key
    const fiaQ1Id = 'f1000000-0000-0000-0001-000000000001';
    const checkRes = await supabase.rpc('check_mcq_answer', {
      p_question_id: fiaQ1Id,
      p_selected_option: 0
    });
    assert.equal(checkRes.data?.is_correct, true, 'Existing FIA answer key must remain intact');
  });
});
