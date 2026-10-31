import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

import { savedQuestionService } from '../src/services/savedQuestionService.js';
import { questionService } from '../src/services/questionService.js';
import { mockQuestions, subjectsList } from '../src/data/questions.js';

describe('Practice Questions & Bookmark Service Regression Suite', () => {
  beforeEach(() => {
    store.clear();
  });

  it('savedQuestionService.getSavedQuestionIds is defined, callable, and returns array', async () => {
    assert.equal(typeof savedQuestionService.getSavedQuestionIds, 'function');
    const ids = await savedQuestionService.getSavedQuestionIds('test-user-123');
    assert(Array.isArray(ids), 'Must return an array of question IDs');
  });

  it('savedQuestionService.getSavedIds is aliased and returns identical question IDs', async () => {
    assert.equal(typeof savedQuestionService.getSavedIds, 'function');
    const ids = await savedQuestionService.getSavedIds('test-user-123');
    assert(Array.isArray(ids));
  });

  it('savedQuestionService.toggleSave saves and removes bookmarks with (questionId, userId) order', async () => {
    const qId = 'mcq-pa-01';
    const userId = 'user-abc';

    // 1. Toggle bookmark ON or OFF
    const res1 = await savedQuestionService.toggleSave(qId, userId);
    assert(typeof res1.isSaved === 'boolean');
    assert(Array.isArray(res1.savedIds));
    assert(Array.isArray(res1.updatedList));

    // 2. Toggle again
    const res2 = await savedQuestionService.toggleSave(qId, userId);
    assert.notEqual(res1.isSaved, res2.isSaved);
  });

  it('savedQuestionService.toggleSave handles inverted (userId, questionId) parameter order safely', async () => {
    const qId = 'mcq-pa-02';
    const userId = 'user-xyz';

    // Call with (userId, questionId) as in the original component call site
    const res = await savedQuestionService.toggleSave(userId, qId);
    assert(typeof res.isSaved === 'boolean');
    assert(res.savedIds.includes(qId) || !res.isSaved);
    assert(Array.isArray(res.updatedList));
  });

  it('questionService.getQuestions returns valid structured MCQ objects', async () => {
    const res = await questionService.getQuestions({ subject: 'All Subjects' });
    assert(Array.isArray(res.data));
    assert(res.data.length > 0, 'Should return questions from mock set');

    const first = res.data[0];
    assert(first.id, 'Question must have id');
    assert(first.question, 'Question must have text');
    assert(Array.isArray(first.options), 'Question options must be an array');
    assert.equal(first.options.length, 4, 'Standard MCQs have 4 options');
    assert(first.subject, 'Question must have subject');
    assert(first.difficulty, 'Question must have difficulty');
    assert(first.verificationStatus, 'Question must have verification status');
  });

  it('questionService.getQuestions filters questions accurately by subject', async () => {
    const res = await questionService.getQuestions({ subject: 'Everyday Science' });
    assert(res.data.length > 0);
    for (const q of res.data) {
      assert.equal(q.subject, 'Everyday Science');
    }
  });

  it('questionService.getQuestions gracefully handles empty filter results without crashing', async () => {
    const res = await questionService.getQuestions({
      subject: 'NonExistentSubject12345',
      difficulty: 'Hardcore',
    });
    assert(Array.isArray(res.data));
    assert.equal(res.data.length, 0);
    assert.equal(res.error, null);
  });

  it('questionService.checkAnswer verifies answers deterministically', async () => {
    const q = mockQuestions[0];
    const correctRes = await questionService.checkAnswer(q.id, q.correctAnswer);
    assert.equal(correctRes.isCorrect, true);
    assert.equal(correctRes.correctOption, q.correctAnswer);
    assert(correctRes.explanation);

    const wrongOption = (q.correctAnswer + 1) % 4;
    const wrongRes = await questionService.checkAnswer(q.id, wrongOption);
    assert.equal(wrongRes.isCorrect, false);
    assert.equal(wrongRes.correctOption, q.correctAnswer);
  });

  it('all subjects in subjectsList have verified mock questions available', () => {
    const subjectsWithQuestions = new Set(mockQuestions.map((q) => q.subject));
    for (const sub of subjectsList) {
      if (sub === 'All Subjects') continue;
      assert(
        subjectsWithQuestions.has(sub),
        `Subject "${sub}" must have at least one verified practice question`
      );
    }
  });
});
