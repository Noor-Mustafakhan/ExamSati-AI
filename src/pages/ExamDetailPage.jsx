import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronRight,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  CheckSquare,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { examService } from '../services/examService';
import { studentProgressService } from '../services/studentProgressService';
import { CommissionBadge } from '../components/common/Badge';
import { Toast } from '../components/common/Toast';

// Formats bureaucratic section titles like "Part-II: Professional Computer Science (80 Marks)" into clean, friendly headers
function formatSectionHeader(sectionTitle = '', subjectName = '') {
  let partBadge = '';
  if (sectionTitle.includes('Part-I:')) {
    partBadge = 'Part I • 20 Marks';
  } else if (sectionTitle.includes('Part-II:')) {
    partBadge = 'Part II • 80 Marks';
  }

  // Friendly subject display title
  let displayTitle = subjectName;
  if (sectionTitle.includes('Professional Customs Law') || sectionTitle.includes('Professional (80 Marks)')) {
    displayTitle = 'Customs Law & Regulatory Scheme';
  } else if (sectionTitle.includes('Professional Investigation')) {
    displayTitle = 'Investigation Powers & Statutory Laws';
  } else if (sectionTitle.includes('Technical & Programming')) {
    displayTitle = 'Computer Science & Software Development';
  } else if (sectionTitle.includes('Professional Computer Science')) {
    displayTitle = 'Computer Science (Core & Professional)';
  } else if (subjectName === 'Pakistan Affairs' && sectionTitle.includes('General Intelligence')) {
    displayTitle = 'Pakistan Affairs & 1973 Constitution';
  } else if (subjectName === 'Everyday Science') {
    displayTitle = 'Everyday Science & General Ability';
  } else if (subjectName === 'Basic Mathematics') {
    displayTitle = 'Basic Mathematics & Quantitative Ability';
  } else if (subjectName === 'Islamic Studies') {
    displayTitle = 'Islamic Studies & Ethics';
  } else if (subjectName === 'English & Grammar') {
    displayTitle = 'English Grammar & Vocabulary';
  }

  return { displayTitle, partBadge };
}

// Parses titles with colons like "Operating Systems: Deadlocks, Virtual Memory & Concurrency" into category and title
function parseTopicTitle(rawTitle = '') {
  if (!rawTitle) return { category: null, title: '' };
  const colonIdx = rawTitle.indexOf(':');
  if (colonIdx > 0 && colonIdx < rawTitle.length - 1) {
    return {
      category: rawTitle.slice(0, colonIdx).trim(),
      title: rawTitle.slice(colonIdx + 1).trim(),
    };
  }
  return { category: null, title: rawTitle.trim() };
}

export const ExamDetailPage = () => {
  const { id } = useParams();

  const [exam, setExam] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [topicProgress, setTopicProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [expandedSyllabus, setExpandedSyllabus] = useState({});
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      examService.getExamBySlug(id),
      examService.getExamSyllabusBreakdown(id)
    ])
      .then(([examRes, breakdownRes]) => {
        if (!mounted) return;

        if (examRes.data) {
          setExam(examRes.data);
        }

        if (breakdownRes?.data?.sections && breakdownRes.data.sections.length > 0) {
          setBreakdown(breakdownRes.data);
          const defaultExp = {};
          breakdownRes.data.sections.forEach((_, idx) => {
            defaultExp[idx] = true;
          });
          setExpandedSyllabus(defaultExp);
        } else if (examRes.data?.syllabus) {
          const defaultExp = {};
          examRes.data.syllabus.forEach((_, idx) => {
            defaultExp[idx] = true;
          });
          setExpandedSyllabus(defaultExp);
        }

        // Retrieve authentic student attempt progress for syllabus topics
        const prog = studentProgressService.getAllTopicsProgress();
        setTopicProgress(prog || {});

        setLoading(false);
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load examination blueprint:', err);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  const handleToggleSave = () => {
    if (!exam) return;
    setSaved(!saved);
    setToastMsg(!saved ? 'Exam added to target list.' : 'Exam removed from saved list.');
  };

  const toggleAccordion = (idx) => {
    setExpandedSyllabus((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-xs text-slate-500">
        Loading examination outline...
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-3">
        <h2 className="text-base font-bold text-[#15233B]">Exam not found</h2>
        <p className="text-xs text-[#64748B]">
          The requested syllabus blueprint does not exist or is unpublished.
        </p>
        <Link to="/exams" className="text-xs font-semibold text-[#3156A6] underline">
          Return to Explore Exams
        </Link>
      </div>
    );
  }

  const isFpsc = exam.commission === 'FPSC';
  const hasBreakdownSections = breakdown?.sections && breakdown.sections.length > 0;

  // Calculate live verified question counts across syllabus
  const totalVerifiedQuestions = hasBreakdownSections
    ? breakdown.sections.reduce(
        (acc, sec) => acc + (sec.topics || []).reduce((tAcc, t) => tAcc + (t.question_count || 0), 0),
        0
      )
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-[#64748B]">
        <Link to="/" className="hover:text-[#3156A6]">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <Link to="/exams" className="hover:text-[#3156A6]">Exams</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[#172033] font-medium truncate max-w-xs">{exam.title}</span>
      </nav>

      {/* Information Notice */}
      <div className="bg-[#F8FAFC] rounded-md p-4 border border-[#E2E8F0] flex items-start gap-3">
        <Info className="w-4 h-4 text-[#3156A6] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 leading-relaxed space-y-1">
          <p>
            <strong className="text-[#15233B]">Curriculum Source Notice:</strong>{' '}
            {exam.verificationNotice ||
              'This syllabus outline is organized based on standard official commission testing schemes.'}
          </p>
          {exam.officialSourceUrl && (
            <p className="text-slate-500">
              Official Portal Link:{' '}
              <a
                href={exam.officialSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3156A6] underline inline-flex items-center gap-0.5"
              >
                <span>{exam.officialSourceUrl}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          )}
        </div>
      </div>

      {/* Header Overview Card */}
      <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CommissionBadge commission={exam.commission} showComingSoon={!isFpsc} />
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                {exam.scale}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                {exam.category}
              </span>
              {isFpsc && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Verified Official Scheme
                </span>
              )}
              {hasBreakdownSections && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-[#3156A6] border border-blue-200">
                  {totalVerifiedQuestions} Approved MCQs in Bank
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-[#15233B] tracking-tight">
              {exam.title}
            </h1>
            <p className="text-xs font-semibold text-[#3156A6]">
              {exam.department}
            </p>
            <p className="text-xs text-[#64748B] leading-relaxed max-w-2xl">
              {exam.summary}
            </p>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            <button
              onClick={handleToggleSave}
              className={`px-3 py-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                saved
                  ? 'bg-slate-100 text-[#15233B] border-slate-300'
                  : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
              <span>{saved ? 'Saved' : 'Save Syllabus'}</span>
            </button>

            {isFpsc ? (
              <Link
                to={`/practice?exam=${exam.id}`}
                className="px-4 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Practice All MCQs</span>
              </Link>
            ) : (
              <span className="px-3 py-2 rounded-md bg-slate-100 text-slate-400 font-medium text-xs text-center border border-slate-200 cursor-not-allowed">
                Coming Soon
              </span>
            )}
          </div>
        </div>

        {/* Exam Specifications */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#E2E8F0] text-xs">
          <div>
            <span className="text-[#64748B] block">Total Marks</span>
            <span className="font-semibold text-[#15233B]">
              {exam.overview?.totalMarks || 100} Marks
            </span>
          </div>
          <div>
            <span className="text-[#64748B] block">Test Duration</span>
            <span className="font-semibold text-[#15233B]">
              {exam.overview?.totalTime || '100 Minutes'}
            </span>
          </div>
          <div>
            <span className="text-[#64748B] block">Medium</span>
            <span className="font-semibold text-[#15233B]">
              {exam.overview?.testMedium || 'English'}
            </span>
          </div>
          <div>
            <span className="text-[#64748B] block">Marking Rule</span>
            <span className="font-semibold text-[#15233B]">{exam.negativeMarking}</span>
          </div>
        </div>
      </div>

      {/* Syllabus Topics & Topic-Wise Practice Section */}
      <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#15233B] tracking-tight">
              Syllabus & Topic-Wise Practice
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Practice targeted questions topic-by-topic according to the official commission syllabus.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {hasBreakdownSections ? `${breakdown.sections.length} Subjects` : 'Syllabus Outline'}
            </span>
            {hasBreakdownSections && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#3156A6] border border-blue-200">
                {totalVerifiedQuestions} Practice MCQs
              </span>
            )}
          </div>
        </div>

        {/* Breakdown Display */}
        {hasBreakdownSections ? (
          <div className="space-y-4">
            {breakdown.sections.map((sec, secIdx) => {
              const isOpen = expandedSyllabus[secIdx] ?? true;
              const secQuestionCount = (sec.topics || []).reduce(
                (sum, t) => sum + (t.question_count || 0),
                0
              );
              const { displayTitle, partBadge } = formatSectionHeader(sec.section_title, sec.subject_name);

              return (
                <div key={secIdx} className="rounded-md border border-[#E2E8F0] overflow-hidden bg-white shadow-xs">
                  {/* Clean Section / Subject Header */}
                  <button
                    type="button"
                    onClick={() => toggleAccordion(secIdx)}
                    className="w-full px-5 py-4 bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-100/80 transition-colors border-b border-transparent data-[open=true]:border-[#E2E8F0]"
                    data-open={isOpen}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm sm:text-base font-bold text-[#15233B]">
                        {displayTitle}
                      </span>
                      {partBadge && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-slate-700 border border-slate-300">
                          {partBadge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[#64748B]">
                        {sec.topics.length} {sec.topics.length === 1 ? 'Topic' : 'Topics'} • <strong className="text-[#15233B]">{secQuestionCount} MCQs</strong>
                      </span>
                      <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500">
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Clean Topic List */}
                  {isOpen && (
                    <div className="divide-y divide-slate-100 p-2 sm:p-4">
                      {sec.topics.map((topic) => {
                        const norm = (topic.topic_title || '').trim().toLowerCase();
                        const prog = topicProgress[norm];
                        const hasQuestions = topic.question_count > 0;
                        const { category, title } = parseTopicTitle(topic.topic_title);

                        return (
                          <div
                            key={topic.id}
                            className="p-3.5 sm:p-4 rounded-md hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5 flex-1 pr-2">
                              {/* Category Tag + Main Topic Title */}
                              <div>
                                {category && (
                                  <span className="text-[11px] font-semibold text-[#3156A6] uppercase tracking-wider block mb-0.5">
                                    {category}
                                  </span>
                                )}
                                <h3 className="text-sm font-bold text-[#15233B] leading-snug">
                                  {title}
                                </h3>
                              </div>

                              {/* Clean Scope Description */}
                              {topic.description && (
                                <p className="text-xs text-[#64748B] leading-relaxed max-w-2xl">
                                  {topic.description}
                                </p>
                              )}

                              {/* Question Stats & Student Progress Badges */}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {hasQuestions ? (
                                  <>
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-[#3156A6] border border-blue-200">
                                      {topic.question_count} MCQs
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {topic.easy_count} Easy • {topic.moderate_count} Moderate{topic.advanced_count > 0 ? ` • ${topic.advanced_count} Advanced` : ''}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">
                                    Questions coming soon
                                  </span>
                                )}

                                {prog && prog.attempts > 0 && (
                                  <span className="text-slate-300">•</span>
                                )}

                                {prog && prog.attempts > 0 && (
                                  prog.completed ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Mastered ({prog.accuracy}%)</span>
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                      {prog.attempts} attempted • {prog.accuracy}% accuracy
                                    </span>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Action Button */}
                            <div className="shrink-0 flex items-center self-start md:self-center">
                              {hasQuestions ? (
                                <Link
                                  to={`/practice?exam=${exam.id}&subject=${encodeURIComponent(sec.subject_name)}&topic=${encodeURIComponent(topic.topic_title)}`}
                                  className="px-4 py-2 rounded-md bg-[#3156A6] hover:bg-blue-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                                >
                                  <span>Practice Topic</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                              ) : (
                                <span
                                  className="px-3.5 py-1.5 rounded-md bg-slate-100 text-slate-400 font-medium text-xs border border-slate-200 cursor-not-allowed select-none"
                                  title="Questions for this syllabus area will be available in upcoming question batches"
                                >
                                  Upcoming
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Fallback when breakdown RPC is not yet loaded */
          <div className="space-y-3">
            {(exam.syllabus || []).map((part, idx) => {
              const isOpen = expandedSyllabus[idx] ?? true;
              return (
                <div key={idx} className="rounded-md border border-[#E2E8F0] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(idx)}
                    className="w-full px-4 py-3 bg-[#F8FAFC] flex items-center justify-between text-left text-xs sm:text-sm font-semibold text-[#15233B] hover:bg-slate-100 transition-colors"
                  >
                    <span>{part.part}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="p-4 bg-white text-xs space-y-2">
                      <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                        {part.topics.map((topic, tIdx) => (
                          <li key={tIdx} className="leading-relaxed">
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Preparation Materials */}
      {exam.resources && exam.resources.length > 0 && (
        <div className="bg-white rounded-md p-6 border border-[#E2E8F0] space-y-4">
          <h2 className="text-base font-bold text-[#15233B]">
            Available Preparation Materials
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {exam.resources.map((res, rIdx) => (
              <div
                key={rIdx}
                className="p-3.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3"
              >
                <FileText className="w-4 h-4 text-[#3156A6] shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-[#15233B]">{res.name}</h3>
                  <p className="text-[#64748B] mt-0.5">
                    {res.type} • {res.pages ? `${res.pages} pages` : `${res.count} items`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Mixed-Topic Mock Test Callout */}
      {isFpsc && (
        <div className="bg-[#15233B] text-white rounded-md p-6 flex flex-col sm:flex-row items-center justify-between gap-5 border border-slate-800">
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h3 className="font-bold text-base">
                Overall Mixed-Topic Mock Test
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-200 border border-blue-700">
                100 Minutes Simulator
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              Simulate full test-day conditions. Questions are mixed across all prescribed subjects with standard negative marking (0.25 penalty) and post-test analytics.
            </p>
          </div>

          <Link
            to={`/mock-tests?exam=${exam.id}`}
            className="px-4 py-2.5 rounded-md bg-[#3156A6] hover:bg-blue-600 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm flex items-center gap-1.5"
          >
            <span>Launch Full Mock Test</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
};
