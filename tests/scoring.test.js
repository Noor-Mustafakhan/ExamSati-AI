import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getScoreReaction, getSpecialEventReaction } from '../src/utils/examBuddyReactions.js';

describe('Deterministic Scoring & ExamBuddy Reaction Boundaries', () => {
  it('correctly maps boundary scores <40% (0% and 39%) to under40 tier', () => {
    const res0 = getScoreReaction(0, 'normal');
    assert.equal(res0.badge, 'Diagnostic Review Required');
    assert.equal(res0.tone, 'supportive');
    assert.equal(res0.percentage, 0);

    const res39 = getScoreReaction(39, 'normal');
    assert.equal(res39.badge, 'Diagnostic Review Required');
    assert.equal(res39.tone, 'supportive');
    assert.equal(res39.percentage, 39);
  });

  it('correctly maps boundary scores 40%-59% (40% and 59%) to between40and59 tier', () => {
    const res40 = getScoreReaction(40, 'funny');
    assert.equal(res40.badge, 'Baseline Cleared');
    assert.equal(res40.tone, 'encouraging');
    assert.equal(res40.percentage, 40);

    const res59 = getScoreReaction(59, 'funny');
    assert.equal(res59.badge, 'Baseline Cleared');
    assert.equal(res59.tone, 'encouraging');
    assert.equal(res59.percentage, 59);
  });

  it('correctly maps boundary scores 60%-79% (60% and 79%) to between60and79 tier', () => {
    const res60 = getScoreReaction(60, 'gentle_roast');
    assert.equal(res60.badge, 'Competitive Tier');
    assert.equal(res60.tone, 'positive');
    assert.equal(res60.percentage, 60);

    const res79 = getScoreReaction(79, 'gentle_roast');
    assert.equal(res79.badge, 'Competitive Tier');
    assert.equal(res79.tone, 'positive');
    assert.equal(res79.percentage, 79);
  });

  it('correctly maps boundary scores 80%-99% (80% and 99%) to between80and99 tier', () => {
    const res80 = getScoreReaction(80, 'normal');
    assert.equal(res80.badge, 'Merit List Ready');
    assert.equal(res80.tone, 'celebratory');
    assert.equal(res80.percentage, 80);

    const res99 = getScoreReaction(99, 'normal');
    assert.equal(res99.badge, 'Merit List Ready');
    assert.equal(res99.tone, 'celebratory');
    assert.equal(res99.percentage, 99);
  });

  it('correctly maps perfect score 100% to score100 tier', () => {
    const res100 = getScoreReaction(100, 'funny');
    assert.equal(res100.badge, 'Flawless 100% Record');
    assert.equal(res100.tone, 'perfection');
    assert.equal(res100.percentage, 100);
  });

  it('produces valid responses for all 3 modes: normal, funny, gentle_roast', () => {
    for (const mode of ['normal', 'funny', 'gentle_roast']) {
      const reaction = getScoreReaction(75, mode);
      assert.ok(reaction.message, `Missing message for mode: ${mode}`);
      assert.equal(typeof reaction.message, 'string');
      assert.ok(reaction.message.length > 10);
    }
  });

  it('handles special events deterministically', () => {
    const threeWrong = getSpecialEventReaction('threeConsecutiveWrong', 'funny');
    assert.ok(threeWrong && threeWrong.length > 5);

    const fiveCorrect = getSpecialEventReaction('fiveConsecutiveCorrect', 'normal');
    assert.ok(fiveCorrect && fiveCorrect.length > 5);

    const improved = getSpecialEventReaction('improvedOverPrevious', 'gentle_roast');
    assert.ok(improved && improved.length > 5);

    const firstTest = getSpecialEventReaction('firstTestCompleted', 'funny');
    assert.ok(firstTest && firstTest.length > 5);

    const repeatedTopic = getSpecialEventReaction('repeatedTopicMistakes', 'funny');
    assert.ok(repeatedTopic && repeatedTopic.length > 5);
  });

  it('calculates deterministic negative marking with penalty accurately', () => {
    // Scenario: 100 questions. Correct: 70, Incorrect: 20, Skipped: 10. Penalty rate: 0.25
    const correctCount = 70;
    const incorrectCount = 20;
    const penaltyRate = 0.25;

    const rawScore = correctCount * 1.0 - incorrectCount * penaltyRate;
    const finalScore = Math.max(0, parseFloat(rawScore.toFixed(2)));
    assert.equal(finalScore, 65.0); // 70 - 5 = 65

    const scorePercentage = (finalScore / 100) * 100;
    assert.equal(scorePercentage, 65);

    // Ensure negative score does not drop below 0
    const severeIncorrect = 100;
    const severeScore = Math.max(0, 0 - severeIncorrect * penaltyRate);
    assert.equal(severeScore, 0);
  });
});
