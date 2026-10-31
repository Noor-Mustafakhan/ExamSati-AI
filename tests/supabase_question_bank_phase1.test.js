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
import { questionService } from '../src/services/questionService.js';
import { studentProgressService } from '../src/services/studentProgressService.js';

describe('Supabase Question Bank Phase 1 Audit & Verification Suite', () => {
  // 1. Verify Database Client & Configuration
  it('1. Supabase client is properly configured and connected to the project', async () => {
    assert.equal(isSupabaseConfigured, true, 'isSupabaseConfigured must be true');
    assert.ok(supabase, 'Supabase client must be instantiated');

    // Perform real read against commissions
    const { data, error } = await supabase.from('commissions').select('code, name');
    assert.equal(error, null, 'Commissions query must not produce error');
    assert.ok(Array.isArray(data) && data.length >= 6, 'Must return at least 6 testing agencies');
  });

  // 2. Verify Migrations 001 through 006 are applied and live
  it('2. Migrations 001 through 006 tables and records exist in database', async () => {
    // Check subjects table (including Computer Science from 006)
    const { data: subjects, error: sErr } = await supabase.from('subjects').select('slug, name');
    assert.equal(sErr, null);
    const subjectSlugs = subjects.map((s) => s.slug);
    assert.ok(subjectSlugs.includes('computer-science'), 'Computer Science subject must exist in DB');
    assert.ok(subjectSlugs.includes('pakistan-affairs'), 'Pakistan Affairs subject must exist in DB');

    // Check exams table (all 4 required exam profiles)
    const { data: exams, error: eErr } = await supabase.from('exams').select('slug, title');
    assert.equal(eErr, null);
    const examSlugs = exams.map((e) => e.slug);
    assert.ok(examSlugs.includes('fpsc-ad-fia-2026'), 'Assistant Director FIA exam must exist');
    assert.ok(examSlugs.includes('fpsc-inspector-customs-2026'), 'Inspector Customs exam must exist');
    assert.ok(examSlugs.includes('fpsc-lecturer-cs-2026'), 'Lecturer CS exam must exist');
    assert.ok(examSlugs.includes('fpsc-computer-programmer-2026'), 'Computer Programmer exam must exist');
  });

  // 3. Question Retrieval for All 4 Profiles with >15 Questions Each
  it('3. Every required exam profile returns >15 verified questions from Supabase', async () => {
    // Profile 1: Assistant Director FIA
    const fiaRes = await questionService.getQuestions({ examId: 'fpsc-ad-fia-2026' });
    assert.equal(fiaRes.error, null);
    assert.equal(fiaRes.isLive, true);
    assert.ok(fiaRes.data.length >= 20, `FIA AD must have at least 20 questions, got ${fiaRes.data.length}`);

    // Profile 2: Inspector Customs / Intelligence Officer
    const customsRes = await questionService.getQuestions({ examId: 'fpsc-inspector-customs-2026' });
    assert.equal(customsRes.error, null);
    assert.equal(customsRes.isLive, true);
    assert.ok(customsRes.data.length >= 20, `Inspector Customs must have at least 20 questions, got ${customsRes.data.length}`);

    // Profile 3: Computer Science Lecturer
    const csLectRes = await questionService.getQuestions({ examId: 'fpsc-lecturer-cs-2026' });
    assert.equal(csLectRes.error, null);
    assert.equal(csLectRes.isLive, true);
    assert.ok(csLectRes.data.length >= 20, `CS Lecturer must have at least 20 questions, got ${csLectRes.data.length}`);

    // Profile 4: Computer Programmer
    const progRes = await questionService.getQuestions({ examId: 'fpsc-computer-programmer-2026' });
    assert.equal(progRes.error, null);
    assert.equal(progRes.isLive, true);
    assert.ok(progRes.data.length >= 20, `Computer Programmer must have at least 20 questions, got ${progRes.data.length}`);
  });

  // 4. Different profiles do NOT share the same questions
  it('4. Exam profiles return distinct, specialized question banks without overlap', async () => {
    const fiaRes = await questionService.getQuestions({ examId: 'fpsc-ad-fia-2026' });
    const progRes = await questionService.getQuestions({ examId: 'fpsc-computer-programmer-2026' });

    const fiaIds = new Set(fiaRes.data.map((q) => q.id));
    const overlap = progRes.data.filter((q) => fiaIds.has(q.id));

    assert.equal(overlap.length, 0, 'FIA AD and Computer Programmer must not accidentally share the same questions');
  });

  // 5. Configurable Quiz Length (5, 10, 15, 20)
  it('5. Quiz length is dynamically configurable based on approved questions', async () => {
    const quiz5 = await questionService.getQuestions({ examId: 'fpsc-ad-fia-2026', limit: 5 });
    assert.equal(quiz5.data.length, 5, 'Must return exactly 5 questions when limit=5');
    assert.ok(quiz5.totalAvailable >= 20, 'totalAvailable must reflect total available approved questions');

    const quiz10 = await questionService.getQuestions({ examId: 'fpsc-ad-fia-2026', limit: 10 });
    assert.equal(quiz10.data.length, 10, 'Must return exactly 10 questions when limit=10');

    const quiz15 = await questionService.getQuestions({ examId: 'fpsc-ad-fia-2026', limit: 15 });
    assert.equal(quiz15.data.length, 15, 'Must return exactly 15 questions when limit=15');
  });

  // 6. Varied Sets Without Duplicate Questions
  it('6. Question selection does not contain duplicate questions', async () => {
    const res = await questionService.getQuestions({ examId: 'fpsc-inspector-customs-2026', limit: 20 });
    const ids = res.data.map((q) => q.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length, 'All retrieved questions must have unique IDs');

    const texts = res.data.map((q) => q.question.trim().toLowerCase());
    const uniqueTexts = new Set(texts);
    assert.equal(uniqueTexts.size, texts.length, 'Retrieved questions must have unique question text');
  });

  // 7. Deterministic Scoring via Stored Answer Key (check_mcq_answer RPC)
  it('7. Scoring uses stored database answer keys rather than LLM judgment', async () => {
    // FIA Question 1: "Under Section 3 of the FIA Act, 1974..." Correct option: 0 ("The Federal Government")
    const questionId = 'f1000000-0000-0000-0001-000000000001';

    // Verify correct attempt
    const correctRes = await questionService.checkAnswer(questionId, 0);
    assert.equal(correctRes.isCorrect, true, 'Option 0 must be marked correct');
    assert.equal(correctRes.correctOption, 0);
    assert.ok(correctRes.explanation.includes('Federal Government'));
    assert.ok(correctRes.sourceTitle.includes('Federal Investigation Agency Act, 1974'));

    // Verify incorrect attempt
    const wrongRes = await questionService.checkAnswer(questionId, 2);
    assert.equal(wrongRes.isCorrect, false, 'Option 2 must be marked incorrect');
    assert.equal(wrongRes.correctOption, 0);
  });

  // 8. RLS Security: Public cannot read private answer_keys table directly
  it('8. Database RLS protects private.answer_keys from direct client queries', async () => {
    const { data, error } = await supabase.from('answer_keys').select('*');
    // Schema cache or permission denial ensures direct query is blocked
    assert.ok(error !== null || (data && data.length === 0), 'Direct query to answer_keys must be denied/not found');
  });

  // 9. Preserves Student Progress & Mistakes
  it('9. Student mistakes notebook and attempt records remain intact', () => {
    const initialCount = studentProgressService.getMistakes().length;
    studentProgressService.recordMistake({
      questionId: 'test-db-q-01',
      questionText: 'Under Section 5 of FIA Act, what powers do officers hold?',
      selectedOption: 0,
      correctOption: 1,
      explanation: 'Powers of officer in charge of police station.',
      subject: 'Pakistan Affairs',
      topic: 'FIA Act 1974',
    });

    const afterCount = studentProgressService.getMistakes().length;
    assert.equal(afterCount, initialCount + 1, 'Mistake should be recorded without error');

    // Resolve mistake
    studentProgressService.resolveMistake('test-db-q-01');
    const mistake = studentProgressService.getMistakes().find((m) => m.questionId === 'test-db-q-01');
    assert.equal(mistake.mastered, true, 'Mistake should be marked mastered');
  });

  // 10. Live Mock Tests & Question Mapping Integrity
  it('10. Live Mock Tests retrieve mapped questions from Supabase without mock fallback', async () => {
    const { mockTestService } = await import('../src/services/mockTestService.js');
    // b1000000-0000-0000-0000-000000000002 is the FIA AD Mock Simulation (20 mapped questions)
    const fiaMockRes = await mockTestService.getMockTestQuestions('b1000000-0000-0000-0000-000000000002');
    assert.equal(fiaMockRes.error, null);
    assert.equal(fiaMockRes.isLive, true);
    assert.ok(fiaMockRes.data.length >= 20, `FIA Mock Test must contain at least 20 questions, got ${fiaMockRes.data.length}`);

    // Verify non-existent ID returns empty array rather than injecting mock questions
    const invalidRes = await mockTestService.getMockTestQuestions('00000000-0000-0000-0000-000000000000');
    assert.equal(invalidRes.error, null);
    assert.equal(invalidRes.data.length, 0, 'Non-existent mock test must return empty array, not mock questions');
  });
});
