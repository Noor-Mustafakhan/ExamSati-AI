import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Bookmark,
  Flag,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BookOpen,
  X,
  AlertTriangle,
  AlertCircle,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import { questionService } from '../services/questionService';
import { savedQuestionService } from '../services/savedQuestionService';
import { studentProgressService } from '../services/studentProgressService';
import { useAuth } from '../context/AuthContext';
import { subjectsList } from '../data/questions';
import { VerificationBadge, DifficultyBadge, CommissionBadge } from '../components/common/Badge';
import { Toast } from '../components/common/Toast';
import { ExamBuddy } from '../components/common/ExamBuddy';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { getSpecialEventReaction } from '../utils/examBuddyReactions';

export const PracticePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialExam = searchParams.get('exam') || searchParams.get('examId') || 'All';
  const initialSubject = searchParams.get('subject') || 'All Subjects';
  const initialTopic = searchParams.get('topic') || searchParams.get('topicTitle') || 'All Topics';
  const initialLimit = searchParams.get('limit') || 'All';
  const initialMistakes = searchParams.get('mistakes') === 'true';
  const { user } = useAuth();

  const [selectedExam, setSelectedExam] = useState(initialExam);
  const [selectedSubject, setSelectedSubject] = useState(initialSubject);
  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [selectedCommission, setSelectedCommission] = useState('All');
  const [selectedQuizLength, setSelectedQuizLength] = useState(initialLimit);
  const [isShuffled, setIsShuffled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [onlyMistakesMode, setOnlyMistakesMode] = useState(initialMistakes);

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [sessionAnswers, setSessionAnswers] = useState({});
  const [bookmarkedIds, setBookmarkedIds] = useState([]);

  // Streak & ExamBuddy states
  const [examBuddyEvent, setExamBuddyEvent] = useState(null);
  const [savedMistakesCount, setSavedMistakesCount] = useState(0);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('Incorrect Answer Key');
  const [reportNotes, setReportNotes] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Synchronize when URL searchParams change (e.g. navigation from other pages)
  useEffect(() => {
    const examParam = searchParams.get('exam') || searchParams.get('examId');
    if (examParam) {
      setSelectedExam(examParam);
    }
    const subjParam = searchParams.get('subject');
    if (subjParam) {
      setSelectedSubject(subjParam);
    }
    const topicParam = searchParams.get('topic') || searchParams.get('topicTitle');
    if (topicParam) {
      setSelectedTopic(topicParam);
    }
    const limitParam = searchParams.get('limit');
    if (limitParam) {
      setSelectedQuizLength(limitParam);
    }
    const mistakesParam = searchParams.get('mistakes');
    if (mistakesParam === 'true') {
      setOnlyMistakesMode(true);
    }
  }, [searchParams]);

  // Refresh mistake count
  useEffect(() => {
    const mistakes = studentProgressService.getMistakes();
    setSavedMistakesCount(mistakes.filter((m) => !m.mastered).length);
  }, []);

  // Load saved bookmarks from service safely with fallback
  useEffect(() => {
    let mounted = true;
    savedQuestionService
      .getSavedQuestionIds(user?.id)
      .then((ids) => {
        if (mounted) {
          setBookmarkedIds(ids || []);
        }
      })
      .catch((err) => {
        console.warn('Could not load saved bookmarks:', err);
        if (mounted) {
          setBookmarkedIds([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  // Load questions based on filters with reliable error reporting
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFetchError(null);

    questionService
      .getQuestions({
        examId: selectedExam,
        subject: selectedSubject,
        topic: selectedTopic,
        difficulty: selectedDifficulty,
        commission: selectedCommission,
        limit: selectedQuizLength === 'All' ? null : parseInt(selectedQuizLength, 10),
        shuffle: isShuffled,
      })
      .then((res) => {
        if (mounted) {
          if (res?.error && (!res.data || res.data.length === 0)) {
            setFetchError(res.error);
            setQuestions([]);
          } else {
            let list = res?.data || [];

            if (onlyMistakesMode) {
              const mistakes = studentProgressService.getMistakes().filter((m) => !m.mastered);
              const mistakeIds = new Set(mistakes.map((m) => m.questionId));
              list = list.filter((q) => mistakeIds.has(q.id));
            }

            setQuestions(list);
          }
          setCurrentIndex(0);
          setSelectedOption(null);
          setIsAnswerChecked(false);
          setAnswerResult(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load questions:', err);
          setFetchError(err?.message || 'Could not retrieve questions from server.');
          setQuestions([]);
          setCurrentIndex(0);
          setSelectedOption(null);
          setIsAnswerChecked(false);
          setAnswerResult(null);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedExam, selectedSubject, selectedTopic, selectedDifficulty, selectedCommission, selectedQuizLength, isShuffled, onlyMistakesMode, reloadKey]);

  const currentQuestion = (questions && questions.length > 0 && questions[currentIndex]) || (questions && questions[0]) || null;
  const currentAnswerRecord = currentQuestion ? sessionAnswers[currentQuestion.id] : null;
  const currentSelectedOption = currentAnswerRecord ? currentAnswerRecord.selected : selectedOption;
  const currentIsAnswerChecked = currentAnswerRecord ? currentAnswerRecord.checked : isAnswerChecked;
  const activeAnswerResult = currentAnswerRecord ? currentAnswerRecord.result : answerResult;


  const handleOptionSelect = (idx) => {
    if (currentIsAnswerChecked || checkingAnswer) return;
    setSelectedOption(idx);
  };

  const handleCheckAnswer = async () => {
    if (currentSelectedOption === null || !currentQuestion || checkingAnswer) return;

    setCheckingAnswer(true);
    try {
      const result = await questionService.checkAnswer(currentQuestion.id, currentSelectedOption);
      setAnswerResult(result);
      setIsAnswerChecked(true);

      // Save answer in session map
      setSessionAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          selected: currentSelectedOption,
          checked: true,
          result,
        },
      }));

      // Log attempt in student progress service
      studentProgressService.recordQuestionAttempt({
        questionId: currentQuestion.id,
        selectedOption: currentSelectedOption,
        isCorrect: result.isCorrect,
        subject: currentQuestion.subject,
        topic: currentQuestion.topic,
      });

      // Handle mistake persistence
      if (!result.isCorrect) {
        studentProgressService.recordMistake({
          questionId: currentQuestion.id,
          questionText: currentQuestion.question,
          selectedOption: currentSelectedOption,
          correctOption: result.correctOption,
          explanation: result.explanation || currentQuestion.explanation,
          subject: currentQuestion.subject,
          topic: currentQuestion.topic,
          options: currentQuestion.options,
        });

        const mistakes = studentProgressService.getMistakes();
        setSavedMistakesCount(mistakes.filter((m) => !m.mastered).length);
      } else if (onlyMistakesMode) {
        // If they answered correctly in mistakes mode, resolve it!
        studentProgressService.resolveMistake(currentQuestion.id);
        const mistakes = studentProgressService.getMistakes();
        setSavedMistakesCount(mistakes.filter((m) => !m.mastered).length);
        setToastMsg('Mistake marked as mastered and resolved!');
      }

      // Check streaks for ExamBuddy reaction
      const streak = studentProgressService.getRecentStreak();
      const prefs = studentProgressService.getMascotPreferences();

      if (streak.consecutiveIncorrect >= 3) {
        const msg = getSpecialEventReaction('threeConsecutiveWrong', prefs.mode);
        setExamBuddyEvent({ message: msg, tone: 'supportive', badge: 'Streak Alert' });
      } else if (streak.consecutiveCorrect >= 5) {
        const msg = getSpecialEventReaction('fiveConsecutiveCorrect', prefs.mode);
        setExamBuddyEvent({ message: msg, tone: 'celebratory', badge: 'Momentum Alert' });
      } else {
        setExamBuddyEvent(null);
      }
    } finally {
      setCheckingAnswer(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setAnswerResult(null);
      setExamBuddyEvent(null);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setAnswerResult(null);
      setExamBuddyEvent(null);
    }
  };

  const handleResetSession = () => {
    setSessionAnswers({});
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setAnswerResult(null);
    setExamBuddyEvent(null);
    setToastMsg('Practice session reset.');
  };

  const handleToggleBookmark = async () => {
    if (!currentQuestion?.id) return;
    try {
      const res = await savedQuestionService.toggleSave(currentQuestion.id, user?.id);
      if (res?.updatedList) {
        setBookmarkedIds(res.updatedList);
      } else {
        setBookmarkedIds((prev) =>
          res?.isSaved ? [...prev, currentQuestion.id] : prev.filter((id) => id !== currentQuestion.id)
        );
      }
      setToastMsg(res?.isSaved ? 'Question saved to bookmarks.' : 'Question removed from bookmarks.');
    } catch (err) {
      console.error('Error toggling bookmark:', err);
    }
  };

  const handleSubmitReport = (e) => {
    e.preventDefault();
    if (!currentQuestion) return;
    setReportModalOpen(false);
    setReportNotes('');
    setToastMsg('Thank you. Question reported for academic review.');
  };

  const isBookmarked = currentQuestion?.id ? bookmarkedIds.includes(currentQuestion.id) : false;

  return (
    <ErrorBoundary title="Practice Questions Workspace">
      <div className="max-w-4xl mx-auto space-y-6">
        <Toast message={toastMsg} onClose={() => setToastMsg('')} />


      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#15233B]">
              FPSC Multiple Choice Practice
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Deterministic Scoring
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Practise high-yield topics with verified explanations and automatic mistake tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedMistakesCount > 0 && (
            <button
              onClick={() => setOnlyMistakesMode(!onlyMistakesMode)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                onlyMistakesMode
                  ? 'bg-rose-700 text-white border-rose-800'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                {onlyMistakesMode ? 'Exit Mistakes Mode' : `Practice Mistakes (${savedMistakesCount})`}
              </span>
            </button>
          )}

          <button
            onClick={handleResetSession}
            className="p-2 border border-[#E2E8F0] rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title="Reset current practice session"
            aria-label="Reset session"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-md p-4 border border-[#E2E8F0] space-y-3">
        {selectedTopic && selectedTopic !== 'All Topics' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#3156A6] text-white shrink-0">
                Topic
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#15233B] truncate">
                {selectedTopic}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTopic('All Topics')}
              className="text-xs text-[#3156A6] hover:text-blue-900 font-medium hover:underline flex items-center gap-1 shrink-0 self-start sm:self-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>View all topics</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Exam Profile
            </label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              <option value="All">All Exam Profiles</option>
              <option value="fpsc-ad-fia-2026">Assistant Director FIA (BS-17)</option>
              <option value="fpsc-inspector-customs-2026">Inspector Customs / Intelligence Officer (BS-16)</option>
              <option value="fpsc-lecturer-cs-2026">Lecturer Computer Science (BS-17)</option>
              <option value="fpsc-computer-programmer-2026">Computer Programmer (BS-17)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Subject
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              {subjectsList.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Difficulty
            </label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              <option value="All">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Moderate">Moderate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Quiz Length
            </label>
            <select
              value={selectedQuizLength}
              onChange={(e) => setSelectedQuizLength(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              <option value="All">All Available</option>
              <option value="5">5 Questions</option>
              <option value="10">10 Questions</option>
              <option value="15">15 Questions</option>
              <option value="20">20 Questions</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsShuffled(!isShuffled)}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                isShuffled
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>{isShuffled ? 'Varied Shuffle Active' : 'Randomize Order'}</span>
            </button>

            <span className="text-[11px] text-slate-500">
              Showing {questions.length} question{questions.length === 1 ? '' : 's'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedExam('All');
              setSelectedSubject('All Subjects');
              setSelectedTopic('All Topics');
              setSelectedDifficulty('All');
              setSelectedCommission('All');
              setSelectedQuizLength('All');
              setIsShuffled(false);
              setOnlyMistakesMode(false);
              setReloadKey(k => k + 1);
            }}
            className="text-[11px] text-[#3156A6] hover:underline flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset all filters</span>
          </button>
        </div>
      </div>

      {/* ExamBuddy Live Streak Reactions */}
      {examBuddyEvent && (
        <ExamBuddy reaction={examBuddyEvent} title="ExamBuddy Live Reaction" />
      )}

      {/* Notice Banner if offline fallback / API notice */}
      {fetchError && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Question Retrieval Notice</p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                {fetchError}
              </p>
            </div>
          </div>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded text-[11px] transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Question Card Workspace */}
      {loading ? (
        <div className="bg-white rounded-md p-12 border border-[#E2E8F0] text-center text-xs text-slate-500">
          Loading practice questions...
        </div>
      ) : questions && questions.length > 0 && currentQuestion ? (
        <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-6">
          {/* Top Question Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <CommissionBadge commission={currentQuestion.commission} showComingSoon={false} />
              <VerificationBadge status={currentQuestion.verificationStatus} />
              <DifficultyBadge difficulty={currentQuestion.difficulty} />
              <span className="text-xs text-[#64748B] font-medium">
                {currentQuestion.subject} • {currentQuestion.topic}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleBookmark}
                className={`p-1.5 rounded-md border transition-colors ${
                  isBookmarked
                    ? 'bg-blue-50 text-[#3156A6] border-blue-200'
                    : 'text-slate-400 hover:text-slate-600 border-[#E2E8F0]'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark question'}
                aria-label="Toggle Bookmark"
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={() => setReportModalOpen(true)}
                className="p-1.5 rounded-md border border-[#E2E8F0] text-slate-400 hover:text-rose-600 transition-colors"
                title="Report question error"
                aria-label="Report Question"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span>
              {Object.keys(sessionAnswers).length} Answered
            </span>
          </div>

          {/* Question Text */}
          <p className="text-base sm:text-lg font-bold text-[#15233B] leading-relaxed">
            {currentQuestion.question}
          </p>

          {/* Options */}
          <div className="space-y-2.5">
            {(currentQuestion.options || []).map((opt, idx) => {
              const letter = ['A', 'B', 'C', 'D'][idx] || String.fromCharCode(65 + idx);
              const isSelected = currentSelectedOption === idx;

              let optionStyle =
                'border-[#E2E8F0] bg-white text-[#172033] hover:border-[#3156A6] hover:bg-slate-50';

              if (currentIsAnswerChecked && activeAnswerResult) {
                const isCorrect = idx === activeAnswerResult.correctOption;
                const isWrongSelection = isSelected && !activeAnswerResult.isCorrect;

                if (isCorrect) {
                  optionStyle = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold';
                } else if (isWrongSelection) {
                  optionStyle = 'border-rose-400 bg-rose-50/70 text-rose-950';
                } else {
                  optionStyle = 'border-[#E2E8F0] bg-slate-50 text-slate-400';
                }
              } else if (isSelected) {
                optionStyle = 'border-[#3156A6] bg-blue-50/60 text-[#172033] font-semibold';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={currentIsAnswerChecked || checkingAnswer}
                  onClick={() => handleOptionSelect(idx)}
                  className={`w-full p-3.5 rounded-md border text-left text-xs sm:text-sm flex items-center justify-between transition-colors ${optionStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? 'bg-[#3156A6] text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {letter}
                    </span>
                    <span>{opt}</span>
                  </div>

                  {currentIsAnswerChecked && activeAnswerResult && (
                    <div>
                      {idx === activeAnswerResult.correctOption && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                      {isSelected && !activeAnswerResult.isCorrect && (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-3.5 py-2 border border-[#E2E8F0] rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {!currentIsAnswerChecked ? (
              <button
                onClick={handleCheckAnswer}
                disabled={currentSelectedOption === null || checkingAnswer}
                className="px-5 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {checkingAnswer ? 'Checking...' : 'Check Answer'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentIndex === questions.length - 1}
                className="px-5 py-2 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-semibold text-xs transition-colors flex items-center gap-1 disabled:opacity-40"
              >
                <span>Next Question</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Answer Feedback & Explanation */}
          {currentIsAnswerChecked && activeAnswerResult && (
            <div className="space-y-3 pt-2">
              <div
                className={`p-3.5 rounded-md text-xs sm:text-sm border ${
                  activeAnswerResult.isCorrect
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <strong>
                  {activeAnswerResult.isCorrect
                    ? 'Correct! Option marked.'
                    : `Incorrect. The correct answer is Option ${
                        ['A', 'B', 'C', 'D'][activeAnswerResult.correctOption] || (activeAnswerResult.correctOption + 1)
                      }: "${currentQuestion.options?.[activeAnswerResult.correctOption] || 'Verified Answer'}". Saved to Mistake Notebook.`}
                </strong>
              </div>

              <div className="bg-[#F8FAFC] rounded-md p-4 border border-[#E2E8F0] space-y-2">
                <h3 className="text-xs font-bold text-[#15233B] uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#3156A6]" />
                  Explanation & Source Provenance
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {activeAnswerResult.explanation || currentQuestion.explanation}
                </p>
                <div className="pt-2 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Source:</strong> {activeAnswerResult.sourceTitle || currentQuestion.sourceTitle}
                  </span>
                  <span>
                    <strong>Status:</strong> {currentQuestion.verificationStatus}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-md p-10 border border-[#E2E8F0] text-center space-y-3">
          <p className="text-sm font-semibold text-[#15233B]">
            {onlyMistakesMode
              ? 'Great work! You have no unresolved mistakes in this selection.'
              : selectedTopic && selectedTopic !== 'All Topics'
              ? 'Questions for this topic are not available yet.'
              : `No questions match the current filter selection (${selectedSubject} • ${selectedDifficulty}).`}
          </p>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            {onlyMistakesMode
              ? 'Continue practicing standard MCQs. Any questions you miss will be tracked here.'
              : selectedTopic && selectedTopic !== 'All Topics'
              ? `"${selectedTopic}" is part of the prescribed syllabus for this examination, but verified practice questions have not been added yet.`
              : 'Try resetting the filters or switching subjects to access other verified FPSC past questions.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {selectedTopic && selectedTopic !== 'All Topics' && (
              <button
                type="button"
                onClick={() => setSelectedTopic('All Topics')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#3156A6] text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
              >
                <span>Practice all topics in this subject</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedExam('All');
                setSelectedSubject('All Subjects');
                setSelectedTopic('All Topics');
                setSelectedCommission('All');
                setSelectedDifficulty('All');
                setSelectedQuizLength('All');
                setIsShuffled(false);
                setOnlyMistakesMode(false);
                setReloadKey(k => k + 1);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset all filters</span>
            </button>
          </div>
        </div>
      )}

      {/* Report Question Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md max-w-md w-full p-6 space-y-4 border border-[#E2E8F0]">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <h3 className="font-bold text-sm text-[#15233B]">
                Report Question
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#64748B] mb-1">
                  Issue Category
                </label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E2E8F0] rounded-md bg-white text-[#172033]"
                >
                  <option value="Incorrect Answer Key">Incorrect Answer Key</option>
                  <option value="Ambiguous Question Text">Ambiguous Question Text</option>
                  <option value="Typo or Grammatical Issue">Typo or Grammatical Issue</option>
                  <option value="Outdated Statutory Provision">Outdated Statutory Provision</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#64748B] mb-1">
                  Details / Reference Note
                </label>
                <textarea
                  rows={3}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Provide reference or correction note..."
                  className="w-full p-2.5 border border-[#E2E8F0] rounded-md text-[#172033]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-md text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#3156A6] text-white rounded-md font-medium"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
};


