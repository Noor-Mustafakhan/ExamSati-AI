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
  cleanQuestionText,
  isFabricatedOrMalformed,
  normalizeQuestionInput,
  validateQuestion,
  questionIngestionService
} from '../src/services/questionIngestionService.js';
import { questionService } from '../src/services/questionService.js';

describe('MCQ Cleaning, Sanitization & Regression Test Suite', () => {

  // --------------------------------------------------------------------------
  // 1. Text Sanitization Rules & Prefix Stripping
  // --------------------------------------------------------------------------
  it('1. Strips accidental test prefixes, candidate IDs, timestamps, and trailing refs', () => {
    const testCases = [
      {
        input: 'Test Review Flow Candidate [mvmggqi9vr91]: What is the primary role of an operating system kernel?',
        expected: 'What is the primary role of an operating system kernel?'
      },
      {
        input: 'Test Stage 1 Automated Ingestion 1792834610664: What is the time complexity of searching in a balanced BST?',
        expected: 'What is the time complexity of searching in a balanced BST?'
      },
      {
        input: 'Automated Bulk Import E2E Test Question 1792842109278: What prevents priority inversion in real-time kernels?',
        expected: 'What prevents priority inversion in real-time kernels?'
      },
      {
        input: 'Idempotent Test Question 1792834610664: Which scheduling algorithm guarantees zero starvation?',
        expected: 'Which scheduling algorithm guarantees zero starvation?'
      },
      {
        input: 'Candidate [xyz999]: What are the ACID properties in database management systems?',
        expected: 'What are the ACID properties in database management systems?'
      },
      {
        input: 'Test Candidate [abc123]: In computer networks, what is the role of ARP?',
        expected: 'In computer networks, what is the role of ARP?'
      },
      {
        input: 'DEBUG: In software engineering, what is cyclomatic complexity?',
        expected: 'In software engineering, what is cyclomatic complexity?'
      },
      {
        input: 'Regarding Operating Systems, which principle applies to Semaphores? (Ref: 1792849594124-0)',
        expected: 'Regarding Operating Systems, which principle applies to Semaphores?'
      },
      {
        input: 'Which statute governs money laundering offenses? (Notice Ref: 1792849594124)',
        expected: 'Which statute governs money laundering offenses?'
      }
    ];

    for (const { input, expected } of testCases) {
      const cleaned = cleanQuestionText(input);
      assert.equal(cleaned, expected, `Failed to clean input: "${input}"`);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Academic Preservation: Normal Academic Questions Are Untouched
  // --------------------------------------------------------------------------
  it('2. Preserves normal academic questions without modification', () => {
    const academicQuestions = [
      'What is the primary function of the Translation Lookaside Buffer (TLB)?',
      'Which algorithm is commonly used for deadlock avoidance in operating systems?',
      'Under the FIA Act 1974, which official authority constitutes the Agency?',
      'What is the time complexity of finding an element in an unsorted array of size n?',
      'Which normal form eliminates partial dependency on a composite primary key?'
    ];

    for (const q of academicQuestions) {
      assert.equal(cleanQuestionText(q), q, `Academic question should not be altered: "${q}"`);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Technical Colons, Legal References, and Abbreviations Are Intact
  // --------------------------------------------------------------------------
  it('3. Strictly preserves technical questions containing colons, abbreviations, and statutes', () => {
    const colonQuestions = [
      'In Python: which built-in data type is immutable and ordered?',
      'According to Section 3: who is empowered to appoint the Director General?',
      'In algorithm analysis: O(n log n) represents the optimal comparison sorting bound.',
      'Under Article 199: the High Court exercises constitutional writ jurisdiction in which manner?',
      'In database design: 3NF requires the relation to satisfy 2NF and eliminate transitive dependency.'
    ];

    for (const q of colonQuestions) {
      const cleaned = cleanQuestionText(q);
      assert.equal(cleaned, q, `Valid question with colon should not be damaged: "${q}"`);
    }
  });

  // --------------------------------------------------------------------------
  // 4. Fabricated / Malformed Notice Detection
  // --------------------------------------------------------------------------
  it('4. Detects and flags fabricated official notice templates and malformed questions', () => {
    const fabricated = 'According to official syllabus notice regarding "Case No. F.4-123/2026-R: Lecturer Computer Science (BS-17)", which standard applies to Systems:? (Notice Ref: 1792849594124)';
    const check1 = isFabricatedOrMalformed(fabricated);
    assert.equal(check1.invalid, true);
    assert.ok(check1.reason.includes('synthetic syllabus notice template'));

    const danglingColon = 'Under modern networking protocols, which standard applies to Systems:?';
    const check2 = isFabricatedOrMalformed(danglingColon);
    assert.equal(check2.invalid, true);
    assert.ok(check2.reason.includes('dangling malformed keyword'));

    const tooShort = 'What is OS?';
    const check3 = isFabricatedOrMalformed(tooShort);
    assert.equal(check3.invalid, true);
    assert.ok(check3.reason.includes('at least 15 characters'));

    const validAcademic = 'Which algorithm is used for finding shortest paths in a weighted graph with non-negative edge weights?';
    const check4 = isFabricatedOrMalformed(validAcademic);
    assert.equal(check4.invalid, false);
  });

  // --------------------------------------------------------------------------
  // 5. Ingestion Validation Flags Fabricated Questions
  // --------------------------------------------------------------------------
  it('5. validateQuestion rejects rows with fabricated notice stems', () => {
    const badRow = {
      question_text: 'According to official syllabus notice regarding "Case No. F.4-123/2026-R: Lecturer Computer Science (BS-17)", which standard applies to Systems:? (Notice Ref: 1792849594124)',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_option: 0,
      difficulty: 'Moderate',
      explanation: 'Valid explanation text.',
      subject: 'Computer Science'
    };

    const val = validateQuestion(badRow);
    assert.equal(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('synthetic syllabus notice template')));
  });

  // --------------------------------------------------------------------------
  // 6. CSV and Bulk Import Cleaning Pipeline
  // --------------------------------------------------------------------------
  it('6. Normalizes CSV rows by cleaning test prefixes and preserving options & metadata', () => {
    const rawRow = {
      question_text: 'Test Review Flow Candidate [xyz999]: What is the primary role of an operating system kernel?',
      option_a: 'Hardware abstraction and resource management',
      option_b: 'Spreadsheet formatting',
      option_c: 'Word processing',
      option_d: 'Web browsing',
      correct_option: '0',
      difficulty: 'moderate',
      explanation: 'The kernel manages CPU, memory, and devices.',
      subject: 'Computer Science',
      source_title: 'OS Concepts 10th Ed',
      source_page: 'Page 5'
    };

    const normalized = normalizeQuestionInput(rawRow);
    assert.equal(normalized.question_text, 'What is the primary role of an operating system kernel?');
    assert.equal(normalized.options.length, 4);
    assert.equal(normalized.correct_option, 0);
    assert.equal(normalized.difficulty, 'Moderate');
    assert.equal(normalized.explanation, 'The kernel manages CPU, memory, and devices.');
    assert.equal(normalized.source_title, 'OS Concepts 10th Ed');
    assert.equal(normalized.source_page, 'Page 5');
  });

  // --------------------------------------------------------------------------
  // 7. Live Database Audit: No Test Prefixes Remain in Database
  // --------------------------------------------------------------------------
  it('7. Verified all questions in Supabase have NO accidental test prefixes', async () => {
    if (!isSupabaseConfigured) return;

    const { data: allQuestions, error } = await supabase
      .from('questions')
      .select('id, question_text, is_published, review_status');

    assert.equal(error, null, 'Querying questions should not error');
    assert.ok(Array.isArray(allQuestions) && allQuestions.length > 0, 'Database should contain questions');

    const prefixRegexes = [
      /^Test\s+Review\s+Flow/i,
      /^Test\s+Candidate/i,
      /^Candidate\s*\[/i,
      /^Test\s+Stage/i,
      /^Automated\s+Bulk/i,
      /^Bulk\s+Import/i,
      /^Idempotent\s+Test/i,
      /^Automated\s+Ingestion/i,
      /^(?:DEBUG|TEST|FIXTURE)\s*:/i,
      /\(Notice Ref:\s*[\d\w\s-]+\)/i
    ];

    const violations = allQuestions.filter(q =>
      prefixRegexes.some(r => r.test(q.question_text))
    );

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} questions in database with test prefixes: ${JSON.stringify(violations.slice(0, 3))}`
    );
  });

  // --------------------------------------------------------------------------
  // 8. Fabricated Questions Are Strictly Flagged / Rejected in Database
  // --------------------------------------------------------------------------
  it('8. Verified all fabricated notice questions in Supabase are flagged and rejected', async () => {
    if (!isSupabaseConfigured) return;

    const { data: allQuestions } = await supabase
      .from('questions')
      .select('id, question_text, is_published, review_status');

    const fabricatedInDb = allQuestions.filter(q =>
      /According to official syllabus notice regarding.*which standard applies to/i.test(q.question_text)
    );

    for (const q of fabricatedInDb) {
      assert.equal(q.is_published, false, `Fabricated question ${q.id} must NOT be published`);
      assert.equal(q.review_status, 'rejected', `Fabricated question ${q.id} must be marked rejected`);
    }
  });

  // --------------------------------------------------------------------------
  // 9. Student Practice Queries Return Only Clean Questions With Intact Options
  // --------------------------------------------------------------------------
  it('9. questionService.getQuestions returns clean questions with complete options & explanations', async () => {
    const res = await questionService.getQuestions({ limit: 20 });
    assert.ok(Array.isArray(res.data) && res.data.length > 0, 'Student questions should be returned');

    for (const q of res.data) {
      assert.ok(q.question && q.question.length >= 15, `Question text too short: "${q.question}"`);
      assert.ok(!q.question.startsWith('Test Review Flow'), 'Question must not start with Test Review Flow');
      assert.ok(!q.question.startsWith('Test Stage'), 'Question must not start with Test Stage');
      assert.ok(!q.question.startsWith('Idempotent Test'), 'Question must not start with Idempotent Test');
      assert.ok(!q.question.startsWith('Automated Bulk Import'), 'Question must not start with Automated Bulk Import');
      assert.equal(q.options.length, 4, 'Question must have 4 options');
      assert.ok(q.subject, 'Question must have subject');
      assert.ok(q.explanation, 'Question must have explanation');
    }
  });

  // --------------------------------------------------------------------------
  // 10. Persistence: Cleaned Question Remains Clean After Saving and Reloading
  // --------------------------------------------------------------------------
  it('10. Ingesting question with accidental prefix saves cleaned text in DB and persists upon reload', async () => {
    if (!isSupabaseConfigured) return;

    const { data: subData } = await supabase.from('subjects').select('id').eq('slug', 'computer-science').single();
    assert.ok(subData?.id, 'Subject must exist');

    const uniqueStamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rawInput = {
      question_text: `Test Review Flow Candidate [${uniqueStamp}]: What is the purpose of inverted page tables in virtual memory architecture?`,
      options: [
        'To reduce page table size by indexing physical frame numbers',
        'To eliminate the need for secondary storage paging',
        'To increase the size of the virtual address space',
        'To prevent memory fragmentation completely'
      ],
      correct_option: 0,
      difficulty: 'Advanced',
      subject_id: subData.id,
      explanation: 'Inverted page tables have one entry per physical frame rather than per virtual page.',
      source_title: 'Operating System Concepts',
      source_page: 'Chapter 9',
      is_published: false
    };

    const expectedCleanText = 'What is the purpose of inverted page tables in virtual memory architecture?';

    // Ingest via service
    const ingestRes = await questionIngestionService.ingestQuestions([rawInput]);
    assert.equal(ingestRes.success, true);
    assert.equal(ingestRes.insertedCount, 1);
    const newId = ingestRes.insertedIds[0];

    try {
      // 1. Verify RLS protection: direct client SELECT returns 0 rows because is_published = false
      const { data: rlsCheck } = await supabase
        .from('questions')
        .select('id')
        .eq('id', newId);
      assert.equal(rlsCheck.length, 0, 'Unpublished draft must be protected from direct client SELECT by RLS');

      // 2. Verify retrieval and persistence via administrative getPendingQuestions RPC
      const pendingList = await questionIngestionService.getPendingQuestions(50, 0, 'pending');
      const retrieved = pendingList.find(q => q.id === newId);
      assert.ok(retrieved, 'Question must be retrievable from pending review queue');
      assert.equal(retrieved.question_text, expectedCleanText, 'Persisted question text has prefix stripped and remains clean after reload');
      assert.ok(!retrieved.question_text.includes('Test Review Flow Candidate'), 'Must not contain test prefix');
      assert.equal(retrieved.options.length, 4, 'Options must be preserved intact');
      assert.equal(retrieved.source_title, 'Operating System Concepts', 'Source metadata must be preserved');
    } finally {
      // Clean up test question via RPC to avoid RLS block
      await supabase.rpc('delete_test_question', { p_question_id: newId });
    }
  });

});
