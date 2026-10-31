import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  ExternalLink,
  Briefcase,
  Calendar,
  Building,
  GraduationCap,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Archive,
} from 'lucide-react';
import { fpscService } from '../services/fpscService';
import { CommissionBadge } from '../components/common/Badge';

export const FPSCJobsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'All';
  const initialStatus = searchParams.get('status') || 'open';

  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [activeTab, setActiveTab] = useState(initialStatus); // 'open' | 'upcoming' | 'archived'
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fpscService
      .getJobs({ query: searchQuery, category: selectedCategory, status: activeTab })
      .then((res) => {
        if (mounted) {
          setJobs(res.data || []);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [searchQuery, selectedCategory, activeTab]);

  const handleReset = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setActiveTab('open');
    setSearchParams({});
  };

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (newTab === 'open') {
        updated.delete('status');
      } else {
        updated.set('status', newTab);
      }
      return updated;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      {/* Header */}
      <div className="space-y-1.5 border-b border-[#E2E8F0] pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <CommissionBadge commission="FPSC" showComingSoon={false} />
          <span className="text-xs font-semibold text-slate-500">
            Federal Public Service Commission
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#15233B] tracking-tight">
          FPSC Job Advertisements & Vacancies
        </h1>
        <p className="text-[#64748B] text-xs sm:text-sm max-w-3xl leading-relaxed">
          Federal job openings, application deadlines, and syllabus schemes published by the Federal Public Service Commission.
        </p>
      </div>

      {/* Lifecycle Status Tabs */}
      <div className="flex border-b border-[#E2E8F0] gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('open')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'open'
              ? 'border-[#15233B] text-[#15233B]'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Currently Open Vacancies</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('upcoming')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'upcoming'
              ? 'border-[#15233B] text-[#15233B]'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-[#3156A6]" />
          <span>Upcoming Announcements</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('archived')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'archived'
              ? 'border-[#15233B] text-[#15233B]'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-slate-500" />
          <span>Historical Archive & Past Ads</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-md p-4 sm:p-5 border border-[#E2E8F0] space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by case number, advertisement, post title, or department (e.g. F.4-110/2026, Customs, FIA, Lecturer)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-md border border-[#E2E8F0] text-sm text-[#172033] focus:outline-hidden focus:border-[#3156A6]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[#64748B]">Category:</span>
            {[
              { id: 'All', label: 'All Categories' },
              { id: 'General Recruitment', label: 'FPSC General Recruitment' },
              { id: 'CSS & MPT', label: 'CSS & MPT Examination' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors border ${
                  selectedCategory === cat.id
                    ? 'bg-[#15233B] text-white border-[#15233B]'
                    : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {(searchQuery || selectedCategory !== 'All' || activeTab !== 'open') && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-semibold text-[#3156A6] hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Jobs Listing */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>
            {loading
              ? 'Loading advertisements...'
              : `Showing ${jobs.length} ${
                  activeTab === 'open'
                    ? 'active open vacancies'
                    : activeTab === 'upcoming'
                    ? 'upcoming vacancies'
                    : 'archived historical records'
                }`}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-white border border-[#E2E8F0] rounded-md">
            Loading FPSC job advertisements...
          </div>
        ) : jobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.map((job) => {
              const isOpen = job.status === 'open';
              const isUpcoming = job.status === 'upcoming';
              const isExpired = job.status === 'expired' || job.status === 'closed';

              return (
                <div
                  key={job.id}
                  className="bg-white rounded-md p-5 border border-[#E2E8F0] flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#15233B] text-white">
                            {job.caseNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {job.scale}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {job.vacancies} Vacancies
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          {job.advertisementNo}
                        </span>
                      </div>

                      {/* Status Badges */}
                      {isOpen && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Open for Application</span>
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#3156A6] border border-blue-200 flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>Upcoming</span>
                        </span>
                      )}
                      {isExpired && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 shrink-0">
                          <Archive className="w-3 h-3" />
                          <span>Closed / Archived</span>
                        </span>
                      )}
                    </div>

                    {/* Title & Department */}
                    <div>
                      <h2 className="font-bold text-base text-[#15233B] leading-snug">
                        {job.title}
                      </h2>
                      <p className="text-xs font-semibold text-[#3156A6] mt-0.5 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 shrink-0" />
                        <span>{job.department}</span>
                      </p>
                    </div>

                    {/* Summary */}
                    <p className="text-xs text-[#64748B] leading-relaxed line-clamp-2">
                      {job.summary}
                    </p>

                    {/* Key Details Grid */}
                    <div className="bg-[#F8FAFC] rounded p-2.5 border border-[#E2E8F0] text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Closing Date:
                        </span>
                        <span className={`font-semibold ${isExpired ? 'text-slate-500' : 'text-rose-700'}`}>
                          {job.closingDate} {isExpired ? '(Passed)' : ''}
                        </span>
                      </div>

                      {job.openingDate && isUpcoming && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Opening Date:
                          </span>
                          <span className="font-semibold text-[#3156A6]">{job.openingDate}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" /> Qualification:
                        </span>
                        <span className="font-medium text-[#172033] truncate max-w-[200px]" title={job.qualification}>
                          {job.qualification}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-2">
                    <Link
                      to={`/fpsc-jobs/${job.id}`}
                      className="flex-1 text-center py-2 px-3 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <span>Full Job Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>

                    {job.syllabusSlug && (
                      <Link
                        to={`/exams/${job.syllabusSlug}`}
                        className="py-2 px-3 rounded-md bg-white hover:bg-slate-50 text-[#3156A6] border border-[#E2E8F0] font-medium text-xs transition-colors flex items-center gap-1"
                        title="View Prescribed Examination Scheme"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Syllabus</span>
                      </Link>
                    )}

                    <Link
                      to={`/practice?subject=${encodeURIComponent(job.practiceSubject || 'All Subjects')}`}
                      className="py-2 px-3 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs transition-colors flex items-center gap-1"
                      title="Practice Preparation MCQs for this exam"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Practice MCQs</span>
                    </Link>

                    <a
                      href={job.officialSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md bg-white hover:bg-slate-50 text-slate-500 border border-[#E2E8F0] text-xs transition-colors"
                      title="View Official Source on FPSC Portal"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-md p-10 border border-[#E2E8F0] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
              {activeTab === 'open' ? (
                <Clock className="w-6 h-6 text-slate-400" />
              ) : (
                <Briefcase className="w-6 h-6 text-slate-400" />
              )}
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-bold text-[#15233B]">
                {activeTab === 'open'
                  ? 'No Verified Vacancies Currently Accepting Applications'
                  : 'No Advertisements Match Your Search Criteria'}
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {activeTab === 'open'
                  ? 'Previous recruitment advertisements (including Consolidated Advt. No. 01/2026) have reached their application deadline. All practice question banks, past papers, and prescribed syllabi remain permanently available for your study preparation.'
                  : 'Try adjusting your search terms or clearing category filters to view available postings.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {activeTab === 'open' && (
                <button
                  type="button"
                  onClick={() => handleTabChange('archived')}
                  className="px-4 py-2 bg-[#15233B] hover:bg-slate-900 text-white rounded text-xs font-semibold flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Browse Historical Archive</span>
                </button>
              )}

              <Link
                to="/practice"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Practice Question Bank</span>
              </Link>

              <Link
                to="/exams"
                className="px-4 py-2 bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#3156A6]" />
                <span>Explore Exam Syllabi</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
