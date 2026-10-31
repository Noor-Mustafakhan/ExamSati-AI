import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronRight,
  ExternalLink,
  BookOpen,
  Building,
  ArrowRight,
  CheckSquare,
  Info,
} from 'lucide-react';
import { fpscService } from '../services/fpscService';
import { CommissionBadge } from '../components/common/Badge';

export const FPSCJobDetailPage = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fpscService.getJobById(id).then((res) => {
      if (mounted) {
        setJob(res.data);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-xs text-slate-500">
        Loading official advertisement details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-3">
        <h2 className="text-base font-bold text-[#15233B]">Advertisement Not Found</h2>
        <p className="text-xs text-[#64748B]">
          The requested FPSC vacancy record does not exist or has expired.
        </p>
        <Link to="/fpsc-jobs" className="text-xs font-semibold text-[#3156A6] underline">
          Return to FPSC Advertisements
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-[#64748B]">
        <Link to="/" className="hover:text-[#3156A6]">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <Link to="/fpsc-jobs" className="hover:text-[#3156A6]">FPSC Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[#172033] font-medium truncate max-w-xs">{job.caseNumber}</span>
      </nav>

      {/* Official Provenance & Status Banner */}
      <div className={`border rounded-md p-4 flex items-start gap-3 text-xs ${
        job.status === 'open'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : job.status === 'upcoming'
          ? 'bg-blue-50 border-blue-200 text-blue-900'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        <Info className={`w-4 h-4 shrink-0 mt-0.5 ${
          job.status === 'open'
            ? 'text-emerald-700'
            : job.status === 'upcoming'
            ? 'text-blue-700'
            : 'text-amber-700'
        }`} />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm">
              {job.status === 'open' && 'Applications Currently Open'}
              {job.status === 'upcoming' && 'Upcoming Vacancy (Application Opens Soon)'}
              {(job.status === 'expired' || job.status === 'closed') && 'Application Period Closed (Historical Record)'}
            </span>
            <span className="text-[11px] opacity-80">
              ({job.advertisementNo}, Case {job.caseNumber})
            </span>
          </div>

          <p className="text-xs leading-relaxed opacity-90">
            {job.status === 'open' && `Applications are actively being submitted online. Official closing deadline: ${job.closingDate} (11:59 PM PKT).`}
            {job.status === 'upcoming' && `Official advertisement announced. Application portal opens on ${job.openingDate || 'the prescribed date'}. Closing deadline: ${job.closingDate}.`}
            {(job.status === 'expired' || job.status === 'closed') && `The application deadline (${job.closingDate}) has passed. Applications are closed. This record is preserved in the Historical Archive for syllabus guidance, past-paper review, and candidate preparation.`}
          </p>
        </div>
      </div>

      {/* Header Hero Card */}
      <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CommissionBadge commission="FPSC" showComingSoon={false} />
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#15233B] text-white">
                {job.caseNumber}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                {job.scale}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                {job.vacancies} Total Vacancies
              </span>
            </div>

            <h1 className="text-2xl font-bold text-[#15233B] tracking-tight">
              {job.title}
            </h1>

            <p className="text-xs font-semibold text-[#3156A6] flex items-center gap-1.5">
              <Building className="w-4 h-4" />
              <span>{job.department} ({job.ministry})</span>
            </p>

            <p className="text-xs text-[#64748B] leading-relaxed max-w-2xl">
              {job.summary}
            </p>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            <a
              href={job.officialSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-md bg-[#15233B] hover:bg-slate-900 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Official FPSC Notice</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {job.syllabusSlug && (
              <Link
                to={`/exams/${job.syllabusSlug}`}
                className="px-4 py-2 rounded-md bg-white hover:bg-slate-50 text-[#3156A6] font-medium text-xs border border-[#E2E8F0] flex items-center justify-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>View Syllabus</span>
              </Link>
            )}

            <Link
              to={`/practice?subject=${encodeURIComponent(job.practiceSubject || 'Pakistan Affairs')}`}
              className="px-4 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Practise MCQs</span>
            </Link>
          </div>
        </div>

        {/* Highlight Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#E2E8F0] text-xs">
          <div>
            <span className="text-[#64748B] block">Closing Date</span>
            <span className="font-semibold text-rose-700">{job.closingDate}</span>
          </div>
          <div>
            <span className="text-[#64748B] block">Publication Date</span>
            <span className="font-semibold text-[#15233B]">{job.publicationDate}</span>
          </div>
          <div>
            <span className="text-[#64748B] block">Posting Location</span>
            <span className="font-semibold text-[#15233B]">{job.posting}</span>
          </div>
          <div>
            <span className="text-[#64748B] block">Category</span>
            <span className="font-semibold text-[#15233B]">{job.category}</span>
          </div>
        </div>
      </div>

      {/* Official Eligibility Specifications Card */}
      <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-6">
        <h2 className="text-base font-bold text-[#15233B] border-b border-[#E2E8F0] pb-3">
          Prescribed Eligibility & Criteria
        </h2>

        <div className="space-y-5 text-xs sm:text-sm">
          {/* Minimum Qualification */}
          <div className="space-y-1">
            <span className="font-bold text-[#15233B] block uppercase text-[11px] tracking-wider">
              1. Minimum Educational Qualification:
            </span>
            <p className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-[#172033] leading-relaxed">
              {job.qualification}
            </p>
          </div>

          {/* Quota & Regional Allocations */}
          <div className="space-y-1">
            <span className="font-bold text-[#15233B] block uppercase text-[11px] tracking-wider">
              2. Quota & Domicile Distribution:
            </span>
            <p className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-[#172033] leading-relaxed">
              {job.quota}
            </p>
          </div>

          {/* Age Limits */}
          <div className="space-y-1">
            <span className="font-bold text-[#15233B] block uppercase text-[11px] tracking-wider">
              3. Age Limits & Relaxation:
            </span>
            <p className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-[#172033] leading-relaxed">
              {job.ageLimit}
            </p>
          </div>

          {/* Physical Fitness Standards */}
          {job.physicalStandard && (
            <div className="space-y-1">
              <span className="font-bold text-[#15233B] block uppercase text-[11px] tracking-wider">
                4. Physical Fitness Standards:
              </span>
              <p className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-[#172033] leading-relaxed">
                {job.physicalStandard}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Connected Preparation Next Steps */}
      <div className="bg-[#15233B] text-white rounded-md p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base">
            Ready to prepare for {job.title}?
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Begin with the official syllabus scheme and practice verified past-paper questions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {job.syllabusSlug && (
            <Link
              to={`/exams/${job.syllabusSlug}`}
              className="px-4 py-2 rounded-md bg-white text-[#15233B] font-semibold text-xs hover:bg-slate-100 transition-colors"
            >
              Study Syllabus
            </Link>
          )}
          <Link
            to={`/practice?subject=${encodeURIComponent(job.practiceSubject || 'Pakistan Affairs')}`}
            className="px-4 py-2 rounded-md bg-[#3156A6] text-white font-semibold text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5"
          >
            <span>Start Practice</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
