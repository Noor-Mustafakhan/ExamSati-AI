import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { mockQuestions } from '../data/questions';
import { isSupabaseConfigured } from '../lib/supabase';
import { savedQuestionService } from '../services/savedQuestionService';
import { questionService } from '../services/questionService';
import { useAuth } from '../context/AuthContext';
import { VerificationBadge, DifficultyBadge, CommissionBadge } from '../components/common/Badge';
import { Toast } from '../components/common/Toast';

export const SavedQuestionsPage = () => {
  const { user } = useAuth();
  const [bookmarkedIds, setBookmarkedIds] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState('All Subjects');
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      savedQuestionService.getSavedQuestionIds(user?.id),
      questionService.getQuestions()
    ])
      .then(([ids, qRes]) => {
        if (mounted) {
          setBookmarkedIds(ids || []);
          setAllQuestions(qRes?.data || (isSupabaseConfigured ? [] : mockQuestions));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.warn('Error loading saved questions:', err);
          setBookmarkedIds([]);
          setAllQuestions(isSupabaseConfigured ? [] : mockQuestions);
          setLoading(false);
        }
      });

    return () => { mounted = false; };

  }, [user]);

  const handleRemoveBookmark = async (id) => {
    await savedQuestionService.toggleSave(user?.id, id);
    setBookmarkedIds(prev => prev.filter(qId => qId !== id));
    setToastMsg('Question removed from bookmarks.');
  };

  const savedQuestions = allQuestions.filter((q) => bookmarkedIds.includes(q.id));

  const filteredQuestions = savedQuestions.filter((q) => {
    if (selectedSubject !== 'All Subjects' && q.subject !== selectedSubject) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#15233B]">
            Saved Questions
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Questions saved on this account for targeted revision.
          </p>
        </div>

        <Link
          to="/practice"
          className="px-3.5 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-medium text-xs flex items-center gap-1.5 self-start sm:self-auto transition-colors"
        >
          <span>Practise MCQs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Subject Filter Chips */}
      {savedQuestions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <span className="font-semibold text-[#64748B] shrink-0">Subject:</span>
          {['All Subjects', ...new Set(savedQuestions.map((q) => q.subject))].map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                selectedSubject === sub
                  ? 'bg-[#15233B] text-white font-semibold'
                  : 'bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          Loading saved questions...
        </div>
      ) : filteredQuestions.length > 0 ? (
        <div className="space-y-4">
          {filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E2E8F0] text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <CommissionBadge commission={q.commission} />
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {q.subject}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {q.topic}
                  </span>
                  <DifficultyBadge difficulty={q.difficulty} />
                  <VerificationBadge status={q.verificationStatus} />
                </div>

                <button
                  onClick={() => handleRemoveBookmark(q.id)}
                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                  title="Remove from saved"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h2 className="text-sm sm:text-base font-semibold text-[#15233B]">
                {q.question}
              </h2>

              <div className="space-y-1.5 text-xs">
                {(q.options || []).map((opt, oIdx) => {
                  const letter = ['A', 'B', 'C', 'D'][oIdx];
                  const isCorrect = q.correctAnswer !== undefined && oIdx === q.correctAnswer;
                  return (
                    <div
                      key={oIdx}
                      className={`p-2.5 rounded border ${
                        isCorrect
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950 font-medium'
                          : 'border-[#E2E8F0] bg-white text-slate-700'
                      }`}
                    >
                      <strong className="mr-2">{letter}.</strong> {opt}
                      {isCorrect && <span className="ml-2 text-emerald-700 font-bold">(Key)</span>}
                    </div>
                  );
                })}
              </div>

              {q.explanation && (
                <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-xs text-slate-600">
                  <strong className="text-[#15233B]">Explanation:</strong> {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-md p-10 border border-[#E2E8F0] text-center space-y-3">
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Bookmark className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-[#15233B]">
            No saved questions found.
          </h2>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Bookmark tricky questions while practicing MCQs to review them later in this revision bank.
          </p>
          <div className="pt-2">
            <Link
              to="/practice"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#3156A6] text-white text-xs font-medium hover:bg-blue-800 transition-colors"
            >
              <span>Go to Practice Questions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
