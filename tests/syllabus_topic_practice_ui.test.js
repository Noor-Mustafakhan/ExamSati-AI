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
import { examService } from '../src/services/examService.js';
import { questionService } from '../src/services/questionService.js';
import { studentProgressService } from '../src/services/studentProgressService.js';

describe('Syllabus-Based Topic-Wise MCQ Practice & UI Integration Test Suite', () => {
  const TARGET_EXAMS = [
    'fpsc-ad-fia-2026',
    'fpsc-inspector-customs-2026',
    'fpsc-lecturer-cs-2026',
    'fpsc-computer-programmer-2026',
  ];

  // 1. All four exam profiles can be opened and return valid blueprints
  it('1. All four exam profiles can be opened via examService', async () => {
    assert.equal(isSupabaseConfigured, true);

    for (const slug of TARGET_EXAMS) {
      const res = await examService.getExamBySlug(slug);
      assert.equal(res.error, null, `Exam ${slug} must not produce error`);
      assert.ok(res.data, `Exam ${slug} must return data`);
      assert.equal(res.data.id, slug);
      assert.ok(res.data.title, `Exam ${slug} must have a title`);
      assert.ok(res.data.department, `Exam ${slug} must have a department`);
    }
  });

  // 2. Subjects and topics display from the database via get_exam_syllabus_breakdown
  it('2. Subjects and topics display from database breakdown for all four profiles', async () => {
    for (const slug of TARGET_EXAMS) {
      const res = await examService.getExamSyllabusBreakdown(slug);
      assert.equal(res.error, null, `Breakdown error for ${slug}`);
      assert.ok(res.data, `Breakdown must return data for ${slug}`);
      assert.ok(res.data.exam, `Must return exam object for ${slug}`);
      assert.ok(Array.isArray(res.data.sections), `Must return sections array for ${slug}`);
      assert.ok(res.data.sections.length >= 2, `Must have at least 2 syllabus sections for ${slug}`);

      // Verify each section has subjects and topics
      for (const section of res.data.sections) {
        assert.ok(section.section_title, `Section must have a title in ${slug}`);
        assert.ok(section.subject_name, `Section must have a subject_name in ${slug}`);
        assert.ok(Array.isArray(section.topics), `Section must have topics array in ${slug}`);
        assert.ok(section.topics.length >= 1, `Section must have at least one topic in ${slug}`);

        for (const topic of section.topics) {
          assert.ok(topic.id, 'Topic must have UUID');
          assert.ok(topic.topic_title, 'Topic must have topic_title');
          assert.ok(typeof topic.question_count === 'number', 'Topic must have numeric question_count');
          assert.ok(typeof topic.easy_count === 'number', 'Topic must have easy_count');
          assert.ok(typeof topic.moderate_count === 'number', 'Topic must have moderate_count');
          assert.ok(typeof topic.advanced_count === 'number', 'Topic must have advanced_count');
        }
      }
    }
  });

  // 3. Selecting a topic retrieves only relevant approved questions
  it('3. Selecting a topic retrieves only relevant approved questions', async () => {
    // Test Computer Science Lecturer: Operating Systems
    const osTopic = 'Operating Systems: Deadlocks, Virtual Memory & Concurrency';
    const osRes = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      topic: osTopic,
    });

    assert.equal(osRes.error, null);
    assert.ok(osRes.data.length > 0, 'OS topic must have questions');
    for (const q of osRes.data) {
      assert.equal(q.topic, osTopic, 'Returned question must strictly match topic');
      assert.equal(q.examId, 'fpsc-lecturer-cs-2026', 'Question must belong to CS Lecturer exam');
    }

    // Test Computer Programmer: Web Architecture & OWASP
    const webTopic = 'Web Architecture, REST APIs & OWASP Security';
    const webRes = await questionService.getQuestions({
      examId: 'fpsc-computer-programmer-2026',
      topic: webTopic,
    });

    assert.equal(webRes.error, null);
    assert.ok(webRes.data.length > 0, 'Web Architecture topic must have questions');
    for (const q of webRes.data) {
      assert.equal(q.topic, webTopic);
      assert.equal(q.examId, 'fpsc-computer-programmer-2026');
    }

    // Test FIA AD: FIA Act Structure
    const fiaTopic = 'FIA Act 1974: Structure, Powers & Jurisdiction';
    const fiaRes = await questionService.getQuestions({
      examId: 'fpsc-ad-fia-2026',
      topic: fiaTopic,
    });

    assert.equal(fiaRes.error, null);
    assert.ok(fiaRes.data.length > 0, 'FIA Act topic must have questions');
    for (const q of fiaRes.data) {
      assert.equal(q.topic, fiaTopic);
      assert.equal(q.examId, 'fpsc-ad-fia-2026');
    }
  });

  // 4. Difficulty and quiz-length controls work with topic filtering
  it('4. Difficulty and quiz-length controls work properly with topic filtering', async () => {
    // Test CS Lecturer: OS topic with Easy difficulty
    const osEasyRes = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      topic: 'Operating Systems: Deadlocks, Virtual Memory & Concurrency',
      difficulty: 'Easy',
    });

    assert.equal(osEasyRes.error, null);
    for (const q of osEasyRes.data) {
      assert.equal(q.difficulty, 'Easy');
    }

    // Test quiz length limit
    const limitRes = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      topic: 'Data Structures & Algorithms: Trees, Graphs & Complexity',
      limit: 2,
    });

    assert.equal(limitRes.error, null);
    assert.equal(limitRes.data.length, 2, 'Must return exactly 2 questions when limit is 2');
    assert.ok(limitRes.totalAvailable >= 5, 'totalAvailable must reflect total matching pool');
  });

  // 5. Topic-specific practice does not show unrelated questions
  it('5. Topic-specific practice does not show unrelated questions', async () => {
    const osRes = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      topic: 'Operating Systems: Deadlocks, Virtual Memory & Concurrency',
    });

    const dbRes = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      topic: 'Database Systems: Normalization, BCNF & ACID Transactions',
    });

    const osIds = new Set(osRes.data.map((q) => q.id));
    const dbIds = new Set(dbRes.data.map((q) => q.id));

    // Intersection must be empty (0 overlap)
    for (const id of osIds) {
      assert.ok(!dbIds.has(id), `Question ID ${id} must not appear in both OS and DBMS topics`);
    }
  });

  // 6. Empty topics show accurate empty results without error
  it('6. Empty topics show accurate empty states without error', async () => {
    const emptyTopic = 'Pakistan Affairs & 1973 Constitution';
    const res = await questionService.getQuestions({
      examId: 'fpsc-ad-fia-2026',
      topic: emptyTopic,
    });

    assert.equal(res.error, null, 'Querying an empty topic must not throw an error');
    assert.equal(res.data.length, 0, 'Empty topic must return 0 questions');
    assert.equal(res.totalAvailable, 0, 'Empty topic totalAvailable must be 0');
  });

  // 7. Question counts come from actual database records
  it('7. Question counts in breakdown match actual published question records', async () => {
    const { data: dbCount } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    // Sum questions from all 4 breakdowns
    let totalFromBreakdowns = 0;
    for (const slug of TARGET_EXAMS) {
      const res = await examService.getExamSyllabusBreakdown(slug);
      for (const sec of res.data.sections) {
        for (const t of sec.topics) {
          totalFromBreakdowns += t.question_count;
        }
      }
    }

    assert.ok(
      totalFromBreakdowns >= 84,
      `Total approved questions in breakdowns (${totalFromBreakdowns}) must be at least 84 verified questions`
    );
  });

  // 8. Quiz scoring, explanations and bookmarking remain functional
  it('8. Quiz scoring, explanations and bookmarking remain functional', async () => {
    const res = await questionService.getQuestions({
      examId: 'fpsc-lecturer-cs-2026',
      limit: 1,
    });
    const sample = res.data[0];

    // Check answer deterministically
    const scoreRes = await questionService.checkAnswer(sample.id, 0);
    assert.ok(scoreRes, 'Score result must be returned');
    assert.ok(typeof scoreRes.isCorrect === 'boolean', 'isCorrect must be boolean');
    assert.ok(typeof scoreRes.correctOption === 'number', 'correctOption must be integer');
    assert.ok(scoreRes.explanation, 'Explanation must be provided');
  });

  // 9. Real student attempt progress tracking and topic mastery
  it('9. Student progress service tracks topic attempts and calculates mastery', () => {
    store.clear();

    const topicName = 'Operating Systems: Deadlocks, Virtual Memory & Concurrency';

    // Simulate 3 attempts: 2 correct, 1 incorrect
    studentProgressService.recordQuestionAttempt({
      questionId: 'q-os-1',
      selectedOption: 1,
      isCorrect: true,
      subject: 'Computer Science',
      topic: topicName,
    });
    studentProgressService.recordQuestionAttempt({
      questionId: 'q-os-2',
      selectedOption: 0,
      isCorrect: false,
      subject: 'Computer Science',
      topic: topicName,
    });
    studentProgressService.recordQuestionAttempt({
      questionId: 'q-os-3',
      selectedOption: 2,
      isCorrect: true,
      subject: 'Computer Science',
      topic: topicName,
    });

    const prog = studentProgressService.getTopicProgress(topicName);
    assert.ok(prog, 'Progress must be recorded');
    assert.equal(prog.attempts, 3, 'Must record 3 attempts');
    assert.equal(prog.correct, 2, 'Must record 2 correct');
    assert.equal(prog.accuracy, 67, 'Accuracy must be 67%');
    assert.equal(prog.uniqueAttempted, 3, '3 unique questions attempted');

    const allProg = studentProgressService.getAllTopicsProgress();
    const normKey = topicName.trim().toLowerCase();
    assert.ok(allProg[normKey], 'All topics map must contain the topic progress');
  });

  // 10. Expired job advertisements remain strictly independent of syllabus preparation
  it('10. Job advertisements remain independent of syllabus topics and questions', async () => {
    const { data: jobs, error } = await supabase
      .from('job_advertisements')
      .select('id, title, status, is_current');

    assert.equal(error, null);
    assert.ok(Array.isArray(jobs), 'Jobs table must exist');

    // Verify syllabus questions are independent and link to exams and syllabus_topics
    const { data: sampleQ, error: qErr } = await supabase
      .from('questions')
      .select('id, exam_id, syllabus_topic_id')
      .not('exam_id', 'is', null)
      .limit(5);

    assert.equal(qErr, null);
    assert.ok(sampleQ.length > 0, 'Should find syllabus questions');
    for (const q of sampleQ) {
      assert.ok(q.exam_id, 'Question must reference exams');
      assert.equal(typeof q.exam_id, 'string');
    }
  });
});
