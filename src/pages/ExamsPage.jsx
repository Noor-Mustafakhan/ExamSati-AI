import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Briefcase, ArrowRight, BookOpen, CheckSquare } from 'lucide-react';
import { examService } from '../services/examService';
import { commissionService } from '../services/commissionService';
import { examCategories } from '../data/commissions';
import { CommissionBadge } from '../components/common/Badge';

export const ExamsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParam = searchParams.get('q') || '';
  const commissionParam = searchParams.get('commission') || 'All';
  const categoryParam = searchParams.get('category') || 'All';

  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [selectedCommission, setSelectedCommission] = useState(commissionParam);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);

  const [exams, setExams] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load commissions for filter dropdown
  useEffect(() => {
    commissionService.getCommissions().then((res) => {
      setCommissions(res.data || []);
    });
  }, []);

  // Fetch filtered exams
  useEffect(() => {
    let active = true;
    setLoading(true);

    examService
      .getExams({
        commissionCode: selectedCommission,
        category: selectedCategory,
        searchQuery: searchQuery,
      })
      .then((res) => {
        if (active) {
          setExams(res.data || []);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCommission, selectedCategory, searchQuery]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCommission('All');
    setSelectedCategory('All');
    setSearchParams({});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Header */}
      <div className="space-y-1.5 border-b border-[#E2E8F0] pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <CommissionBadge commission="FPSC" showComingSoon={false} />
          <span className="text-xs font-semibold text-slate-500">
            FPSC General Recruitment & CSS/MPT Focus
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#15233B] tracking-tight">
          Explore Pakistani Competitive Exam Schemes
        </h1>
        <p className="text-[#64748B] text-xs sm:text-sm max-w-3xl leading-relaxed">
          Search commission examination blueprints, official syllabus breakdowns, negative marking regulations, and test formats.
        </p>
      </div>

      {/* FPSC Official Jobs Banner Link */}
      <div className="bg-[#15233B] text-white rounded-md p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
            FPSC General Recruitment
          </span>
          <h2 className="text-base sm:text-lg font-bold">
            Federal Public Service Commission Vacancies & Syllabi
          </h2>
          <p className="text-xs text-slate-300 max-w-xl">
            Explore job advertisements, prescribed examination schemes, and syllabus breakdowns for federal posts.
          </p>
        </div>

        <Link
          to="/fpsc-jobs"
          className="px-4 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto transition-colors"
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Browse FPSC Jobs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Filter and Search Section */}
      <div className="bg-white rounded-md p-4 sm:p-5 border border-[#E2E8F0] space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by post name or department (e.g. Inspector Customs, CSS MPT, FIA)..."
            className="w-full pl-10 pr-4 py-2 rounded-md border border-[#E2E8F0] text-sm text-[#172033] focus:outline-hidden focus:border-[#3156A6]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-[#E2E8F0]">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Commission
            </label>
            <select
              value={selectedCommission}
              onChange={(e) => setSelectedCommission(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              <option value="All">All Commissions</option>
              {commissions.map((comm) => (
                <option key={comm.id} value={comm.code}>
                  {comm.code} {comm.status === 'coming_soon' ? '(Coming Soon)' : '(Active)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#E2E8F0] bg-white text-[#172033]"
            >
              {examCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full py-2 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            {loading ? 'Fetching examinations...' : `Showing ${exams.length} examination blueprints`}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-[#E2E8F0] rounded-md">
            Loading examination records...
          </div>
        ) : exams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map((exam) => {
              const isComingSoon = exam.isComingSoon || exam.commission !== 'FPSC';

              return (
                <div
                  key={exam.id}
                  className={`bg-white rounded-md p-5 border flex flex-col justify-between space-y-4 ${
                    isComingSoon
                      ? 'border-slate-200 opacity-80'
                      : 'border-[#E2E8F0] hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CommissionBadge commission={exam.commission} showComingSoon={isComingSoon} />
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

                    <div className="bg-[#F8FAFC] rounded p-2.5 border border-[#E2E8F0] text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#64748B]">Format:</span>
                        <span className="text-[#172033] font-medium">{exam.format}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#64748B]">Marking rule:</span>
                        <span className="text-[#172033] font-medium">{exam.negativeMarking}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                    <Link
                      to={`/exams/${exam.id}`}
                      className="flex-1 text-center py-2 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>View Syllabus</span>
                    </Link>
                    {!isComingSoon ? (
                      <Link
                        to={`/practice?exam=${exam.id}`}
                        className="flex-1 text-center py-2 rounded-md bg-white hover:bg-slate-50 text-[#3156A6] font-medium text-xs border border-[#E2E8F0] transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Practise MCQs</span>
                      </Link>
                    ) : (
                      <span className="flex-1 text-center py-2 rounded-md bg-slate-50 text-slate-400 font-medium text-xs border border-slate-200 cursor-not-allowed">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-md p-10 border border-[#E2E8F0] text-center space-y-3">
            <h3 className="text-sm font-semibold text-[#15233B]">
              No examinations match your filter.
            </h3>
            <p className="text-xs text-[#64748B]">
              Try adjusting your search query or reset the filters to see all available examinations.
            </p>
            <button
              onClick={handleResetFilters}
              className="text-xs font-medium text-[#3156A6] underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
