import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { mockTestService } from '../services/mockTestService';
import { studentProgressService } from '../services/studentProgressService';
import { useAuth } from '../context/AuthContext';
import { ExamBuddy } from '../components/common/ExamBuddy';
import { getScoreReaction, getSpecialEventReaction } from '../utils/examBuddyReactions';
import { CommissionBadge } from '../components/common/Badge';

export const MockTestsPage = () => {
  const [searchParams] = useSearchParams();
  const activeTestParam = searchParams.get('test');
  const { user } = useAuth();

  const [availableTests, setAvailableTests] = useState([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [activeTest, setActiveTest] = useState(null);
  const [testState, setTestState] = useState('listing'); // 'listing' | 'taking' | 'result'
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timerEnabled] = useState(true);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [testQuestions, setTestQuestions] = useState([]);
  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ExamBuddy reaction state
  const [buddyReaction, setBuddyReaction] = useState(null);
  const [reviewFilter, setReviewFilter] = useState('all'); // 'all' | 'incorrect'

  const handleStartTest = useCallback(
    async (test) => {
      if (test.isComingSoon) return;

      setActiveTest(test);
      setTimeRemaining(test.durationMinutes * 60);
      setCurrentQIndex(0);
      setUserAnswers({});
      setMarkedForReview(new Set());
      setShowConfirmModal(false);
      setCalculatedResult(null);
      setBuddyReaction(null);

      const [qRes, attRes] = await Promise.all([
        mockTestService.getMockTestQuestions(test.dbId || test.id),
        mockTestService.startAttempt(test.dbId || test.id, user?.id),
      ]);

      setTestQuestions(qRes.data || []);
      setActiveAttemptId(attRes?.attemptId || `local-${Date.now()}`);
      setTestState('taking');
    },
    [user]
  );

  // Load published mock tests from service
  useEffect(() => {
    let mounted = true;

    mockTestService.getMockTests().then((res) => {
      if (mounted) {
        setAvailableTests(res.data || []);
        setLoadingTests(false);

        if (activeTestParam) {
          const match = (res.data || []).find((t) => t.id === activeTestParam);
          if (match && !match.isComingSoon) {
            handleStartTest(match);
          }
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeTestParam, handleStartTest]);

  const handleToggleMarkReview = (qId) => {
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleFinalSubmit = useCallback(async () => {
    setShowConfirmModal(false);
    if (!activeTest || !testQuestions.length || isSubmitting) return;

    setIsSubmitting(true);

    // Deterministic Scoring Calculation based on question records
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    testQuestions.forEach((q) => {
      const chosen = userAnswers[q.id];
      if (chosen === undefined) {
        unansweredCount++;
      } else if (chosen === q.correctAnswer) {
        correctCount++;
      } else {
        incorrectCount++;
        // Automatically save mistake to the student's Mistake Notebook!
        studentProgressService.recordMistake({
          questionId: q.id,
          questionText: q.question,
          selectedOption: chosen,
          correctOption: q.correctAnswer,
          explanation: q.explanation,
          subject: q.subject,
          topic: q.topic,
          options: q.options,
        });
      }
    });

    const penaltyRate = activeTest.negativeMarking || 0;
    const rawScore = correctCount * 1 - incorrectCount * penaltyRate;
    const finalScore = Math.max(0, parseFloat(rawScore.toFixed(2)));
    const totalPossible = testQuestions.length;
    const accuracy = totalPossible > 0 ? Math.round((correctCount / (correctCount + incorrectCount || 1)) * 100) : 0;
    const scorePercentage = totalPossible > 0 ? (finalScore / totalPossible) * 100 : 0;

    const resultObj = {
      testId: activeTest.id,
      testTitle: activeTest.title,
      totalQuestions: totalPossible,
      correctCount,
      incorrectCount,
      unansweredCount,
      score: finalScore,
      totalMarks: totalPossible,
      accuracy,
      penaltyRate,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    // Check previous attempts for improvement reaction
    const previousAttempts = studentProgressService.getTestAttempts();
    const prevSameTest = previousAttempts.find((a) => a.testId === activeTest.id);
    const hasImproved = prevSameTest && resultObj.score > prevSameTest.score;
    const isFirstEver = previousAttempts.length === 0;

    // If live server attempt, submit for authoritative server-side scoring
    if (activeAttemptId && !String(activeAttemptId).startsWith('local-')) {
      try {
        const serverScore = await mockTestService.submitAttempt(activeAttemptId, userAnswers);
        if (serverScore && serverScore.data) {
          resultObj.score = serverScore.data.score;
          resultObj.correctCount = serverScore.data.correct_count;
          resultObj.incorrectCount = serverScore.data.incorrect_count;
          resultObj.unansweredCount = serverScore.data.unanswered_count;
          resultObj.accuracy = serverScore.data.accuracy;
        }
      } catch (err) {
        console.warn('Server score submission fallback:', err);
      }
    }

    // Persist to storage service
    studentProgressService.saveTestAttempt(resultObj);

    // Determine ExamBuddy Reaction
    const prefs = studentProgressService.getMascotPreferences();
    let reaction = getScoreReaction(scorePercentage, prefs.mode);

    if (hasImproved) {
      const improveMsg = getSpecialEventReaction('improvedOverPrevious', prefs.mode);
      reaction = { ...reaction, message: improveMsg, badge: 'Improvement Detected' };
    } else if (isFirstEver) {
      const firstMsg = getSpecialEventReaction('firstTestCompleted', prefs.mode);
      reaction = { ...reaction, message: firstMsg, badge: 'First Benchmark' };
    }

    setBuddyReaction(reaction);
    setCalculatedResult(resultObj);
    setIsSubmitting(false);
    setTestState('result');
  }, [activeTest, testQuestions, userAnswers, isSubmitting, activeAttemptId]);

  // Countdown timer hook
  useEffect(() => {
    if (testState !== 'taking' || !timerEnabled) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [testState, timerEnabled, handleFinalSubmit]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // 1. LISTING MODE
  if (testState === 'listing') {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="border-b border-[#E2E8F0] pb-5 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CommissionBadge commission="FPSC" showComingSoon={false} />
            <span className="text-xs font-semibold text-slate-500">
              Federal Public Service Commission Simulations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#15233B]">
            Timed Mock Tests & Exam Simulations
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Simulate actual FPSC examination conditions with countdown timers, deterministic negative marking penalties, and automatic mistake notebook logging.
          </p>
        </div>

        {loadingTests ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-[#E2E8F0] rounded-md">
            Loading available mock tests...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableTests.map((test) => {
              const isComingSoon = test.isComingSoon || test.commission !== 'FPSC';

              return (
                <div
                  key={test.id}
                  className={`bg-white rounded-md p-5 border flex flex-col justify-between space-y-4 ${
                    isComingSoon
                      ? 'border-slate-200 opacity-75'
                      : 'border-[#E2E8F0] hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CommissionBadge commission={test.commission} showComingSoon={isComingSoon} />
                        <span className="text-xs text-[#64748B]">
                          {test.durationMinutes} Minutes
                        </span>
                      </div>

                      {test.negativeMarking > 0 ? (
                        <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          -{test.negativeMarking} Penalty
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          No Negative Marking
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-[#15233B]">
                      {test.title}
                    </h2>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      {test.description}
                    </p>

                    <div className="bg-[#F8FAFC] rounded p-2.5 border border-[#E2E8F0] text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#64748B]">Questions:</span>
                        <span className="text-[#172033] font-medium">{test.totalQuestions} MCQs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#64748B]">Category:</span>
                        <span className="text-[#172033] font-medium">{test.category}</span>
                      </div>
                    </div>
                  </div>

                  {isComingSoon ? (
                    <button
                      disabled
                      className="w-full py-2 px-4 rounded-md bg-slate-100 text-slate-400 font-medium text-xs cursor-not-allowed border border-slate-200"
                    >
                      Coming Soon in Stage 4
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartTest(test)}
                      className="w-full py-2 px-4 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Simulation</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2. TAKING TEST MODE
  if (testState === 'taking' && activeTest) {
    const currentQuestion = testQuestions[currentQIndex];
    const answeredCount = Object.keys(userAnswers).length;

    return (
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Top Control Bar with Timer */}
        <div className="bg-[#15233B] text-white rounded-md px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-sm truncate max-w-xs sm:max-w-md">
              {activeTest.title}
            </h2>
            <span className="text-xs text-slate-300">
              Answered {answeredCount} of {testQuestions.length} • Marked for review:{' '}
              {markedForReview.size}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {timerEnabled && (
              <div
                className={`flex items-center gap-1.5 font-mono text-sm sm:text-base font-bold px-3 py-1 rounded ${
                  timeRemaining < 120
                    ? 'bg-rose-900 text-rose-200 animate-pulse'
                    : 'bg-slate-800 text-slate-100'
                }`}
              >
                <Clock className="w-4 h-4 text-[#3156A6]" />
                <span>{formatTime(timeRemaining)}</span>
              </div>
            )}

            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
            >
              Finish & Submit
            </button>
          </div>
        </div>

        {testQuestions.length === 0 ? (
          <div className="bg-white rounded-md p-10 border border-[#E2E8F0] text-center space-y-4">
            <h3 className="text-lg font-bold text-[#15233B]">No Questions Published</h3>
            <p className="text-xs text-[#64748B]">This test currently contains no published question records.</p>
            <button
              onClick={() => setTestState('listing')}
              className="px-4 py-2 bg-[#3156A6] text-white rounded text-xs font-semibold"
            >
              Back to Mock Tests
            </button>
          </div>
        ) : (
          <>
            {/* Question Palette Navigation Bar */}
            <div className="bg-white rounded-md p-3.5 border border-[#E2E8F0] space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#64748B]">
            <span>Question Palette</span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3156A6]"></span> Answered
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Review
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> Unanswered
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {testQuestions.map((q, idx) => {
              const isAnswered = userAnswers[q.id] !== undefined;
              const isMarked = markedForReview.has(q.id);
              const isCurrent = idx === currentQIndex;

              let btnStyle = 'bg-slate-100 text-slate-700 hover:bg-slate-200';
              if (isMarked) btnStyle = 'bg-amber-100 text-amber-900 border border-amber-300';
              else if (isAnswered) btnStyle = 'bg-[#3156A6] text-white';

              if (isCurrent) btnStyle += ' ring-2 ring-[#15233B]';

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`w-8 h-8 rounded text-xs font-bold transition-all ${btnStyle}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Question Display */}
        {currentQuestion && (
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-6">
            <div className="flex items-center justify-between text-xs text-[#64748B] border-b border-[#E2E8F0] pb-3">
              <span className="font-semibold text-[#15233B]">
                Question {currentQIndex + 1} of {testQuestions.length}
              </span>
              <button
                type="button"
                onClick={() => handleToggleMarkReview(currentQuestion.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  markedForReview.has(currentQuestion.id)
                    ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
                    : 'bg-white text-slate-600 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                {markedForReview.has(currentQuestion.id) ? 'Marked for Review' : 'Mark for Review'}
              </button>
            </div>

            <p className="text-base sm:text-lg font-bold text-[#15233B] leading-relaxed">
              {currentQuestion.question}
            </p>

            {/* Answer Options */}
            <div className="space-y-2.5">
              {(currentQuestion.options || []).map((opt, idx) => {
                const letter = ['A', 'B', 'C', 'D'][idx];
                const isChosen = userAnswers[currentQuestion.id] === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setUserAnswers((prev) => ({
                        ...prev,
                        [currentQuestion.id]: idx,
                      }))
                    }
                    className={`w-full p-3.5 rounded-md border text-left text-xs sm:text-sm flex items-center justify-between transition-colors ${
                      isChosen
                        ? 'border-[#3156A6] bg-blue-50/70 text-[#172033] font-semibold'
                        : 'border-[#E2E8F0] bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                          isChosen
                            ? 'bg-[#3156A6] text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {letter}
                      </span>
                      <span>{opt}</span>
                    </div>

                    {isChosen && (
                      <span className="text-xs font-semibold text-[#3156A6]">Selected</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Prev / Next Navigation Row */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
              <button
                onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentQIndex === 0}
                className="px-4 py-2 border border-[#E2E8F0] rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-2">
                {userAnswers[currentQuestion.id] !== undefined && (
                  <button
                    onClick={() => {
                      setUserAnswers((prev) => {
                        const copy = { ...prev };
                        delete copy[currentQuestion.id];
                        return copy;
                      });
                    }}
                    className="text-xs text-rose-600 hover:underline px-2 py-1"
                  >
                    Clear Choice
                  </button>
                )}

                {currentQIndex < testQuestions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQIndex((prev) => prev + 1)}
                    className="px-4 py-2 bg-[#15233B] hover:bg-slate-900 text-white rounded-md text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold"
                  >
                    Submit Test
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </>
      )}

        {/* Submit Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-md max-w-sm w-full p-6 space-y-4 border border-[#E2E8F0]">
              <h3 className="font-bold text-base text-[#15233B]">
                Confirm Test Submission
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                You have answered <strong>{answeredCount}</strong> out of{' '}
                <strong>{testQuestions.length}</strong> questions.{' '}
                {activeTest.negativeMarking > 0
                  ? `Incorrect attempts incur a deduction of ${activeTest.negativeMarking} marks. Unanswered questions carry no penalty.`
                  : 'No negative marking applies.'}
              </p>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3.5 py-2 border border-[#E2E8F0] rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Return to Test
                </button>
                <button
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Scoring...' : 'Confirm & Score'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. RESULTS & EXAMBUDDY MODE
  if (testState === 'result' && calculatedResult && activeTest) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ExamBuddy Scorecard Reaction Banner */}
        {buddyReaction && (
          <ExamBuddy
            reaction={buddyReaction}
            title="ExamBuddy Performance Analysis"
            onModeChange={(newMode) => {
              const updated = getScoreReaction(
                (calculatedResult.score / calculatedResult.totalMarks) * 100,
                newMode
              );
              setBuddyReaction(updated);
            }}
          />
        )}

        {/* Scorecard Hero */}
        <div className="bg-[#15233B] text-white rounded-md p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs text-slate-400 block">
                Simulation Finished • {calculatedResult.date}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold mt-1">
                {activeTest.title}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleStartTest(activeTest)}
                className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-xs font-medium text-white transition-colors"
              >
                Retake Simulation
              </button>
              <button
                onClick={() => setTestState('listing')}
                className="px-3 py-1.5 rounded bg-[#3156A6] hover:bg-blue-800 text-xs font-medium text-white transition-colors"
              >
                All Mock Tests
              </button>
            </div>
          </div>

          {/* Breakdown Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800 rounded p-3 text-center">
              <span className="text-[11px] text-slate-400 block uppercase">Net Score</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {calculatedResult.score} / {calculatedResult.totalMarks}
              </span>
            </div>
            <div className="bg-slate-800 rounded p-3 text-center">
              <span className="text-[11px] text-slate-400 block uppercase">Accuracy</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {calculatedResult.accuracy}%
              </span>
            </div>
            <div className="bg-slate-800 rounded p-3 text-center">
              <span className="text-[11px] text-slate-400 block uppercase">Correct</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                {calculatedResult.correctCount}
              </span>
            </div>
            <div className="bg-slate-800 rounded p-3 text-center">
              <span className="text-[11px] text-slate-400 block uppercase">Incorrect</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {calculatedResult.incorrectCount}
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Question Review & Explanations */}
        <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
            <div>
              <h3 className="font-bold text-base text-[#15233B]">
                Comprehensive Answer Review & Provenance
              </h3>
              {calculatedResult.incorrectCount > 0 && (
                <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 mt-1 inline-block">
                  {calculatedResult.incorrectCount} Errors Saved to Mistake Notebook
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewFilter('all')}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  reviewFilter === 'all'
                    ? 'bg-[#15233B] text-white border-[#15233B]'
                    : 'bg-white text-slate-600 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                All Questions ({testQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter('incorrect')}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  reviewFilter === 'incorrect'
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-white text-rose-700 border-[#E2E8F0] hover:bg-rose-50'
                }`}
              >
                Review Mistakes Only ({calculatedResult.incorrectCount})
              </button>
            </div>
          </div>

          <div className="space-y-6 divide-y divide-[#E2E8F0]">
            {testQuestions
              .filter((q) => {
                if (reviewFilter === 'incorrect') {
                  const chosen = userAnswers[q.id];
                  return chosen !== undefined && chosen !== q.correctAnswer;
                }
                return true;
              })
              .map((q, idx) => {
              const chosen = userAnswers[q.id];
              const isCorrect = chosen !== undefined && chosen === q.correctAnswer;
              const isUnanswered = chosen === undefined;

              return (
                <div key={q.id} className="pt-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#15233B]">
                      Question {idx + 1}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : isUnanswered
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {isCorrect
                        ? 'Correct (+1.0)'
                        : isUnanswered
                        ? 'Skipped (0.0)'
                        : `Incorrect (-${activeTest.negativeMarking})`}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-[#15233B]">
                    {q.question}
                  </p>

                  <div className="space-y-1.5 text-xs">
                    {(q.options || []).map((opt, oIdx) => {
                      const letter = ['A', 'B', 'C', 'D'][oIdx];
                      const isChosenOpt = oIdx === chosen;
                      const isCorrectOpt = oIdx === q.correctAnswer;

                      let optClass = 'border-[#E2E8F0] bg-white text-slate-700';
                      if (isCorrectOpt) {
                        optClass = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold';
                      } else if (isChosenOpt && !isCorrect) {
                        optClass = 'border-rose-400 bg-rose-50/70 text-rose-950 font-semibold';
                      }

                      return (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded border flex items-center justify-between ${optClass}`}
                        >
                          <span>
                            <strong className="mr-2">{letter}.</strong> {opt}
                          </span>
                          <div>
                            {isChosenOpt && !isCorrect && (
                              <span className="text-xs font-semibold text-rose-700 mr-2">
                                (Your Selection)
                              </span>
                            )}
                            {isCorrectOpt && (
                              <span className="text-xs font-semibold text-emerald-700">
                                (Official Answer Key)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-xs text-slate-700 space-y-1">
                      <p>
                        <strong className="text-[#15233B]">Academic Explanation:</strong> {q.explanation}
                      </p>
                      {q.sourceTitle && (
                        <p className="text-[11px] text-[#64748B] pt-1 border-t border-slate-200">
                          <strong>Proven Source:</strong> {q.sourceTitle}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
