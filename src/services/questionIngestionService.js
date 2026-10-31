import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

/**
 * Robust RFC 4180 compliant CSV Parser.
 * Handles quoted fields, escaped double quotes (""), line breaks within cells, and trimming.
 *
 * @param {string} csvText
 * @returns {Array<Object>} Array of row objects with lowercase normalized header keys
 */
export function parseCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;

  const chars = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip next escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Last cell
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.toLowerCase().replace(/[\s_-]+/g, '_'));
  const dataRows = rows.slice(1);

  return dataRows.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });
}

/**
 * Clean question text by stripping accidental test labels, internal IDs,
 * fake FPSC case numbers, random numeric ID strings, timestamps, and
 * debugging prefixes while strictly preserving legitimate academic questions,
 * technical colons, legal case numbers, and abbreviations.
 */
export function cleanQuestionText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText.trim();

  // ── Test/debug prefixes ──
  const prefixPatterns = [
    /^Test\s+Review\s+Flow\s+Candidate\s*\[[^\]]+\]\s*:\s*/i,
    /^Test\s+Candidate\s*\[[^\]]+\]\s*:\s*/i,
    /^Candidate\s*\[[^\]]+\]\s*:\s*/i,
    /^Automated\s+Bulk\s+Import\s+E2E\s+Test\s+Question(?:\s+\d+)?\s*:\s*/i,
    /^Bulk\s+Import\s+E2E\s+Test\s+Question(?:\s+\d+)?\s*:\s*/i,
    /^Test\s+Stage\s+\d+\s+Automated\s+Ingestion(?:\s+\d+)?\s*:\s*/i,
    /^Test\s+Stage\s+\d+(?:\s+\d+)?\s*:\s*/i,
    /^Test\s+Automated\s+Ingestion(?:\s+\d+)?\s*:\s*/i,
    /^Test\s+Ingestion(?:\s+\d+)?\s*:\s*/i,
    /^Idempotent\s+Test\s+Question(?:\s+\d+)?\s*:\s*/i,
    /^Automated\s+Ingestion\s+Test(?:\s+\d+)?\s*:\s*/i,
    /^(?:DEBUG|TEST|FIXTURE|SAMPLE_TEST)\s*:\s*/i
  ];

  for (const pat of prefixPatterns) {
    text = text.replace(pat, '');
  }

  // ── Fake FPSC-style case numbers (e.g. F.4-123/2026-R, F.No.2-5/2025-FIA) ──
  // Strip leading fake case number references
  text = text.replace(/^\s*F\.\s*(?:No\.?\s*)?\d+-\d+\/\d{4}(?:-[A-Z]+)?\s*[,;:.\-]*\s*/i, '');
  // Strip trailing fake case number references
  text = text.replace(/\s*\(?\s*F\.\s*(?:No\.?\s*)?\d+-\d+\/\d{4}(?:-[A-Z]+)?\s*\)?\s*$/i, '');

  // ── Random standalone Q-ID or ID prefixes (e.g. "Q-12345:", "ID:abc123-def:") ──
  text = text.replace(/^\s*Q[-_]?\d{3,}\s*:\s*/i, '');
  text = text.replace(/^\s*ID\s*:\s*[a-f0-9-]{6,}\s*:\s*/i, '');

  // ── Trailing internal reference/notice tags ──
  text = text.replace(/\s*\(Ref:\s*[\d\w\s-]+\)\s*$/i, '');
  text = text.replace(/\s*\(Notice Ref:\s*[\d\w\s-]+\)\s*$/i, '');
  text = text.replace(/\s*\[Ref:\s*[\d\w\s-]+\]\s*$/i, '');

  // ── HTML extraction artifacts ──
  text = text.replace(/&#x20;/g, ' ')
             .replace(/&#32;/g, ' ')
             .replace(/&nbsp;/g, ' ')
             .replace(/&#160;/g, ' ')
             .replace(/&quot;/g, '"')
             .replace(/&#34;/g, '"')
             .replace(/&apos;/g, "'")
             .replace(/&#39;/g, "'")
             .replace(/&amp;/g, '&');

  // ── Strip benchmark and variant timestamps (e.g. "under benchmark 1792852456662?", "variant 1792852425602?") ──
  text = text.replace(/\s*(?:under\s+)?benchmark\s+\d{8,}\s*(\?|$)/i, '$1');
  text = text.replace(/\s*variant\s+\d{8,}\s*(\?|$)/i, '$1');

  // ── Strip random generated architecture tokens ──
  text = text.replace(/Under\s+virtual\s+memory\s+architecture\s+[a-z0-9]{8,14}\s*,?\s*/i, 'In virtual memory architecture, ');
  text = text.replace(/^Under\s+virtual\s+memory\s+architecture\s*,?\s*/i, 'In virtual memory architecture, ');

  // ── Strip random test subsystem tokens ──
  text = text.replace(/\s+subsystem\s+[a-z0-9]{8,14}\s*(\?|$)/i, '?$1');

  // ── Trailing fake case/notification references ──
  text = text.replace(/\s*\(Case\s+No\.?\s*[\d\w/-]+\)\s*$/i, '');
  text = text.replace(/\s*\(Notification\s+No\.?\s*[\d\w/-]+\)\s*$/i, '');

  // ── Clean multiple spaces and ensure proper question mark ──
  text = text.replace(/\s+/g, ' ').replace(/\s+\?/g, '?');
  if (/^(what|which|why|how|where|when|in\s+virtual\s+memory)/i.test(text) && !/[?]$/.test(text)) {
    text += '?';
  }

  return text.trim();
}

/**
 * Validates whether question contains fabricated, synthetic, or template-generated content.
 * Returns { invalid: true/false, reason: string } for detailed rejection logging.
 */
export function isFabricatedOrMalformed(rawText) {
  if (!rawText || typeof rawText !== 'string') return { invalid: true, reason: 'Empty or missing question text' };
  const text = rawText.trim();

  // Synthetic syllabus notice template check
  if (/According to official syllabus notice regarding.*which standard applies to/i.test(text)) {
    return {
      invalid: true,
      reason: 'Contains synthetic syllabus notice template with fabricated case/notice reference.'
    };
  }

  // Dangling colon before question mark check
  if (/\b(?:applies to|standard for)\s+[A-Za-z]+:\s*\?/i.test(text)) {
    return {
      invalid: true,
      reason: 'Question stem ends with dangling malformed keyword before question mark.'
    };
  }

  // Template-based fallback questions from deterministic generator
  // Pattern: "Regarding <Topic>, which principle applies to <Concept>?"
  if (/^Regarding\s+.+,\s+which\s+principle\s+applies\s+to\s+/i.test(text)) {
    return {
      invalid: true,
      reason: 'Template-generated fallback question ("Regarding X, which principle applies to Y?").'
    };
  }

  // Document ingestion template: "Under the curriculum syllabus for "<Title>"..."
  if (/^Under the curriculum syllabus for\s+"/i.test(text)) {
    return {
      invalid: true,
      reason: 'Document ingestion template question ("Under the curriculum syllabus for...").'
    };
  }

  // Short formulaic "which standard applies to X?" patterns (< 80 chars)
  if (/which\s+standard\s+applies\s+to\s+\w+\s*\?/i.test(text) && text.length < 80) {
    return {
      invalid: true,
      reason: 'Short formulaic template question with no real academic content.'
    };
  }

  // Fake FPSC case number combined with fake official notice or guidelines outline
  if (/F\.\s*(?:No\.?\s*)?\d+-\d+\/\d{4}-[A-Z]+/i.test(text) &&
      /(?:official\s+(?:syllabus|notice|notification|gazette)|as\s+outlined\s+in)/i.test(text)) {
    return {
      invalid: true,
      reason: 'Contains fake FPSC case number with fabricated official notice or syllabus claim.'
    };
  }

  // Unanchored page references (e.g. "Based on page 8...")
  if (/^Based on page\s+\d+,/i.test(text)) {
    return {
      invalid: true,
      reason: 'Unanchored page reference lacking standalone academic concept context ("Based on page...").'
    };
  }

  // Question too short to form a valid academic question
  if (text.length < 15) {
    return {
      invalid: true,
      reason: 'Question text must be at least 15 characters to form a valid academic question.'
    };
  }

  return { invalid: false };
}

/**
 * Normalizes question row from CSV or arbitrary JSON into canonical schema format.
 */
export function normalizeQuestionInput(rawRow) {
  const q = { ...rawRow };

  // 1. Question Text (Cleaned of accidental test/debugging prefixes)
  const rawQuestionText = (q.question_text || q.question || q.text || '').trim();
  const questionText = cleanQuestionText(rawQuestionText);

  // 2. Options Extraction
  let options = [];
  if (Array.isArray(q.options)) {
    options = q.options.map(o => String(o).trim());
  } else if (typeof q.options === 'string') {
    try {
      const parsed = JSON.parse(q.options);
      if (Array.isArray(parsed)) {
        options = parsed.map(o => String(o).trim());
      }
    } catch {
      // Pipe or semicolon separated options
      if (q.options.includes('|')) {
        options = q.options.split('|').map(o => o.trim());
      } else if (q.options.includes(';')) {
        options = q.options.split(';').map(o => o.trim());
      }
    }
  }

  // Fallback to option_a, option_b, option_c, option_d columns
  if (options.length === 0) {
    const a = q.option_a || q.option_1 || q.opt_a || q.a;
    const b = q.option_b || q.option_2 || q.opt_b || q.b;
    const c = q.option_c || q.option_3 || q.opt_c || q.c;
    const d = q.option_d || q.option_4 || q.opt_d || q.d;
    if (a && b && c && d) {
      options = [String(a).trim(), String(b).trim(), String(c).trim(), String(d).trim()];
    }
  }

  // Strip HTML entities and extra whitespace from options
  const cleanEntity = (str) => String(str || '')
    .replace(/&#x20;/g, ' ')
    .replace(/&#32;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  options = options.map(cleanEntity);

  // 3. Correct Option Normalization (0..3 where 0=A, 1=B, 2=C, 3=D)
  let correctOption = null;
  const rawCorrect = q.correct_option ?? q.correct_answer ?? q.answer ?? q.key;

  // First check if correct_answer_text or rawCorrect matches an option text directly
  const textCandidate = (q.correct_answer_text || (typeof rawCorrect === 'string' ? rawCorrect : '')).trim().toLowerCase();
  if (textCandidate && options.length > 0) {
    const matchIdx = options.findIndex(opt => opt.toLowerCase() === textCandidate);
    if (matchIdx >= 0) {
      correctOption = matchIdx;
    }
  }

  // If not resolved by text match, resolve by index or letter
  if (correctOption === null) {
    if (typeof rawCorrect === 'number' && rawCorrect >= 0 && rawCorrect <= 3) {
      correctOption = rawCorrect;
    } else if (typeof rawCorrect === 'string') {
      const trimmed = rawCorrect.trim().toUpperCase();
      if (['0', 'A'].includes(trimmed)) correctOption = 0;
      else if (['1', 'B'].includes(trimmed)) correctOption = 1;
      else if (['2', 'C'].includes(trimmed)) correctOption = 2;
      else if (['3', 'D'].includes(trimmed)) correctOption = 3;
      else if (['4'].includes(trimmed)) correctOption = 3;
    }
  }

  // 4. Difficulty Normalization
  let difficulty = 'Moderate';
  const rawDiff = (q.difficulty || '').trim().toLowerCase();
  if (rawDiff === 'easy') difficulty = 'Easy';
  else if (rawDiff === 'advanced' || rawDiff === 'hard') difficulty = 'Advanced';
  else if (rawDiff === 'moderate' || rawDiff === 'medium') difficulty = 'Moderate';

  // 5. Origin and Verification Status
  const origin = q.question_origin || (q.is_ai_generated ? 'ai_generated_practice' : 'reviewed_question');
  const verificationStatus = q.verification_status || 'practice_exercise';

  return {
    id: q.id || undefined,
    question_text: questionText,
    options,
    correct_option: correctOption,
    difficulty,
    subject: q.subject || q.subject_id || q.subject_name || '',
    subject_id: q.subject_id || null,
    exam: q.exam || q.exam_id || q.exam_slug || '',
    exam_id: q.exam_id || null,
    topic: q.topic || q.topic_title || q.syllabus_topic_id || '',
    syllabus_topic_id: q.syllabus_topic_id || null,
    explanation: cleanEntity(q.explanation || q.reason || ''),
    source_title: q.source_title || q.source || 'Curriculum Syllabus Reference',
    source_url: q.source_url || null,
    source_page: q.source_page || null,
    question_origin: origin,
    verification_status: verificationStatus,
    is_published: Boolean(q.is_published === true || q.is_published === 'true'),
  };
}

/**
 * Validates canonical question row.
 */
export function validateQuestion(q, context = { subjects: [], exams: [], topics: [] }) {
  const errors = [];

  if (!q.question_text || q.question_text.length < 10) {
    errors.push('Question text must be at least 10 characters long.');
  } else {
    const malformedCheck = isFabricatedOrMalformed(q.question_text);
    if (malformedCheck.invalid) {
      errors.push(`Invalid question: ${malformedCheck.reason}`);
    }
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    errors.push(`Question must have exactly 4 options. Found ${q.options?.length || 0}.`);
  } else if (q.options.some(opt => !opt || opt.trim().length === 0)) {
    errors.push('All 4 options must contain non-empty text.');
  }

  if (q.correct_option === null || q.correct_option === undefined || q.correct_option < 0 || q.correct_option > 3) {
    errors.push('A valid correct answer (index 0-3 or letter A-D) is required.');
  }

  if (!q.explanation || q.explanation.length < 5) {
    errors.push('A meaningful conceptual explanation (minimum 5 characters) is required.');
  }

  // Resolve Subject
  let resolvedSubjectId = q.subject_id;
  if (!resolvedSubjectId && q.subject && context.subjects?.length > 0) {
    const sLower = q.subject.toLowerCase();
    const match = context.subjects.find(s => s.id === q.subject || s.slug === sLower || s.name.toLowerCase() === sLower);
    if (match) resolvedSubjectId = match.id;
  }
  if (!resolvedSubjectId) {
    errors.push(`Valid subject is required (e.g. 'Computer Science', 'Pakistan Affairs'). Value: '${q.subject}'.`);
  }

  // Resolve Exam (Optional but validated if provided)
  let resolvedExamId = q.exam_id;
  if (!resolvedExamId && q.exam && context.exams?.length > 0) {
    const eLower = q.exam.toLowerCase();
    const match = context.exams.find(e => e.id === q.exam || e.slug === eLower || e.title.toLowerCase().includes(eLower));
    if (match) resolvedExamId = match.id;
  }

  // Resolve Syllabus Topic (Optional)
  let resolvedTopicId = q.syllabus_topic_id;
  if (!resolvedTopicId && q.topic && context.topics?.length > 0) {
    const tLower = q.topic.toLowerCase();
    const match = context.topics.find(t => t.id === q.topic || t.topic_title.toLowerCase().includes(tLower));
    if (match) resolvedTopicId = match.id;
  }

  return {
    valid: errors.length === 0,
    errors,
    resolved: {
      ...q,
      subject_id: resolvedSubjectId,
      exam_id: resolvedExamId,
      syllabus_topic_id: resolvedTopicId,
    }
  };
}

export const questionIngestionService = {
  /**
   * Loads reference tables (subjects, exams, topics) from Supabase.
   */
  async getReferenceContext() {
    if (!isSupabaseConfigured) {
      return { subjects: [], exams: [], topics: [] };
    }

    const [subRes, examRes, topicRes] = await Promise.all([
      supabase.from('subjects').select('id, name, slug'),
      supabase.from('exams').select('id, title, slug'),
      supabase.from('syllabus_topics').select('id, exam_id, subject_id, topic_title')
    ]);

    return {
      subjects: subRes.data || [],
      exams: examRes.data || [],
      topics: topicRes.data || [],
    };
  },

  /**
   * Ingests a batch of questions (JSON array or raw CSV string).
   * Ensures idempotency: duplicate questions are reported and skipped without inserting duplicates.
   *
   * @param {Array<Object>|string} input - JSON array or CSV text
   * @param {Object} options
   * @param {boolean} options.dryRun - If true, validates and checks duplicates without committing to DB
   * @param {boolean} options.publishByDefault - Whether approved automatically (default: false for draft review)
   * @returns {Promise<Object>} Ingestion report
   */
  async ingestQuestions(input, { dryRun = false, publishByDefault = false } = {}) {
    let rawItems = [];

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          rawItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rawItems = parseCsv(input);
        }
      } else {
        rawItems = parseCsv(input);
      }
    } else if (Array.isArray(input)) {
      rawItems = input;
    } else if (typeof input === 'object' && input !== null) {
      rawItems = [input];
    }

    if (rawItems.length === 0) {
      return {
        success: false,
        totalProcessed: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        insertedCount: 0,
        errors: [{ row: 0, message: 'No records found in input data.' }]
      };
    }

    // 1. Fetch DB reference context
    const context = await this.getReferenceContext();

    // 2. Validate all rows locally
    const validationResults = rawItems.map((raw, idx) => {
      const normalized = normalizeQuestionInput(raw);
      if (publishByDefault) {
        normalized.is_published = true;
      }
      const val = validateQuestion(normalized, context);
      return { index: idx, raw, normalized, val };
    });

    const invalidRows = validationResults.filter(r => !r.val.valid);
    const validRows = validationResults.filter(r => r.val.valid).map(r => r.val.resolved);

    if (dryRun) {
      return {
        success: invalidRows.length === 0,
        dryRun: true,
        totalProcessed: rawItems.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        duplicateCount: 0,
        insertedCount: 0,
        errors: invalidRows.map(r => ({ index: r.index, errors: r.val.errors }))
      };
    }

    // 3. Send valid rows to Supabase batch ingestion RPC
    let insertedCount = 0;
    let duplicateCount = 0;
    const rpcErrors = [];
    const insertedIds = [];

    if (isSupabaseConfigured && validRows.length > 0) {
      try {
        const { data, error } = await supabase.rpc('ingest_question_batch', {
          p_batch: validRows
        });

        if (error) throw error;

        insertedCount = data?.inserted_count || 0;
        duplicateCount = data?.duplicate_count || 0;
        if (Array.isArray(data?.errors)) {
          rpcErrors.push(...data.errors);
        }
        if (Array.isArray(data?.inserted_ids)) {
          insertedIds.push(...data.inserted_ids);
        }
      } catch (err) {
        console.error('Batch ingestion RPC failure:', err);
        rpcErrors.push({ error: err.message || 'RPC execution error' });
      }
    }

    const allErrors = [
      ...invalidRows.map(r => ({
        index: r.index,
        question_text: r.normalized.question_text?.slice(0, 50) || 'Missing text',
        errors: r.val.errors
      })),
      ...rpcErrors
    ];

    return {
      success: allErrors.length === 0 && insertedCount > 0,
      totalProcessed: rawItems.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCount,
      insertedCount,
      insertedIds,
      errors: allErrors
    };
  },

  /**
   * Approves or rejects a draft question.
   *
   * @param {string} questionId
   * @param {'approve'|'reject'} decision
   * @param {string|null} verificationStatus
   * @param {string|null} reviewerId
   * @returns {Promise<Object>}
   */
  async reviewQuestion(questionId, decision, verificationStatus = null, reviewerId = null) {
    if (!isSupabaseConfigured || !questionId) {
      return { success: false, error: 'Database not connected or missing question ID' };
    }

    const normalizedDecision = String(decision || '').toLowerCase().trim();
    if (normalizedDecision !== 'approve' && normalizedDecision !== 'reject') {
      return { success: false, error: 'Decision must be either "approve" or "reject"' };
    }

    const defaultStatus = normalizedDecision === 'approve' ? 'verified_citation' : 'community_submitted';
    const status = verificationStatus || defaultStatus;

    try {
      const { data, error } = await supabase.rpc('review_question', {
        p_question_id: questionId,
        p_decision: normalizedDecision,
        p_verification_status: status,
        p_reviewer_id: reviewerId || null,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Review question error:', err);
      return { success: false, error: err.message || 'Database update failed' };
    }
  },

  /**
   * Reviews multiple questions in a single atomic transaction.
   * Can approve/reject by specific question IDs or all pending questions.
   *
   * @param {Object} params
   * @param {Array<string>} [params.questionIds] - List of question IDs
   * @param {'approve'|'reject'} [params.decision='approve']
   * @param {string|null} [params.verificationStatus=null]
   * @param {string|null} [params.reviewerId=null]
   * @param {boolean} [params.allPending=false] - Whether to approve ALL pending questions in database
   * @returns {Promise<{success: boolean, affected_count?: number, error?: string}>}
   */
  async bulkReviewQuestions({
    questionIds = [],
    decision = 'approve',
    verificationStatus = null,
    reviewerId = null,
    allPending = false,
  }) {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Database not connected' };
    }

    const normalizedDecision = String(decision || '').toLowerCase().trim();
    if (normalizedDecision !== 'approve' && normalizedDecision !== 'reject') {
      return { success: false, error: 'Decision must be either "approve" or "reject"' };
    }

    const defaultStatus = normalizedDecision === 'approve' ? 'verified_citation' : 'community_submitted';
    const status = verificationStatus || defaultStatus;

    try {
      const { data, error } = await supabase.rpc('bulk_review_questions', {
        p_question_ids: Array.isArray(questionIds) && questionIds.length > 0 ? questionIds : null,
        p_decision: normalizedDecision,
        p_verification_status: status,
        p_reviewer_id: reviewerId || null,
        p_all_pending: Boolean(allPending),
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Bulk review questions error:', err);
      return { success: false, error: err.message || 'Database bulk update failed' };
    }
  },

  /**
   * Updates an existing MCQ record in Supabase (text, options, correct_option, explanation, subject, topic, difficulty, citations).
   * Preserves review status, published state, question ID, and other audit metadata.
   *
   * @param {string} questionId
   * @param {Object} updateData
   * @returns {Promise<{success: boolean, question?: Object, error?: string}>}
   */
  async updateQuestion(questionId, updateData) {
    if (!isSupabaseConfigured || !questionId) {
      return { success: false, error: 'Database not connected or missing question ID' };
    }

    // Client-side pre-validations
    const qText = (updateData.question_text || '').trim();
    if (!qText || qText.length < 10) {
      return { success: false, error: 'Question text must be at least 10 characters long.' };
    }

    const options = Array.isArray(updateData.options) ? updateData.options : [];
    if (options.length !== 4) {
      return { success: false, error: 'Question must have exactly 4 options (A, B, C, D).' };
    }
    if (options.some(opt => !opt || String(opt).trim().length === 0)) {
      return { success: false, error: 'All 4 options must contain non-empty text.' };
    }

    const correctOption = updateData.correct_option;
    if (correctOption === null || correctOption === undefined || correctOption < 0 || correctOption > 3) {
      return { success: false, error: 'Exactly one valid option (A, B, C, or D) must be marked correct.' };
    }

    const explanation = (updateData.explanation || '').trim();
    if (!explanation || explanation.length < 5) {
      return { success: false, error: 'A conceptual explanation of at least 5 characters is required.' };
    }

    try {
      const { data, error } = await supabase.rpc('update_mcq_question', {
        p_question_id: questionId,
        p_question_text: qText,
        p_options: options.map(o => String(o).trim()),
        p_correct_option: Number(correctOption),
        p_explanation: explanation,
        p_subject_id: updateData.subject_id || null,
        p_syllabus_topic_id: updateData.syllabus_topic_id || null,
        p_difficulty: updateData.difficulty || 'Moderate',
        p_source_title: updateData.source_title ? String(updateData.source_title).trim() : null,
        p_source_page: updateData.source_page ? String(updateData.source_page).trim() : null
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error updating MCQ question:', err);
      return { success: false, error: err.message || 'Database update failed' };
    }
  },

  /**
   * Retrieves high-level question bank metrics (published, pending, rejected, by exam, by subject, by difficulty).
   */
  async getMetrics() {
    if (!isSupabaseConfigured) {
      return { total_questions: 0, published_count: 0, pending_count: 0, rejected_count: 0 };
    }

    try {
      const { data, error } = await supabase.rpc('get_question_bank_metrics');
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching question bank metrics:', err);
      return null;
    }
  },

  /**
   * Retrieves draft/review questions for administrative review with optional status filter.
   *
   * @param {number} limit
   * @param {number} offset
   * @param {'pending'|'approved'|'rejected'|'all'} status
   * @returns {Promise<Array<Object>>}
   */
  async getPendingQuestions(limit = 50, offset = 0, status = 'pending') {
    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      const { data, error } = await supabase.rpc('get_pending_questions', {
        p_limit: limit,
        p_offset: offset,
        p_status: status,
      });
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      return list.map(item => ({
        ...item,
        question_text: cleanQuestionText(item.question_text || '')
      }));
    } catch (err) {
      console.error('Error fetching pending questions:', err);
      return [];
    }
  },

  /**
   * Parses and validates multiple CSV files in a single operation.
   * Rejects non-CSV files (.pdf, .json, .txt, etc.) with explicit reasons.
   * Performs schema normalization, reference resolution, and cross-file duplicate detection.
   *
   * @param {Array<File|{name: string, text: string}>} files
   * @returns {Promise<Object>} Aggregated preview and per-file validation details
   */
  async parseAndValidateCsvFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return {
        summary: {
          totalFiles: 0,
          validFilesCount: 0,
          rejectedFilesCount: 0,
          totalRows: 0,
          totalValid: 0,
          totalDuplicates: 0,
          totalRejected: 0,
          breakdown: { byExam: {}, bySubject: {}, byTopic: {}, byDifficulty: { Easy: 0, Moderate: 0, Advanced: 0 } }
        },
        files: []
      };
    }

    const context = await this.getReferenceContext();
    const seenHashes = new Set();
    const fileResults = [];

    const summary = {
      totalFiles: files.length,
      validFilesCount: 0,
      rejectedFilesCount: 0,
      totalRows: 0,
      totalValid: 0,
      totalDuplicates: 0,
      totalRejected: 0,
      breakdown: {
        byExam: {},
        bySubject: {},
        byTopic: {},
        byDifficulty: { Easy: 0, Moderate: 0, Advanced: 0 }
      }
    };

    for (const file of files) {
      const fileName = file.name || 'unnamed.csv';
      const isCsv = fileName.toLowerCase().endsWith('.csv');

      if (!isCsv) {
        summary.rejectedFilesCount += 1;
        fileResults.push({
          fileName,
          status: 'rejected_file',
          reason: 'Non-CSV file format. Only RFC 4180 CSV files are supported for question import.',
          totalRows: 0,
          validRows: [],
          duplicateCount: 0,
          rejectedCount: 0,
          errors: [{ row: 0, message: 'Unsupported file extension. Please select .csv files only.' }],
          sampleQuestions: []
        });
        continue;
      }

      let csvText = '';
      try {
        if (typeof file.text === 'function') {
          csvText = await file.text();
        } else if (typeof file.text === 'string') {
          csvText = file.text;
        } else if (file instanceof Blob) {
          csvText = await file.text();
        }
      } catch (err) {
        summary.rejectedFilesCount += 1;
        fileResults.push({
          fileName,
          status: 'error',
          reason: `Failed to read file: ${err.message}`,
          totalRows: 0,
          validRows: [],
          duplicateCount: 0,
          rejectedCount: 0,
          errors: [{ row: 0, message: `Read error: ${err.message}` }],
          sampleQuestions: []
        });
        continue;
      }

      const rawRows = parseCsv(csvText);
      if (rawRows.length === 0) {
        fileResults.push({
          fileName,
          status: 'empty',
          reason: 'File contains no data rows or invalid header structure.',
          totalRows: 0,
          validRows: [],
          duplicateCount: 0,
          rejectedCount: 0,
          errors: [{ row: 0, message: 'Empty CSV or missing header row.' }],
          sampleQuestions: []
        });
        continue;
      }

      const validRows = [];
      const fileErrors = [];
      let fileDups = 0;
      let fileRejections = 0;

      rawRows.forEach((raw, idx) => {
        const rowNum = idx + 2; // header is row 1
        const normalized = normalizeQuestionInput(raw);
        normalized.is_published = false; // Always import as draft
        normalized.verification_status = 'practice_exercise';

        const val = validateQuestion(normalized, context);
        if (!val.valid) {
          fileRejections += 1;
          fileErrors.push({
            row: rowNum,
            questionText: normalized.question_text?.slice(0, 60) || 'Missing text',
            messages: val.errors
          });
          return;
        }

        const resolved = val.resolved;
        const normStem = (resolved.question_text || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
        const hashPayload = `${resolved.subject_id || ''}::${normStem}`;

        if (seenHashes.has(hashPayload)) {
          fileDups += 1;
          return;
        }
        seenHashes.add(hashPayload);

        validRows.push(resolved);

        // Update breakdowns
        const examName = resolved.exam || 'General Curriculum';
        summary.breakdown.byExam[examName] = (summary.breakdown.byExam[examName] || 0) + 1;

        const subName = resolved.subject || 'General Subject';
        summary.breakdown.bySubject[subName] = (summary.breakdown.bySubject[subName] || 0) + 1;

        const topName = resolved.topic || 'General Topic';
        summary.breakdown.byTopic[topName] = (summary.breakdown.byTopic[topName] || 0) + 1;

        const diff = resolved.difficulty || 'Moderate';
        if (summary.breakdown.byDifficulty[diff] !== undefined) {
          summary.breakdown.byDifficulty[diff] += 1;
        } else {
          summary.breakdown.byDifficulty[diff] = 1;
        }
      });

      summary.totalRows += rawRows.length;
      summary.totalValid += validRows.length;
      summary.totalDuplicates += fileDups;
      summary.totalRejected += fileRejections;
      if (validRows.length > 0) {
        summary.validFilesCount += 1;
      }

      fileResults.push({
        fileName,
        status: fileErrors.length === 0 ? 'valid' : (validRows.length > 0 ? 'partial' : 'has_errors'),
        totalRows: rawRows.length,
        validRows,
        duplicateCount: fileDups,
        rejectedCount: fileRejections,
        errors: fileErrors,
        sampleQuestions: validRows.slice(0, 3)
      });
    }

    return {
      summary,
      files: fileResults
    };
  },

  /**
   * Ingests validated draft questions in sequential batches (e.g. 25 rows per batch)
   * to prevent timeouts and isolate failures.
   *
   * @param {Array<Object>} validQuestions
   * @param {Function} [onProgress] - Optional callback ({ completed, total, percentage, currentBatch, totalBatches })
   * @returns {Promise<Object>} Aggregated import results
   */
  async importBulkDrafts(validQuestions, onProgress = null) {
    if (!Array.isArray(validQuestions) || validQuestions.length === 0) {
      return {
        success: false,
        totalProcessed: 0,
        insertedCount: 0,
        duplicateCount: 0,
        insertedIds: [],
        errors: [{ message: 'No valid questions to import.' }]
      };
    }

    const BATCH_SIZE = 25;
    const total = validQuestions.length;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    let insertedCount = 0;
    let duplicateCount = 0;
    const insertedIds = [];
    const errors = [];

    for (let b = 0; b < totalBatches; b++) {
      const start = b * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, total);
      const batchChunk = validQuestions.slice(start, end).map(item => {
        const q = { ...item };
        q.question_text = cleanQuestionText(q.question_text);
        if (!Array.isArray(q.options) && q.option_a && q.option_b && q.option_c && q.option_d) {
          q.options = [String(q.option_a), String(q.option_b), String(q.option_c), String(q.option_d)];
        }
        q.is_published = false;
        q.verification_status = q.verification_status || 'practice_exercise';
        q.question_origin = q.question_origin || 'ai_generated_practice';
        return q;
      });

      try {
        const { data, error } = await supabase.rpc('ingest_question_batch', {
          p_batch: batchChunk
        });

        if (error) throw error;

        insertedCount += data?.inserted_count || 0;
        duplicateCount += data?.duplicate_count || 0;
        if (Array.isArray(data?.inserted_ids)) {
          insertedIds.push(...data.inserted_ids);
        }
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
          errors.push(...data.errors);
        }
      } catch (err) {
        console.error(`Batch ${b + 1}/${totalBatches} error:`, err);
        errors.push({ batch: b + 1, message: err.message || 'Batch ingestion error' });
      }

      if (typeof onProgress === 'function') {
        onProgress({
          completed: end,
          total,
          percentage: Math.round((end / total) * 100),
          currentBatch: b + 1,
          totalBatches
        });
      }
    }

    return {
      success: errors.length === 0 && insertedCount > 0,
      totalProcessed: total,
      insertedCount,
      duplicateCount,
      insertedIds,
      errors
    };
  }
};

