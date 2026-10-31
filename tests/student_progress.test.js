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

import { studentProgressService } from '../src/services/studentProgressService.js';

describe('Student Progress & Mistake Notebook Persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('records a new mistake with initial failure count = 1 and unmastered status', () => {
    const mistake = {
      questionId: 'q-math-101',
      questionText: 'What is 15% of 400?',
      selectedOption: 0,
      correctOption: 2,
      explanation: '15% of 400 is 60.',
      subject: 'Basic Arithmetic',
      topic: 'Percentages',
      options: ['50', '55', '60', '65'],
    };

    const recorded = studentProgressService.recordMistake(mistake);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].timesFailed, 1);
    assert.equal(recorded[0].mastered, false);
    assert.equal(recorded[0].topic, 'Percentages');
  });

  it('increments timesFailed counter on subsequent errors for the same question', () => {
    const mistake = {
      questionId: 'q-const-201',
      questionText: 'Under which article of the 1973 Constitution is the President elected?',
      selectedOption: 1,
      correctOption: 0,
      explanation: 'Article 41 specifies election of the President.',
      subject: 'Pakistan Affairs',
      topic: '1973 Constitution',
    };

    studentProgressService.recordMistake(mistake);
    const updated = studentProgressService.recordMistake(mistake);

    assert.equal(updated.length, 1);
    assert.equal(updated[0].timesFailed, 2);
    assert.equal(updated[0].mastered, false);
  });

  it('marks a mistake as mastered when resolved after successful re-practice', () => {
    studentProgressService.recordMistake({
      questionId: 'q-eng-301',
      questionText: 'Synonym of Ephemeral',
      selectedOption: 1,
      correctOption: 3,
      subject: 'English',
      topic: 'Vocabulary',
    });

    const resolved = studentProgressService.resolveMistake('q-eng-301');
    assert.equal(resolved[0].mastered, true);
    assert.ok(resolved[0].resolvedAt);
  });

  it('identifies repeated topic struggle areas for ExamBuddy coaching', () => {
    // 3 mistakes in 1973 Constitution topic
    studentProgressService.recordMistake({
      questionId: 'q-const-1',
      subject: 'Pakistan Affairs',
      topic: '1973 Constitution',
    });
    studentProgressService.recordMistake({
      questionId: 'q-const-2',
      subject: 'Pakistan Affairs',
      topic: '1973 Constitution',
    });

    const repeated = studentProgressService.getRepeatedTopicMistakes(2);
    assert.ok(repeated.some((r) => r.topic === '1973 Constitution' && r.count >= 2));
  });

  it('saves mock test attempts without overwriting historical records', () => {
    const attempt1 = {
      testId: 'fpsc-customs-mock-1',
      score: 65,
      totalMarks: 100,
      accuracy: 72,
      date: 'Oct 10, 2026',
    };
    const attempt2 = {
      testId: 'fpsc-customs-mock-1',
      score: 78,
      totalMarks: 100,
      accuracy: 84,
      date: 'Oct 11, 2026',
    };

    studentProgressService.saveTestAttempt(attempt1);
    const history = studentProgressService.saveTestAttempt(attempt2);

    assert.equal(history.length, 2);
    assert.equal(history[0].score, 78);
    assert.equal(history[1].score, 65);
  });
});
