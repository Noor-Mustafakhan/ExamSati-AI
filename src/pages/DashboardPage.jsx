import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';
import { mockTestService } from '../services/mockTestService';
import { examService } from '../services/examService';
import { studentProgressService } from '../services/studentProgressService';
import { useAuth } from '../context/AuthContext';
import { CommissionBadge } from '../components/common/Badge';


export const DashboardPage = () => {
  const { user, profile } = useAuth();
  const [savedAttempts, setSavedAttempts] = useState([]);
  const [recommendedExams, setRecommendedExams] = useState([]);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      mockTestService.getUserAttempts(user?.id),
      examService.getExams(),
    ]).then(([attRes, examRes]) => {
      if (mounted) {
        setSavedAttempts(attRes.data || studentProgressService.getTestAttempts());
        setRecommendedExams((examRes.data || []).slice(0, 3));
        const activeMistakes = studentProgressService.getMistakes().filter((m) => !m.mastered);
        setMistakesCount(activeMistakes.length);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [user]);

  const hasHistory = savedAttempts.length > 0;
  const recentAttempt = savedAttempts[0];


  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-[#15233B] rounded-md p-6 sm:p-7 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300">
            <CommissionBadge commission="FPSC" showComingSoon={false} />
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              {profile?.full_name || user?.email || 'Candidate Workspace'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            FPSC Candidate Preparation Workspace
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
            Track completed FPSC mock tests, review saved mistakes, and browse official job advertisements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/fpsc-jobs"
            className="px-4 py-2 rounded-md bg-white hover:bg-slate-100 text-[#15233B] font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <Briefcase className="w-3.5 h-3.5 text-[#3156A6]" />
            <span>FPSC Advertisements</span>
          </Link>
          <Link
            to="/practice"
            className="px-4 py-2 rounded-md bg-[#3156A6] hover:bg-blue-700 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Practise MCQs</span>
          </Link>
          <Link
            to="/mock-tests"
            className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Mock Tests</span>
          </Link>
        </div>
      </div>


      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Attempts & Mistake Banner (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mistake Notebook Quick Card */}
          {mistakesCount > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-[#15233B]">
                    You have {mistakesCount} unresolved questions in your Mistake Notebook
                  </h3>
                  <p className="text-slate-600 mt-0.5">
                    Re-practicing mistakes is proven to increase competitive exam accuracy by over 30%.
                  </p>
                </div>
              </div>
              <Link
                to="/progress"
                className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto"
              >
                Open Mistake Notebook
              </Link>
            </div>
          )}

          {/* Recent Mock Test Attempts */}
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <h2 className="font-bold text-base text-[#15233B]">
                  Recent Mock Test Attempts
                </h2>
                <p className="text-xs text-[#64748B]">
                  Results recorded from your completed timed simulations.
                </p>
              </div>
              <Link
                to="/mock-tests"
                className="text-xs font-semibold text-[#3156A6] hover:underline flex items-center gap-1"
              >
                <span>New test</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Loading recent attempts...
              </div>
            ) : hasHistory ? (
              <div className="divide-y divide-[#E2E8F0]">
                {savedAttempts.slice(0, 3).map((item, idx) => (
                  <div
                    key={idx}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <h3 className="font-semibold text-[#15233B]">
                        {item.testTitle}
                      </h3>
                      <span className="text-slate-500">
                        Completed {item.date} • {item.correctCount} Correct • {item.incorrectCount} Errors
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#15233B] text-sm">
                        {item.score} / {item.totalMarks}
                      </span>
                      <span className="block text-[11px] font-semibold text-[#0F766E]">
                        {item.accuracy}% Accuracy
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <p>No completed tests on record yet.</p>
                <Link
                  to="/mock-tests"
                  className="text-[#3156A6] font-semibold underline"
                >
                  Attempt your first 10-minute FPSC simulation
                </Link>
              </div>
            )}
          </div>

          {/* Quick Subject Practice Links */}
          <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
            <h2 className="font-bold text-base text-[#15233B]">
              High-Yield Subject Practice
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <Link
                to="/practice?subject=Pakistan%20Affairs"
                className="p-3 rounded border border-[#E2E8F0] hover:border-[#3156A6] transition-colors bg-[#F8FAFC] block"
              >
                <strong className="text-[#15233B] block">Pakistan Affairs</strong>
                <span className="text-[#64748B]">1973 Constitution, Articles 2A, 18th Amendment & history</span>
              </Link>
              <Link
                to="/practice?subject=Everyday%20Science"
                className="p-3 rounded border border-[#E2E8F0] hover:border-[#3156A6] transition-colors bg-[#F8FAFC] block"
              >
                <strong className="text-[#15233B] block">Everyday Science</strong>
                <span className="text-[#64748B]">Atmospheric layers, physiology, environmental & IT concepts</span>
              </Link>
              <Link
                to="/practice?subject=English"
                className="p-3 rounded border border-[#E2E8F0] hover:border-[#3156A6] transition-colors bg-[#F8FAFC] block"
              >
                <strong className="text-[#15233B] block">English Grammar & Vocab</strong>
                <span className="text-[#64748B]">Antonyms, sentence structure & prepositional usage</span>
              </Link>
              <Link
                to="/practice?subject=Law%20%26%20Acts"
                className="p-3 rounded border border-[#E2E8F0] hover:border-[#3156A6] transition-colors bg-[#F8FAFC] block"
              >
                <strong className="text-[#15233B] block">Law & FPSC Statutory Acts</strong>
                <span className="text-[#64748B]">FIA Act 1974, Customs Act 1969 & investigation functions</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Recommended Exams & Independent Study Note */}
        <div className="space-y-6">
          <div className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <h2 className="font-bold text-sm text-[#15233B]">
                FPSC Syllabi Outlines
              </h2>
              <Link to="/exams" className="text-xs font-semibold text-[#3156A6] hover:underline">
                View all
              </Link>
            </div>

            <div className="space-y-3">
              {recommendedExams.map((exam) => (
                <Link
                  key={exam.id}
                  to={`/exams/${exam.id}`}
                  className="block p-3 rounded border border-[#E2E8F0] hover:border-[#3156A6] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <CommissionBadge commission={exam.commission} showComingSoon={exam.commission !== 'FPSC'} />
                    <span className="text-[11px] font-medium text-[#64748B]">
                      {exam.scale}
                    </span>
                  </div>
                  <h3 className="font-semibold text-xs text-[#15233B] line-clamp-1">
                    {exam.title}
                  </h3>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {exam.department}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-2">
            <h2 className="font-bold text-sm text-[#15233B]">
              FPSC Data Grounding Note
            </h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              ExamSathi AI retrieves official curriculum guidelines and examination notifications directly from the Federal Public Service Commission (fpsc.gov.pk). No vacancies or closing dates are fabricated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
