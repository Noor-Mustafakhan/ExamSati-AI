import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Check,
  X,
  FileSpreadsheet,
  FolderUp,
  Trash2,
  Eye,
  Info,
  Search,
  ExternalLink,
  Clock,
  RotateCcw,
  LayoutGrid,
  List,
  AlertCircle,
  Pencil,
  Save,
  CheckCheck,
  Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { questionIngestionService } from '../services/questionIngestionService';
import { questionGeneratorService } from '../services/questionGeneratorService';
import { RAGDocumentIngestionDrawer } from '../components/admin/RAGDocumentIngestionDrawer';
import { DifficultyBadge } from '../components/common/Badge';
import { Toast } from '../components/common/Toast';

export const AdminQuestionReviewPage = () => {
  const { user, profile } = useAuth();

  // Core Data States
  const [metrics, setMetrics] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [processingIds, setProcessingIds] = useState({});

  // Status Tab: 'pending' | 'approved' | 'rejected' | 'all'
  const [statusTab, setStatusTab] = useState('pending');

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExam, setSelectedExam] = useState('All');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals / Drawers
  const [detailModalQuestion, setDetailModalQuestion] = useState(null);
  const [rejectConfirmQuestion, setRejectConfirmQuestion] = useState(null);
  const [genDrawerOpen, setGenDrawerOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genExam, setGenExam] = useState('fpsc-lecturer-cs-2026');
  const [genDifficulty, setGenDifficulty] = useState('Moderate');
  const [genCount, setGenCount] = useState(1);
  const [genQuery, setGenQuery] = useState('');

  // RAG Document Ingestion state
  const [ragDrawerOpen, setRagDrawerOpen] = useState(false);

  // Bulk Import state
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [manualTextMode, setManualTextMode] = useState(false);
  const [importText, setImportText] = useState('');

  // Edit MCQ Modal States
  const [editModalQuestion, setEditModalQuestion] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Bulk Approve State
  const [bulkApproveModal, setBulkApproveModal] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // Reference Context for edit dropdowns (subjects, topics)
  const [refContext, setRefContext] = useState({ subjects: [], exams: [], topics: [] });

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const topRef = useRef(null);

  // --------------------------------------------------------------------------
  // Data Loading
  // --------------------------------------------------------------------------
  const loadData = async (tab = statusTab) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [m, qList] = await Promise.all([
        questionIngestionService.getMetrics(),
        questionIngestionService.getPendingQuestions(250, 0, tab)
      ]);
      setMetrics(m);
      setQuestions(qList || []);
    } catch (err) {
      console.error('Failed to load review data:', err);
      setLoadError(err.message || 'Failed to fetch questions from database');
      setToastMsg('Failed to fetch review data.');
    } finally {
      setLoading(false);
    }
  };

  const loadMetricsOnly = async () => {
    try {
      const m = await questionIngestionService.getMetrics();
      if (m) setMetrics(m);
    } catch (err) {
      console.error('Error refreshing metrics:', err);
    }
  };

  useEffect(() => {
    loadData(statusTab);
    setCurrentPage(1);
  }, [statusTab]);

  // Load reference context for edit dropdowns (subjects, topics) once
  useEffect(() => {
    const loadRefContext = async () => {
      try {
        const ctx = await questionIngestionService.getReferenceContext();
        if (ctx) setRefContext(ctx);
      } catch (err) {
        console.error('Error loading reference context:', err);
      }
    };
    loadRefContext();
  }, []);

  // --------------------------------------------------------------------------
  // Approve Action Handler
  // --------------------------------------------------------------------------
  const handleApprove = async (question) => {
    if (!question?.id || processingIds[question.id]) return;

    setProcessingIds(prev => ({ ...prev, [question.id]: true }));
    try {
      const res = await questionIngestionService.reviewQuestion(
        question.id,
        'approve',
        'verified_citation',
        user?.id || null
      );

      if (res?.success) {
        setToastMsg('Question approved and published to student practice bank.');
        // Update local state without jarring reload
        setQuestions(prev => {
          if (statusTab === 'pending') {
            return prev.filter(q => q.id !== question.id);
          }
          return prev.map(q =>
            q.id === question.id
              ? { ...q, review_status: 'approved', is_published: true, verification_status: 'verified_citation' }
              : q
          );
        });
        loadMetricsOnly();
      } else {
        setToastMsg(`Approval failed: ${res?.error || 'Database rejected the update.'}`);
      }
    } catch (err) {
      setToastMsg(`Approval error: ${err.message}`);
    } finally {
      setProcessingIds(prev => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    }
  };

  // --------------------------------------------------------------------------
  // Reject Action Handler
  // --------------------------------------------------------------------------
  const handleOpenRejectConfirm = (question, e) => {
    if (e) e.stopPropagation();
    setRejectConfirmQuestion(question);
  };

  const handleConfirmReject = async () => {
    const question = rejectConfirmQuestion;
    if (!question?.id) return;

    setRejectConfirmQuestion(null);
    setProcessingIds(prev => ({ ...prev, [question.id]: true }));

    try {
      const res = await questionIngestionService.reviewQuestion(
        question.id,
        'reject',
        'community_submitted',
        user?.id || null
      );

      if (res?.success) {
        setToastMsg('Question rejected and archived. It will not be shown to students.');
        setQuestions(prev => {
          if (statusTab === 'pending') {
            return prev.filter(q => q.id !== question.id);
          }
          return prev.map(q =>
            q.id === question.id
              ? { ...q, review_status: 'rejected', is_published: false, verification_status: 'community_submitted' }
              : q
          );
        });
        loadMetricsOnly();
      } else {
        setToastMsg(`Rejection failed: ${res?.error || 'Database rejected update.'}`);
      }
    } catch (err) {
      setToastMsg(`Rejection error: ${err.message}`);
    } finally {
      setProcessingIds(prev => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    }
  };

  // --------------------------------------------------------------------------
  // Bulk Approve Handler
  // --------------------------------------------------------------------------
  const handleConfirmBulkApprove = async () => {
    setIsBulkApproving(true);
    try {
      const res = await questionIngestionService.bulkReviewQuestions({
        allPending: true,
        decision: 'approve',
        verificationStatus: 'verified_citation',
        reviewerId: user?.id || null,
      });

      if (res?.success) {
        const count = res.affected_count ?? '';
        setToastMsg(`Successfully approved all ${count} pending questions to the student test bank!`);
        setBulkApproveModal(false);
        await loadData(statusTab);
      } else {
        setToastMsg(`Bulk approval failed: ${res?.error || 'Database rejected the update.'}`);
      }
    } catch (err) {
      setToastMsg(`Bulk approval error: ${err.message}`);
    } finally {
      setIsBulkApproving(false);
    }
  };

  // --------------------------------------------------------------------------
  // Edit MCQ Handlers
  // --------------------------------------------------------------------------
  const handleOpenEdit = useCallback((question, e) => {
    if (e) e.stopPropagation();
    setEditError('');
    setEditFormData({
      question_text: question.question_text || '',
      options: Array.isArray(question.options) ? [...question.options] : ['', '', '', ''],
      correct_option: question.correct_option ?? 0,
      explanation: question.explanation || '',
      subject_id: question.subject_id || null,
      syllabus_topic_id: question.syllabus_topic_id || null,
      difficulty: question.difficulty || 'Moderate',
      source_title: question.source_title || '',
      source_page: question.source_page || '',
    });
    setEditModalQuestion(question);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditModalQuestion(null);
    setEditFormData(null);
    setEditError('');
  }, []);

  const handleEditFieldChange = useCallback((field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleEditOptionChange = useCallback((index, value) => {
    setEditFormData(prev => {
      const newOptions = [...prev.options];
      newOptions[index] = value;
      return { ...prev, options: newOptions };
    });
  }, []);

  const handleSaveEdit = async () => {
    if (!editModalQuestion?.id || !editFormData) return;
    setEditError('');

    // Client-side validation
    if (!editFormData.question_text || editFormData.question_text.trim().length < 10) {
      setEditError('Question text must be at least 10 characters.');
      return;
    }
    if (editFormData.options.some(opt => !opt || opt.trim().length === 0)) {
      setEditError('All 4 options must have non-empty text.');
      return;
    }
    if (editFormData.correct_option < 0 || editFormData.correct_option > 3) {
      setEditError('Please select exactly one correct answer (A, B, C, or D).');
      return;
    }
    if (!editFormData.explanation || editFormData.explanation.trim().length < 5) {
      setEditError('Explanation must be at least 5 characters.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await questionIngestionService.updateQuestion(
        editModalQuestion.id,
        editFormData
      );

      if (res?.success) {
        // Update local state with returned question data
        const updatedQ = res.question || {};
        setQuestions(prev =>
          prev.map(q =>
            q.id === editModalQuestion.id
              ? { ...q, ...updatedQ }
              : q
          )
        );
        setToastMsg('Question updated successfully.');
        handleCancelEdit();
      } else {
        setEditError(res?.error || 'Failed to save changes. Please try again.');
      }
    } catch (err) {
      setEditError(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filtered topics based on selected subject in edit form
  const editFilteredTopics = useMemo(() => {
    if (!editFormData?.subject_id || !refContext.topics) return refContext.topics || [];
    return refContext.topics.filter(t => t.subject_id === editFormData.subject_id);
  }, [editFormData?.subject_id, refContext.topics]);

  // --------------------------------------------------------------------------
  // Bulk CSV Handlers (Preserved from previous implementation)
  // --------------------------------------------------------------------------
  const handleFilesChosen = async (event) => {
    const fileList = Array.from(event.target.files || []);
    if (fileList.length === 0) return;

    setSelectedFiles(fileList);
    setImportResult(null);
    setImportProgress(null);
    setIsValidating(true);

    try {
      const preview = await questionIngestionService.parseAndValidateCsvFiles(fileList);
      setPreviewData(preview);
      const validCount = preview.summary.totalValid;
      const rejFileCount = preview.summary.rejectedFilesCount;

      let msg = `Validated ${fileList.length} file(s): ${validCount} candidate draft(s) ready.`;
      if (rejFileCount > 0) msg += ` (${rejFileCount} non-CSV files ignored)`;
      setToastMsg(msg);
    } catch (err) {
      setToastMsg(`Validation failed: ${err.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedFiles([]);
    setPreviewData(null);
    setImportResult(null);
    setImportProgress(null);
    setExpandedFileIdx(null);
    setImportText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleConfirmBulkImport = async () => {
    if (!previewData || previewData.summary.totalValid === 0) {
      setToastMsg('No valid draft questions to import.');
      return;
    }

    const allValidQuestions = previewData.files.flatMap(f => f.validRows || []);
    if (allValidQuestions.length === 0) {
      setToastMsg('No valid questions found across selected files.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await questionIngestionService.importBulkDrafts(
        allValidQuestions,
        (progress) => setImportProgress(progress)
      );

      setImportResult(result);
      if (result.insertedCount > 0) {
        setToastMsg(`Import complete: ${result.insertedCount} drafts saved as unpublished pending review.`);
        loadData('pending');
      } else if (result.duplicateCount > 0) {
        setToastMsg(`Import note: All ${result.duplicateCount} records were already in database.`);
      } else {
        setToastMsg('Import finished with 0 questions inserted.');
      }
    } catch (err) {
      setToastMsg(`Bulk import error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualTextImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const report = await questionIngestionService.ingestQuestions(importText, {
        dryRun: false,
        publishByDefault: false
      });
      setImportResult(report);
      if (report.insertedCount > 0) {
        setToastMsg(`Successfully ingested ${report.insertedCount} draft questions.`);
        loadData('pending');
      } else if (report.duplicateCount > 0) {
        setToastMsg(`All ${report.duplicateCount} records were duplicates and skipped.`);
      }
    } catch (err) {
      setToastMsg(`Import failure: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleGenerateBatch = async () => {
    setIsGenerating(true);
    try {
      const res = await questionGeneratorService.generateBatch({
        examSlug: genExam,
        query: genQuery,
        difficulty: genDifficulty,
        count: parseInt(genCount, 10) || 1,
      });

      if (res.success) {
        setToastMsg(`Successfully generated ${res.insertedCount} grounded question(s) from PDF curriculum (queued for review).`);
        setStatusTab('pending');
        loadData('pending');
      } else if (res.error === 'INSUFFICIENT_EVIDENCE') {
        setToastMsg(`Refused: ${res.message || 'Evidence is insufficient in curriculum documents.'}`);
      } else {
        setToastMsg(`Generation note: ${res.duplicateCount || 0} duplicates skipped. ${res.message || ''}`);
      }
    } catch (err) {
      setToastMsg(`Generation error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --------------------------------------------------------------------------
  // Filtering & Search Memo
  // --------------------------------------------------------------------------
  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      // 1. Search Query (Question text, explanation, source title)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = (q.question_text || '').toLowerCase().includes(query);
        const matchesExpl = (q.explanation || '').toLowerCase().includes(query);
        const matchesSource = (q.source_title || '').toLowerCase().includes(query);
        const matchesTopic = (q.topic_title || '').toLowerCase().includes(query);
        if (!matchesText && !matchesExpl && !matchesSource && !matchesTopic) return false;
      }

      // 2. Exam Filter
      if (selectedExam !== 'All' && q.exam_slug !== selectedExam) return false;

      // 3. Subject Filter
      if (selectedSubject !== 'All' && q.subject_name !== selectedSubject) return false;

      // 4. Difficulty Filter
      if (selectedDifficulty !== 'All' && q.difficulty !== selectedDifficulty) return false;

      return true;
    });
  }, [questions, searchQuery, selectedExam, selectedSubject, selectedDifficulty]);

  // Pagination calculation
  const totalItems = filteredQuestions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  // Derived filter options
  const availableExams = useMemo(() => {
    const set = new Set();
    questions.forEach(q => { if (q.exam_slug) set.add(q.exam_slug); });
    return Array.from(set).sort();
  }, [questions]);

  const availableSubjects = useMemo(() => {
    const set = new Set();
    questions.forEach(q => { if (q.subject_name) set.add(q.subject_name); });
    return Array.from(set).sort();
  }, [questions]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedExam('All');
    setSelectedSubject('All');
    setSelectedDifficulty('All');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || selectedExam !== 'All' || selectedSubject !== 'All' || selectedDifficulty !== 'All';

  // Helper: Provenance Tag
  const renderProvenanceTag = (origin, verificationStatus) => {
    const orig = (origin || '').toLowerCase();
    const ver = (verificationStatus || '').toLowerCase();

    if (orig.includes('official') || ver.includes('official')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          Official Past Paper
        </span>
      );
    }
    if (ver.includes('verified') || orig.includes('reviewed')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
          <CheckCircle2 className="w-3 h-3 text-blue-600" />
          Verified Citation
        </span>
      );
    }
    if (orig.includes('ai') || ver.includes('practice_exercise')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          AI-Generated Practice
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
        Community Submission
      </span>
    );
  };

  return (
    <div ref={topRef} className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* -------------------------------------------------------------------- */}
      {/* 1. Header & Primary Management Controls                              */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs tracking-wider uppercase">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrative Content Quality Center</span>
            {profile?.role && (
              <span className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-normal uppercase ${
                profile.role === 'admin'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : profile.role === 'moderator'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}>
                {profile.role}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight">
            Question Review
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
            Review candidate questions, verify conceptual explanations and citations, and control publication.
          </p>
          {profile && profile.role !== 'admin' && profile.role !== 'moderator' && (
            <div className="mt-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                Your logged-in account has role <strong>"{profile.role}"</strong>. Approving and rejecting questions requires an <strong>admin</strong> role in Supabase.
              </span>
            </div>
          )}
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="admin-rag-documents-toggle"
            type="button"
            onClick={() => {
              setRagDrawerOpen(!ragDrawerOpen);
              if (importDrawerOpen) setImportDrawerOpen(false);
              if (genDrawerOpen) setGenDrawerOpen(false);
            }}
            className={`h-9 sm:h-10 px-3.5 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap border shadow-sm ${
              ragDrawerOpen
                ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
            }`}
          >
            <Database className="w-4 h-4 text-indigo-500" />
            <span>{ragDrawerOpen ? 'Close RAG Panel' : 'RAG Documents (PDF Index)'}</span>
          </button>

          <button
            id="admin-bulk-import-toggle"
            type="button"
            onClick={() => {
              setImportDrawerOpen(!importDrawerOpen);
              if (genDrawerOpen) setGenDrawerOpen(false);
              if (ragDrawerOpen) setRagDrawerOpen(false);
            }}
            className={`h-9 sm:h-10 px-3.5 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap border shadow-sm ${
              importDrawerOpen
                ? 'bg-[#3156A6] text-white border-[#3156A6] shadow-sm'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
            }`}
          >
            <Upload className="w-4 h-4 text-indigo-500" />
            <span>{importDrawerOpen ? 'Close Import Panel' : 'Bulk Import CSV'}</span>
          </button>

          <button
            id="admin-ai-generate-toggle"
            type="button"
            onClick={() => {
              setGenDrawerOpen(!genDrawerOpen);
              if (importDrawerOpen) setImportDrawerOpen(false);
              if (ragDrawerOpen) setRagDrawerOpen(false);
            }}
            className={`h-9 sm:h-10 px-3.5 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap border shadow-sm ${
              genDrawerOpen
                ? 'bg-indigo-700 text-white border-indigo-700'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{genDrawerOpen ? 'Close Generator' : 'Batch Generate (AI)'}</span>
          </button>

          {(metrics?.pending_count ?? 0) > 0 && (
            <button
              id="admin-bulk-approve-all"
              type="button"
              onClick={() => setBulkApproveModal(true)}
              disabled={loading || isBulkApproving}
              className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
              title="Approve and publish all pending questions to the student test bank"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Approve All ({metrics.pending_count})</span>
            </button>
          )}

          <button
            id="admin-refresh-data"
            type="button"
            onClick={() => loadData(statusTab)}
            disabled={loading}
            className="h-9 sm:h-10 px-3 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-flex items-center justify-center shadow-sm disabled:opacity-50"
            title="Refresh question bank and queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. Review Status Summary & Metric Cards                             */}
      {/* -------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pending Review Card */}
        <button
          type="button"
          onClick={() => setStatusTab('pending')}
          className={`p-4 rounded-xl text-left border transition-all shadow-sm ${
            statusTab === 'pending'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400 dark:bg-amber-950/40 dark:border-amber-700'
              : 'bg-white hover:bg-amber-50/40 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Pending Review
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200 mt-1">
            {metrics ? (metrics.pending_count ?? 0) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Unpublished candidate drafts</div>
        </button>

        {/* Approved & Published Card */}
        <button
          type="button"
          onClick={() => setStatusTab('approved')}
          className={`p-4 rounded-xl text-left border transition-all shadow-sm ${
            statusTab === 'approved'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-700'
              : 'bg-white hover:bg-emerald-50/40 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Approved & Live
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-900 dark:text-emerald-200 mt-1">
            {metrics ? (metrics.published_count ?? 0) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Active in student practice tests</div>
        </button>

        {/* Rejected / Archived Card */}
        <button
          type="button"
          onClick={() => setStatusTab('rejected')}
          className={`p-4 rounded-xl text-left border transition-all shadow-sm ${
            statusTab === 'rejected'
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400 dark:bg-rose-950/40 dark:border-rose-700'
              : 'bg-white hover:bg-rose-50/40 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Rejected / Archived
            </span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-900 dark:text-rose-200 mt-1">
            {metrics ? (metrics.rejected_count ?? 0) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Hidden from student practice</div>
        </button>

        {/* Total Questions Card */}
        <button
          type="button"
          onClick={() => setStatusTab('all')}
          className={`p-4 rounded-xl text-left border transition-all shadow-sm ${
            statusTab === 'all'
              ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-500 dark:bg-blue-950/40 dark:border-blue-700'
              : 'bg-white hover:bg-blue-50/40 border-slate-200 dark:bg-slate-900 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                statusTab === 'all'
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Total In System
            </span>
            <Info
              className={`w-4 h-4 ${
                statusTab === 'all' ? 'text-blue-500' : 'text-slate-400'
              }`}
            />
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black mt-1 ${
              statusTab === 'all'
                ? 'text-blue-900 dark:text-blue-200'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {metrics ? (metrics.total_questions ?? 0) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">All syllabus categories combined</div>
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2.5 RAG Document Ingestion & Passage Indexing Drawer (Stage 1)       */}
      {/* -------------------------------------------------------------------- */}
      <RAGDocumentIngestionDrawer
        isOpen={ragDrawerOpen}
        onClose={() => setRagDrawerOpen(false)}
        refContext={refContext}
        onToast={setToastMsg}
        onQuestionGenerated={() => loadData(statusTab)}
      />

      {/* -------------------------------------------------------------------- */}
      {/* 3. Bulk CSV Import Drawer (Expandable)                               */}
      {/* -------------------------------------------------------------------- */}
      {importDrawerOpen && (
        <section
          aria-labelledby="bulk-import-heading"
          className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <FileSpreadsheet className="w-4 h-4" />
                <h2 id="bulk-import-heading" className="text-slate-900 dark:text-white text-base">
                  Bulk CSV Draft Ingestion Pipeline
                </h2>
              </div>
              <p className="text-slate-500 text-xs mt-0.5">
                Select generated CSV files from your local storage. Questions will be validated and staged as unpublished drafts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setManualTextMode(!manualTextMode)}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 underline"
            >
              {manualTextMode ? 'Switch to Multi-File Selection' : 'Switch to Paste CSV Mode'}
            </button>
          </div>

          {!manualTextMode ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={handleFilesChosen}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={handleFilesChosen}
                />

                <button
                  id="btn-select-csv-files"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isValidating || isImporting}
                  className="h-9 sm:h-10 px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Select CSV Files</span>
                </button>

                <button
                  id="btn-select-csv-folder"
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isValidating || isImporting}
                  className="h-9 sm:h-10 px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-50"
                  title="Select directory containing generated CSVs"
                >
                  <FolderUp className="w-4 h-4 text-slate-500" />
                  <span>Select Folder</span>
                </button>

                {selectedFiles.length > 0 && (
                  <button
                    id="btn-clear-selection"
                    type="button"
                    onClick={handleClearSelection}
                    disabled={isImporting}
                    className="h-9 sm:h-10 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}

                {isValidating && (
                  <span className="text-xs text-slate-500 inline-flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Validating files and schemas...</span>
                  </span>
                )}
              </div>

              {previewData && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Validation Summary: {previewData.summary.validFilesCount} file(s) valid, {previewData.summary.totalValid} candidate questions ready.
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmBulkImport}
                      disabled={isImporting || previewData.summary.totalValid === 0}
                      className="h-8 px-4 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>Import {previewData.summary.totalValid} Questions (as Drafts)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Paste CSV rows here (question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, subject, explanation)..."
                rows={5}
                className="w-full text-xs font-mono p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={handleManualTextImport}
                disabled={isImporting || !importText.trim()}
                className="h-9 px-4 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
              >
                {isImporting ? 'Ingesting...' : 'Import Pasted CSV as Drafts'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 4. Batch Generator Drawer (Expandable)                               */}
      {/* -------------------------------------------------------------------- */}
      {genDrawerOpen && (
        <section className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
            <Sparkles className="w-4 h-4" />
            <h2 className="text-slate-900 dark:text-white text-base">Generate Questions via Syllabus Grounding</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Exam Profile</label>
              <select
                value={genExam}
                onChange={e => setGenExam(e.target.value)}
                className="w-full h-9 mt-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              >
                <option value="fpsc-lecturer-cs-2026">Lecturer Computer Science (BS-17)</option>
                <option value="fpsc-computer-programmer-2026">Computer Programmer (BS-17)</option>
                <option value="fpsc-ad-fia-2026">Assistant Director FIA (BS-17)</option>
                <option value="fpsc-inspector-customs-2026">Inspector Customs (BS-16)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Topic / Query (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Belady Anomaly FIFO"
                value={genQuery}
                onChange={e => setGenQuery(e.target.value)}
                className="w-full h-9 mt-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Difficulty</label>
              <select
                value={genDifficulty}
                onChange={e => setGenDifficulty(e.target.value)}
                className="w-full h-9 mt-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              >
                <option value="Easy">Easy</option>
                <option value="Moderate">Moderate (Medium)</option>
                <option value="Advanced">Advanced (Hard)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Batch Quantity</label>
              <select
                value={genCount}
                onChange={e => setGenCount(e.target.value)}
                className="w-full h-9 mt-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              >
                <option value={1}>1 Question</option>
                <option value={3}>3 Questions</option>
                <option value={5}>5 Questions</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerateBatch}
              disabled={isGenerating}
              className="h-9 px-4 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isGenerating ? 'Generating Drafts...' : 'Generate Batch (Draft)'}</span>
            </button>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 5. Search, Filter Bar & View Toggle                                  */}
      {/* -------------------------------------------------------------------- */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {/* Top Filter Bar: Tabs & View Toggle */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setStatusTab('pending')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusTab === 'pending'
                  ? 'bg-amber-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Pending ({metrics ? metrics.pending_count ?? 0 : '0'})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('approved')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusTab === 'approved'
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Approved ({metrics ? metrics.published_count ?? 0 : '0'})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('rejected')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusTab === 'rejected'
                  ? 'bg-rose-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Rejected ({metrics ? metrics.rejected_count ?? 0 : '0'})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusTab === 'all'
                  ? 'bg-[#3156A6] text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Records
            </button>
            {statusTab === 'pending' && (metrics?.pending_count ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setBulkApproveModal(true)}
                disabled={loading || isBulkApproving}
                className="ml-1 sm:ml-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Approve and publish all pending candidate questions"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Approve All ({metrics.pending_count})</span>
              </button>
            )}
          </div>

          {/* View Mode Toggle & Total Display */}
          <div className="flex items-center gap-3 justify-between md:justify-end">
            <span className="text-xs text-slate-500">
              Showing <strong className="text-slate-700 dark:text-slate-300">{filteredQuestions.length}</strong> matching questions
            </span>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'cards' ? 'bg-[#3156A6] text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                title="Cards view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-[#3156A6] text-white shadow-xs' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                title="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Input & Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search question text, source, explanation..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          {/* Exam Filter */}
          <select
            value={selectedExam}
            onChange={e => { setSelectedExam(e.target.value); setCurrentPage(1); }}
            className="h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
          >
            <option value="All">All Exams</option>
            {availableExams.map(slug => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>

          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={e => { setSelectedSubject(e.target.value); setCurrentPage(1); }}
            className="h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
          >
            <option value="All">All Subjects</option>
            {availableSubjects.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {/* Difficulty Filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedDifficulty}
              onChange={e => { setSelectedDifficulty(e.target.value); setCurrentPage(1); }}
              className="w-full h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
            >
              <option value="All">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Moderate">Moderate</option>
              <option value="Advanced">Advanced</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-9 px-2.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 shrink-0 inline-flex items-center gap-1"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 6. Main Question Review Queue Area                                  */}
      {/* -------------------------------------------------------------------- */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(statusTab)}
            className="text-xs font-semibold px-3 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Loading questions from database...
          </div>
          <div className="text-xs text-slate-500">Retrieving questions, citations, and answer keys</div>
        </div>
      ) : filteredQuestions.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {statusTab === 'pending'
              ? 'Review Queue Clear'
              : `No ${statusTab} Questions Found`}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'No questions matched your current search filters. Try adjusting or clearing your filters.'
              : statusTab === 'pending'
              ? 'All candidate questions have been reviewed! Import new CSV files or generate drafts to review more.'
              : `There are currently no questions recorded under the "${statusTab}" status.`}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
            >
              Clear Active Filters
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* ================================================================== */
        /* CARDS VIEW                                                         */
        /* ================================================================== */
        <div className="space-y-4">
          {paginatedQuestions.map((q, idx) => {
            const isProcessing = Boolean(processingIds[q.id]);
            const isApproved = q.review_status === 'approved' || q.is_published === true;
            const isRejected = q.review_status === 'rejected';

            return (
              <div
                key={q.id || idx}
                className={`p-5 sm:p-6 rounded-xl border bg-white dark:bg-slate-900 transition-all shadow-sm space-y-4 ${
                  isRejected
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/10'
                    : isApproved
                    ? 'border-emerald-200 dark:border-emerald-900/60'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Meta Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Status Pill */}
                    {isRejected ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800">
                        Rejected
                      </span>
                    ) : isApproved ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                        Approved & Live
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800">
                        Pending Review
                      </span>
                    )}

                    {/* Provenance */}
                    {renderProvenanceTag(q.question_origin, q.verification_status)}

                    {/* Difficulty */}
                    <DifficultyBadge difficulty={q.difficulty} />

                    {/* Subject & Exam */}
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      {q.subject_name || 'General Subject'}
                    </span>
                    {q.exam_title && (
                      <span className="text-xs px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {q.exam_title}
                      </span>
                    )}
                    {q.topic_title && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {q.topic_title}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                    {q.source_page && <span>Page: {q.source_page}</span>}
                    <span>ID: {q.id ? q.id.slice(0, 8) : 'draft'}</span>
                  </div>
                </div>

                {/* Question Stem */}
                <div className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                  {q.question_text}
                </div>

                {/* Options List with VISIBLE CORRECT ANSWER DISTINCTION */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Array.isArray(q.options) && q.options.map((opt, optIdx) => {
                    const isCorrect = q.correct_option === optIdx;

                    return (
                      <div
                        key={optIdx}
                        className={`p-3 rounded-lg border text-sm flex items-center gap-3 transition-colors ${
                          isCorrect
                            ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-100 font-medium ring-1 ring-emerald-400/50'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {/* Option Letter Badge */}
                        <span
                          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>

                        <span className="break-words flex-1 leading-snug">{opt}</span>

                        {isCorrect && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 shrink-0">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Correct
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation & Source Grounding */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200">Conceptual Explanation:</strong>{' '}
                    <span>{q.explanation}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-slate-500">
                    <div>
                      <strong className="text-slate-700 dark:text-slate-300">Source:</strong>{' '}
                      <span>{q.source_title || 'Curriculum Reference'}</span>
                      {q.source_page && <span className="ml-1 font-medium">({q.source_page})</span>}
                    </div>
                    {q.source_url && (
                      <div>
                        <a
                          href={q.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Citation Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {q.reviewed_at && (
                      <div>
                        <strong className="text-slate-700 dark:text-slate-300">Reviewed:</strong>{' '}
                        <span>{new Date(q.reviewed_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Controls Bar */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* View Details Button */}
                  <button
                    type="button"
                    onClick={() => setDetailModalQuestion(q)}
                    className="h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span>View Details</span>
                  </button>

                  {/* Edit / Approve / Reject Controls */}
                  <div className="flex items-center gap-2">
                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(q, e)}
                      disabled={isProcessing}
                      className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors border shadow-xs disabled:opacity-50 whitespace-nowrap text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {/* Reject Button */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenRejectConfirm(q, e)}
                      disabled={isProcessing}
                      className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors border shadow-xs disabled:opacity-50 whitespace-nowrap ${
                        isRejected
                          ? 'text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                          : 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                      }`}
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      <span>{isRejected ? 'Rejected' : 'Reject'}</span>
                    </button>

                    {/* Approve Button */}
                    <button
                      type="button"
                      onClick={() => handleApprove(q)}
                      disabled={isProcessing}
                      className={`h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 text-white transition-colors shadow-xs disabled:opacity-50 whitespace-nowrap ${
                        isApproved
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>{isApproved ? 'Approved (Re-verify)' : 'Approve & Publish'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================================================================== */
        /* COMPACT TABLE VIEW                                                 */
        /* ================================================================== */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold w-2/5">Question Text</th>
                <th className="p-3 font-semibold">Correct Option</th>
                <th className="p-3 font-semibold">Subject / Exam</th>
                <th className="p-3 font-semibold">Difficulty</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedQuestions.map((q, idx) => {
                const isProcessing = Boolean(processingIds[q.id]);
                const isApproved = q.review_status === 'approved' || q.is_published === true;
                const isRejected = q.review_status === 'rejected';

                const correctText =
                  Array.isArray(q.options) && q.correct_option !== undefined && q.correct_option !== null
                    ? `${String.fromCharCode(65 + q.correct_option)}: ${q.options[q.correct_option]}`
                    : 'Unassigned';

                return (
                  <tr key={q.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      {isRejected ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          Rejected
                        </span>
                      ) : isApproved ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Live
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900 dark:text-white line-clamp-2">
                        {q.question_text}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {q.explanation}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 truncate max-w-[200px] inline-block">
                        {correctText}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      <div>{q.subject_name || 'General'}</div>
                      <div className="text-[11px] text-slate-500">{q.exam_slug || 'General Exam'}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <DifficultyBadge difficulty={q.difficulty} />
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailModalQuestion(q)}
                          className="h-8 px-2.5 rounded text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenEdit(q, e)}
                          disabled={isProcessing}
                          className="h-8 px-2.5 rounded text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50"
                          title="Edit MCQ"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenRejectConfirm(q, e)}
                          disabled={isProcessing}
                          className="h-8 px-2.5 rounded text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(q)}
                          disabled={isProcessing}
                          className="h-8 px-3 rounded text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                          title="Approve & Publish"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 7. Pagination Controls                                               */}
      {/* -------------------------------------------------------------------- */}
      {filteredQuestions.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="h-8 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-slate-900 dark:text-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="ml-2">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems} questions
            </span>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 font-medium"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 8. View Details Modal                                                */}
      {/* -------------------------------------------------------------------- */}
      {detailModalQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
                  Question Detail Inspector
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  ID: {detailModalQuestion.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalQuestion(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question Stem */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Question Text</label>
              <div className="text-sm font-semibold text-slate-900 dark:text-white p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                {detailModalQuestion.question_text}
              </div>
            </div>

            {/* Options List */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Options (Answer Key Highlighted)</label>
              <div className="grid grid-cols-1 gap-2">
                {Array.isArray(detailModalQuestion.options) && detailModalQuestion.options.map((opt, i) => {
                  const isCorrect = detailModalQuestion.correct_option === i;
                  return (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 ${
                        isCorrect
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] ${
                        isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{opt}</span>
                      {isCorrect && (
                        <span className="ml-auto text-[10px] uppercase font-bold text-emerald-700">
                          Correct Option
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explanation */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Explanation</label>
              <div className="text-xs text-slate-700 dark:text-slate-300 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                {detailModalQuestion.explanation}
              </div>
            </div>

            {/* Audit & Classification Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Subject</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.subject_name || 'N/A'}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Exam</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.exam_title || 'N/A'}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Difficulty</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.difficulty}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Review Status</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.review_status || 'pending'}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Published</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.is_published ? 'Yes (Live)' : 'No (Draft)'}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px] uppercase">Source Page</span>
                <strong className="text-slate-800 dark:text-slate-200">{detailModalQuestion.source_page || 'N/A'}</strong>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailModalQuestion(null)}
                className="h-9 px-4 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 9. Reject Confirmation Modal                                         */}
      {/* -------------------------------------------------------------------- */}
      {rejectConfirmQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Confirm Question Rejection
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Are you sure you want to reject this question? It will be marked as <strong>rejected</strong> and preserved in the database for auditing and revision, but will be completely hidden from student practice tests.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs italic text-slate-700 dark:text-slate-300">
              "{rejectConfirmQuestion.question_text?.slice(0, 120)}..."
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectConfirmQuestion(null)}
                className="h-9 px-4 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="h-9 px-4 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 10. Edit MCQ Modal                                                   */}
      {/* -------------------------------------------------------------------- */}
      {editModalQuestion && editFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <Pencil className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Question</h3>
                  <span className="text-[11px] font-mono text-slate-400">ID: {editModalQuestion.id?.slice(0, 8)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Edit Error Alert */}
              {editError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Question Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Question Text</label>
                <textarea
                  value={editFormData.question_text}
                  onChange={e => handleEditFieldChange('question_text', e.target.value)}
                  rows={3}
                  className="w-full p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-y"
                  placeholder="Enter the question text..."
                />
              </div>

              {/* Options A, B, C, D with Correct Answer Radio */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Answer Options</label>
                <p className="text-[11px] text-slate-500 -mt-1">Select the radio button next to the correct answer.</p>
                {[0, 1, 2, 3].map(idx => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      editFormData.correct_option === idx
                        ? 'bg-emerald-50/80 border-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-700 ring-1 ring-emerald-400/40'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {/* Radio Button for Correct Answer */}
                    <label className="cursor-pointer flex items-center gap-0 shrink-0">
                      <input
                        type="radio"
                        name="edit-correct-option"
                        checked={editFormData.correct_option === idx}
                        onChange={() => handleEditFieldChange('correct_option', idx)}
                        className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </label>
                    {/* Option Letter Badge */}
                    <span className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                      editFormData.correct_option === idx
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {/* Option Text Input */}
                    <input
                      type="text"
                      value={editFormData.options[idx] || ''}
                      onChange={e => handleEditOptionChange(idx, e.target.value)}
                      className="flex-1 h-9 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    />
                    {editFormData.correct_option === idx && (
                      <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 shrink-0 hidden sm:inline">Correct</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Explanation */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Explanation</label>
                <textarea
                  value={editFormData.explanation}
                  onChange={e => handleEditFieldChange('explanation', e.target.value)}
                  rows={3}
                  className="w-full p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-y"
                  placeholder="Explain why the correct answer is right..."
                />
              </div>

              {/* Subject, Topic, Difficulty Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                  <select
                    value={editFormData.subject_id || ''}
                    onChange={e => {
                      handleEditFieldChange('subject_id', e.target.value || null);
                      handleEditFieldChange('syllabus_topic_id', null);
                    }}
                    className="w-full h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-white"
                  >
                    <option value="">Select subject...</option>
                    {refContext.subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Syllabus Topic */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Topic</label>
                  <select
                    value={editFormData.syllabus_topic_id || ''}
                    onChange={e => handleEditFieldChange('syllabus_topic_id', e.target.value || null)}
                    className="w-full h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-white"
                    disabled={!editFormData.subject_id}
                  >
                    <option value="">{editFormData.subject_id ? 'Select topic...' : 'Select a subject first'}</option>
                    {editFilteredTopics.map(t => (
                      <option key={t.id} value={t.id}>{t.topic_title}</option>
                    ))}
                  </select>
                </div>

                {/* Difficulty */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Difficulty</label>
                  <select
                    value={editFormData.difficulty}
                    onChange={e => handleEditFieldChange('difficulty', e.target.value)}
                    className="w-full h-9 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-900 dark:text-white"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Source Title & Page */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Source Title</label>
                  <input
                    type="text"
                    value={editFormData.source_title}
                    onChange={e => handleEditFieldChange('source_title', e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    placeholder="e.g. Official Past Paper 2024"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Source Page</label>
                  <input
                    type="text"
                    value={editFormData.source_page}
                    onChange={e => handleEditFieldChange('source_page', e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    placeholder="e.g. Page 12"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 rounded-b-xl">
              <p className="text-[11px] text-slate-500">
                {editModalQuestion.review_status === 'pending'
                  ? 'Editing will not automatically approve this question.'
                  : `Current status: ${editModalQuestion.review_status || 'pending'}`}
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="h-9 px-4 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="h-9 px-5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 11. Bulk Approve All Confirmation Modal                              */}
      {/* -------------------------------------------------------------------- */}
      {bulkApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Approve All Pending Questions?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  This will approve and publish all <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{metrics?.pending_count || '0'} pending questions</strong> directly to the student practice test bank in a single operation.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
              ✓ All candidate questions will immediately be marked as <strong>Approved & Live</strong> and visible to students.
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBulkApproveModal(false)}
                disabled={isBulkApproving}
                className="h-9 px-4 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkApprove}
                disabled={isBulkApproving}
                className="h-9 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isBulkApproving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Approving All...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-4 h-4" />
                    <span>Confirm & Approve All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 12. Toast Notification                                               */}
      {/* -------------------------------------------------------------------- */}
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
    </div>
  );
};
