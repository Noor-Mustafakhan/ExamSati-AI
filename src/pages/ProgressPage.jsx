import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  RotateCcw,
  Clock,
  Database,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mockTestService } from '../services/mockTestService';
import { studentProgressService } from '../services/studentProgressService';
import { isSupabaseConfigured } from '../lib/supabase';
import { ExamBuddy } from '../components/common/ExamBuddy';
import { getScoreReaction } from '../utils/examBuddyReactions';

export const ProgressPage = () => {
  const { user } = useAuth();
  const [testAttempts, setTestAttempts] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    try {
      mockTestService.getUserAttempts(user?.id).then((attempts) => {
        setTestAttempts(attempts || studentProgressService.getTestAttempts());
      });
      const savedMistakes = studentProgressService.getMistakes();
      setMistakes(savedMistakes);
    } catch {
      setTestAttempts(studentProgressService.getTestAttempts());
      setMistakes(studentProgressService.getMistakes());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasData = testAttempts.length > 0;
  const totalAttempts = testAttempts.length;
  const avgAccuracy = hasData
    ? Math.round(testAttempts.reduce((acc, curr) => acc + (curr.accuracy || 0), 0) / totalAttempts)
    : 0;
  const totalScore = hasData
    ? testAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0).toFixed(1)
    : '0';

  const handleClearHistory = () => {
    try {
      localStorage.removeItem('examsathi_test_attempts');
      setTestAttempts([]);
    } catch {
      setTestAttempts([]);
    }
  };

  const handleResolveMistake = (qId) => {
    const updated = studentProgressService.resolveMistake(qId);
    setMistakes(updated);
  };

  const handleRemoveMistake = (qId) => {
    const updated = studentProgressService.removeMistake(qId);
    setMistakes(updated);
  };

  const activeMistakes = mistakes.filter((m) => !m.mastered);

  // Overall ExamBuddy reaction based on avg accuracy
  const buddyReaction = hasData ? getScoreReaction(avgAccuracy) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#15233B]">
              Student Progress & Mistake Notebook
            </h1>
            {isSupabaseConfigured && user ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                <Database className="w-3 h-3" />
                <span>Supabase Cloud</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                <Clock className="w-3 h-3" />
                <span>Local Session</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Track your simulation attempts, analyze accuracy trends, and review errors stored in your Mistake Notebook.
          </p>
        </div>

        {hasData && !user && (
          <button
            onClick={handleClearHistory}
            className="text-xs font-medium text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded border border-[#E2E8F0] hover:bg-slate-50 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset History</span>
          </button>
        )}
      </div>

      {/* ExamBuddy Cumulative Analysis */}
      {buddyReaction && (
        <ExamBuddy reaction={buddyReaction} title="ExamBuddy Overall Review" />
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-[#64748B] bg-white border border-[#E2E8F0] rounded-md">
          Loading performance analytics...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-md p-5 border border-[#E2E8F0]">
              <span className="text-xs font-semibold text-[#64748B] block uppercase tracking-wider">
                Tests Attempted
              </span>
              <span className="text-2xl font-extrabold text-[#15233B] mt-1 block">
                {totalAttempts}
              </span>
              <span className="text-xs text-[#64748B] mt-0.5 block">
                {user ? 'Linked to account' : 'Saved locally'}
              </span>
            </div>

            <div className="bg-white rounded-md p-5 border border-[#E2E8F0]">
              <span className="text-xs font-semibold text-[#64748B] block uppercase tracking-wider">
                Average Accuracy
              </span>
              <span className="text-2xl font-extrabold text-[#0F766E] mt-1 block">
                {avgAccuracy}%
              </span>
              <span className="text-xs text-[#64748B] mt-0.5 block">
                Across recorded tests
              </span>
            </div>

            <div className="bg-white rounded-md p-5 border border-[#E2E8F0]">
              <span className="text-xs font-semibold text-[#64748B] block uppercase tracking-wider">
                Cumulative Marks
              </span>
              <span className="text-2xl font-extrabold text-[#3156A6] mt-1 block">
                {totalScore}
              </span>
              <span className="text-xs text-[#64748B] mt-0.5 block">
                Net score post-penalties
              </span>
            </div>

            <div className="bg-white rounded-md p-5 border border-[#E2E8F0]">
              <span className="text-xs font-semibold text-[#64748B] block uppercase tracking-wider">
                Saved Mistakes
              </span>
              <span className="text-2xl font-extrabold text-rose-600 mt-1 block">
                {activeMistakes.length}
              </span>
              <span className="text-xs text-[#64748B] mt-0.5 block">
                Pending re-practice
              </span>
            </div>
          </div>

          {/* Section: Mistake Notebook */}
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h2 className="text-base font-bold text-[#15233B]">
                  Mistake Notebook ({activeMistakes.length} Active Errors)
                </h2>
              </div>

              {activeMistakes.length > 0 && (
                <Link
                  to="/practice?mistakes=true"
                  className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors self-start sm:self-auto flex items-center gap-1.5"
                >
                  <span>Re-practice All Mistakes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {activeMistakes.length > 0 ? (
              <div className="space-y-4 divide-y divide-[#E2E8F0]">
                {activeMistakes.map((m) => (
                  <div key={m.questionId} className="pt-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <div>
                        <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 mr-2">
                          {m.subject}
                        </span>
                        <span className="text-slate-500 font-medium">{m.topic}</span>
                        {m.timesFailed > 1 && (
                          <span className="ml-2 text-rose-700 font-bold">
                            (Failed {m.timesFailed} times)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResolveMistake(m.questionId)}
                          className="px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[11px] font-semibold flex items-center gap-1"
                          title="Mark this mistake as mastered"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Mastered</span>
                        </button>
                        <button
                          onClick={() => handleRemoveMistake(m.questionId)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Remove from notebook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-[#15233B]">
                      {m.questionText}
                    </p>

                    {m.explanation && (
                      <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-xs text-slate-700 space-y-1">
                        <strong className="text-[#15233B]">Explanation:</strong> {m.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-3">
                No active mistakes recorded! Questions you miss during practice or mock tests will automatically appear here for targeted revision.
              </p>
            )}
          </div>

          {/* Section: Detailed Test Records */}
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
            <h2 className="text-base font-bold text-[#15233B]">
              Recorded Mock Test Attempts
            </h2>

            {hasData ? (
              <div className="divide-y divide-[#E2E8F0]">
                {testAttempts.map((item, idx) => (
                  <div
                    key={idx}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-[#15233B]">
                        {item.testTitle}
                      </h3>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Completed: {item.date} • {item.correctCount} Correct •{' '}
                        {item.incorrectCount} Incorrect • {item.unansweredCount} Unanswered
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-[#15233B]">
                        Score: {item.score} / {item.totalMarks}
                      </span>
                      <span className="block text-xs font-semibold text-[#0F766E]">
                        {item.accuracy}% Accuracy
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                <p>You haven't completed a timed simulation yet.</p>
                <Link to="/mock-tests" className="text-xs font-semibold text-[#3156A6] underline">
                  Take your first mock test
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
