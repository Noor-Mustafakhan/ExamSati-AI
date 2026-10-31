import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Clock,
  HelpCircle,
  FileText,
  Briefcase
} from 'lucide-react';
import { commissionService } from '../services/commissionService';
import { examService } from '../services/examService';
import { CommissionBadge } from '../components/common/Badge';

export const LandingPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [commissions, setCommissions] = useState([]);
  const [sampleExams, setSampleExams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setIsLoading(true);
      const [commRes, examRes] = await Promise.all([
        commissionService.getCommissions(),
        examService.getExams()
      ]);
      if (mounted) {
        setCommissions(commRes.data || []);
        setSampleExams((examRes.data || []).slice(0, 4));
        setIsLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/exams?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/exams');
    }
  };

  return (
    <div className="space-y-16 lg:space-y-20 pb-16">
      {/* 2. Hero Section and Exam Search */}
      <section className="bg-white border-b border-[#E2E8F0] pt-10 pb-12 sm:pt-14 sm:pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#15233B] tracking-tight leading-tight">
            Prepare for Pakistan's competitive exams in one place.
          </h1>

          <p className="text-base sm:text-lg text-[#64748B] max-w-2xl mx-auto leading-relaxed">
            Explore commission-wise exam information, organize your syllabus, practise MCQs, and review your mock-test performance.
          </p>

          {/* Simple Exam Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="pt-2 max-w-xl mx-auto flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search exams (e.g. Tehsildar, Inspector Customs, FIA)..."
                className="w-full pl-10 pr-3.5 py-2.5 text-sm text-[#172033] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:bg-white focus:outline-hidden focus:border-[#3156A6]"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-sm transition-colors shrink-0"
            >
              Search Exams
            </button>
          </form>

          {/* Direct CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link
              to="/fpsc-jobs"
              className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-sm transition-colors text-center flex items-center justify-center gap-1.5"
            >
              <Briefcase className="w-4 h-4" />
              <span>FPSC Job Advertisements</span>
            </Link>
            <Link
              to="/exams"
              className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-semibold text-sm transition-colors text-center"
            >
              Explore Exams
            </Link>
            <Link
              to="/practice"
              className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-white hover:bg-slate-50 border border-[#E2E8F0] text-[#172033] font-semibold text-sm transition-colors text-center"
            >
              Start Practising
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Commission and Exam Discovery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#15233B]">
              Testing Commissions
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
              Explore examination syllabi, past papers, and preparation material across federal and provincial testing commissions.
            </p>
          </div>
          <Link
            to="/exams"
            className="text-xs sm:text-sm font-semibold text-[#3156A6] hover:underline"
          >
            View all exams
          </Link>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading commission directories...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {commissions.slice(0, 4).map((comm) => {
              const isComingSoon = comm.status === 'coming_soon';

              return (
                <Link
                  key={comm.id}
                  to={`/exams?commission=${comm.code}`}
                  className="bg-white rounded-md p-5 border border-[#E2E8F0] hover:border-[#3156A6] transition-colors flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#15233B] text-white">
                        {comm.code}
                      </span>
                      {isComingSoon ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Coming Soon
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Available
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm text-[#15233B]">
                      {comm.name}
                    </h3>
                    <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                      {comm.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-semibold text-[#3156A6]">
                    <span>{isComingSoon ? 'View preview' : `Explore ${comm.code}`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Available Exam Records */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="border-b border-[#E2E8F0] pb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-[#15233B]">
            Sample Exam Outlines
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Curated examination structures with syllabus topics, test formats, and marking rules.
          </p>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading exam outlines...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sampleExams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-md p-5 border border-[#E2E8F0] flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CommissionBadge commission={exam.commission} />
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {exam.scale}
                      </span>
                    </div>
                    <span className="text-xs text-[#64748B]">
                      {exam.category}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-[#15233B]">
                    {exam.title}
                  </h3>
                  <p className="text-xs font-medium text-[#3156A6]">
                    {exam.department}
                  </p>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {exam.summary}
                  </p>

                  <div className="bg-[#F8FAFC] rounded p-3 border border-[#E2E8F0] text-xs space-y-1 text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Format:</span>
                      <span className="font-medium text-[#172033]">{exam.format}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Marking rule:</span>
                      <span className="font-medium text-[#172033]">{exam.negativeMarking}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                  <Link
                    to={`/exams/${exam.id}`}
                    className="flex-1 text-center py-2 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-medium text-xs transition-colors"
                  >
                    View Syllabus
                  </Link>
                  <Link
                    to={`/practice?subject=Pakistan+Affairs`}
                    className="flex-1 text-center py-2 rounded-md bg-white hover:bg-slate-50 text-[#3156A6] font-medium text-xs border border-[#E2E8F0] transition-colors"
                  >
                    Practise MCQs
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. How the Platform Works */}
      <section className="bg-white border-y border-[#E2E8F0] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-[#15233B]">
              How the Platform Works
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1">
              A structured, step-by-step approach to preparing for written screening tests.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
              <div className="w-8 h-8 rounded bg-[#15233B] text-white font-bold text-xs flex items-center justify-center">
                1
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Review the Syllabus
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Examine official subject weightages, allocated marks, and topic requirements for your target post.
              </p>
            </div>

            <div className="p-5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
              <div className="w-8 h-8 rounded bg-[#3156A6] text-white font-bold text-xs flex items-center justify-center">
                2
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Practise Topic MCQs
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Solve multiple-choice questions by subject, check your answers instantly, and read source explanations.
              </p>
            </div>

            <div className="p-5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
              <div className="w-8 h-8 rounded bg-[#0F766E] text-white font-bold text-xs flex items-center justify-center">
                3
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Take Timed Mock Tests
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Simulate examination time limits and calculate net scores using commission negative-marking rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Key Preparation Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#15233B]">
            Key Preparation Features
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Core tools designed for focused competitive test preparation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[#3156A6]">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Syllabus Outlines
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Organized breakdowns of subjects including Pakistan Affairs, General Knowledge, English, and departmental statutory acts.
              </p>
            </div>
            <div className="pt-3 border-t border-[#E2E8F0]">
              <Link to="/exams" className="text-xs font-semibold text-[#3156A6] hover:underline">
                Explore syllabus repository
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[#3156A6]">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Timed Simulations
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Mock tests equipped with timers, question review states, and realistic penalty calculation for incorrect answers.
              </p>
            </div>
            <div className="pt-3 border-t border-[#E2E8F0]">
              <Link to="/mock-tests" className="text-xs font-semibold text-[#3156A6] hover:underline">
                View mock tests
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-md p-5 border border-[#E2E8F0] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[#3156A6]">
                <HelpCircle className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#15233B]">
                Academic Q&A Tutor
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Consult conceptual breakdowns for examination topics, past papers, and revision questions.
              </p>
            </div>
            <div className="pt-3 border-t border-[#E2E8F0]">
              <Link to="/ai-tutor" className="text-xs font-semibold text-[#3156A6] hover:underline">
                Ask Study Buddy
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. One Clear Call to Action */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#15233B] text-white rounded-md p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="text-xl sm:text-2xl font-bold">
              Start your exam preparation today
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Browse commission requirements, practise sample questions, and track your performance in your personal workspace.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <Link
              to="/exams"
              className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-700 text-white font-semibold text-xs text-center transition-colors"
            >
              Explore Exams
            </Link>
            <Link
              to="/register"
              className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-white hover:bg-slate-100 text-[#15233B] font-semibold text-xs text-center transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
