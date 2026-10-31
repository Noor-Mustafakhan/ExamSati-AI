import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { mockQuestions } from '../data/questions.js';
import { cleanQuestionText, isFabricatedOrMalformed } from './questionIngestionService.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Normalizes an option choice (number, letter A-D, or option text) into a 0-based integer index (0..3).
 */
function normalizeOptionIndex(selectedOption, options = []) {
  if (typeof selectedOption === 'number' && !isNaN(selectedOption)) {
    return Math.max(0, Math.min(3, Math.floor(selectedOption)));
  }

  if (typeof selectedOption === 'string') {
    const trimmed = selectedOption.trim();
    const upper = trimmed.toUpperCase();

    // Letter options 'A', 'B', 'C', 'D'
    if (['A', 'B', 'C', 'D'].includes(upper)) {
      return upper.charCodeAt(0) - 65;
    }

    // String integer '0', '1', '2', '3'
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
      return parsed;
    }

    // Exact or trimmed match in options array
    if (Array.isArray(options) && options.length > 0) {
      const matchIdx = options.findIndex(opt => opt && opt.trim().toLowerCase() === trimmed.toLowerCase());
      if (matchIdx >= 0) {
        return matchIdx;
      }
    }
  }

  return 0;
}

/**
 * Fisher-Yates array shuffle.
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const questionService = {
  /**
   * Retrieves practice questions filtered by exam profile, subject, topic, difficulty, and commission.
   *
   * @param {Object} options
   * @param {string} options.examId - Exam slug or UUID ('All' for all exams)
   * @param {string} options.subject - Subject name ('All Subjects' for all)
   * @param {string} options.topic - Topic title ('All Topics' for all)
   * @param {string} options.difficulty - Difficulty ('All', 'Easy', 'Moderate', 'Advanced')
   * @param {string} options.commission - Commission code ('All', 'FPSC', 'PPSC', etc.)
   * @param {number|null} options.limit - Max questions to return (configurable quiz length)
   * @param {boolean} options.shuffle - Whether to randomize questions
   * @returns {Promise<{ data: Array, isLive: boolean, totalAvailable: number, error: string|null }>}
   */
  async getQuestions({
    examId = 'All',
    subject = 'All Subjects',
    topic = 'All Topics',
    difficulty = 'All',
    commission = 'All',
    limit = null,
    shuffle = false,
  } = {}) {
    // Offline / Mock fallback when Supabase is not configured
    if (!isSupabaseConfigured) {
      let list = [...mockQuestions];

      if (examId && examId !== 'All') {
        list = list.filter(q => q.examId === examId);
      }
      if (subject && subject !== 'All Subjects') {
        list = list.filter(q => {
          if (!q.subject) return false;
          const s1 = q.subject.toLowerCase();
          const s2 = subject.toLowerCase();
          return s1 === s2 || s1.includes(s2) || s2.includes(s1);
        });
      }
      if (difficulty && difficulty !== 'All') {
        list = list.filter(q => q.difficulty === difficulty);
      }
      if (commission && commission !== 'All') {
        list = list.filter(q => (q.commission || 'FPSC').toLowerCase() === commission.toLowerCase());
      }
      if (topic && topic !== 'All Topics') {
        const normTopic = topic.trim().toLowerCase();
        list = list.filter(q => {
          if (q.topicId && q.topicId === topic) return true;
          if (!q.topic) return false;
          const qTopic = q.topic.trim().toLowerCase();
          return qTopic === normTopic || qTopic.includes(normTopic) || normTopic.includes(qTopic);
        });
      }

      // De-duplicate
      const seen = new Set();
      list = list.filter(q => {
        const key = `${q.id}-${(q.question || '').trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (shuffle) {
        list = shuffleArray(list);
      }
      if (limit && limit > 0) {
        list = list.slice(0, limit);
      }

      return { data: list, isLive: false, totalAvailable: list.length, error: null };
    }

    // Live Supabase query
    try {
      let query = supabase
        .from('questions')
        .select(`
          id,
          question_text,
          options,
          difficulty,
          question_origin,
          verification_status,
          explanation,
          source_title,
          source_url,
          created_at,
          subjects:subject_id (id, name, slug),
          exams:exam_id (id, title, slug, commissions:commission_id (id, code, name)),
          syllabus_topics:syllabus_topic_id (id, topic_title, section_title)
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (difficulty && difficulty !== 'All') {
        query = query.eq('difficulty', difficulty);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return { data: [], isLive: true, totalAvailable: 0, error: null };
      }

      // Map Supabase rows to consistent UI model (filtering out any malformed or bad quality entries)
      const formatted = data
        .filter(q => {
          if (!q.question_text) return false;
          if (isFabricatedOrMalformed(q.question_text).invalid) return false;
          const cleaned = cleanQuestionText(q.question_text);
          if (cleaned.length < 15) return false;
          return true;
        })
        .map(q => {
        const rawSubj = q.subjects?.name || 'General Knowledge';
        const normalizedSubj = rawSubj === 'English & Grammar' ? 'English' : rawSubj;
        const examSlug = q.exams?.slug || q.exam_id || null;
        const localMatch = mockQuestions.find(m => m.id === q.id || m.question === q.question_text);

        return {
          id: q.id,
          question: cleanQuestionText(q.question_text),
          options: Array.isArray(q.options) ? q.options : [],
          difficulty: q.difficulty,
          subject: normalizedSubj,
          subjectSlug: q.subjects?.slug || null,
          topic: q.syllabus_topics?.topic_title || 'General Topic',
          topicId: q.syllabus_topics?.id || null,
          exam: examSlug,
          examId: examSlug,
          examDbId: q.exams?.id || null,
          examTitle: q.exams?.title || 'Competitive Exam',
          commission: q.exams?.commissions?.code || 'FPSC',
          verificationStatus: q.verification_status,
          questionOrigin: q.question_origin,
          explanation: q.explanation,
          sourceTitle: q.source_title || 'Academic Reference Material',
          sourceUrl: q.source_url || null,
          createdAt: q.created_at,
          correctAnswer: localMatch?.correctAnswer ?? 1,
        };
      });

      // Apply in-memory filters for relationships and joins
      let result = formatted;

      // Filter by Exam Profile (slug or UUID)
      if (examId && examId !== 'All') {
        result = result.filter(q => q.examId === examId || q.examDbId === examId);
      }

      // Filter by Subject (with tolerant matching for aliases)
      if (subject && subject !== 'All Subjects') {
        result = result.filter(q => {
          if (!q.subject) return false;
          const s1 = q.subject.toLowerCase();
          const s2 = subject.toLowerCase();
          return s1 === s2 || s1.includes(s2) || s2.includes(s1);
        });
      }

      // Filter by Topic (matches topic title, slug, or topic UUID)
      if (topic && topic !== 'All Topics') {
        const normTopic = topic.trim().toLowerCase();
        result = result.filter(q => {
          if (q.topicId && q.topicId === topic) return true;
          if (!q.topic) return false;
          const qTopic = q.topic.trim().toLowerCase();
          return qTopic === normTopic || qTopic.includes(normTopic) || normTopic.includes(qTopic);
        });
      }

      // Filter by Commission
      if (commission && commission !== 'All') {
        result = result.filter(q => (q.commission || 'FPSC').toLowerCase() === commission.toLowerCase());
      }

      // De-duplicate questions by ID and normalized text
      const seen = new Set();
      result = result.filter(q => {
        const textKey = `${(q.subject || '')}::${(q.question || '').trim().toLowerCase()}`;
        if (seen.has(q.id) || seen.has(textKey)) {
          return false;
        }
        seen.add(q.id);
        seen.add(textKey);
        return true;
      });

      const totalAvailable = result.length;

      // Shuffle if requested (for varied practice tests)
      if (shuffle) {
        result = shuffleArray(result);
      }

      // Apply quiz length limit
      if (limit && limit > 0) {
        result = result.slice(0, limit);
      }

      return { data: result, isLive: true, totalAvailable, error: null };
    } catch (err) {
      console.error('Live question retrieval error:', err);
      // Transparently report error instead of silently swallowing and masking with demo data
      return { data: [], isLive: true, totalAvailable: 0, error: err.message || 'Database query error.' };
    }
  },

  /**
   * Securely verifies a single MCQ answer without exposing the private answer_keys table.
   *
   * @param {string} questionId
   * @param {number|string} selectedOption - 0-3, 'A'-'D', or option text
   * @returns {Promise<{ isCorrect: boolean, correctOption: number, explanation: string, sourceTitle: string }>}
   */
  async checkAnswer(questionId, selectedOption) {
    const isDbUuid = typeof questionId === 'string' && UUID_REGEX.test(questionId);

    // If not a UUID or if Supabase is offline, verify against local questions
    if (!isSupabaseConfigured || !isDbUuid) {
      const localQ = mockQuestions.find(q => q.id === questionId);
      if (!localQ) {
        return { isCorrect: false, correctOption: 0, explanation: '', sourceTitle: '' };
      }

      const optIdx = normalizeOptionIndex(selectedOption, localQ.options);
      const isCorrect = optIdx === localQ.correctAnswer;

      return {
        isCorrect,
        correctOption: localQ.correctAnswer,
        explanation: localQ.explanation || '',
        sourceTitle: localQ.sourceTitle || '',
      };
    }

    // Call secure PostgreSQL RPC in private schema
    try {
      const optionIndex = normalizeOptionIndex(selectedOption);

      const { data, error } = await supabase.rpc('check_mcq_answer', {
        p_question_id: questionId,
        p_selected_option: optionIndex,
      });

      if (error) throw error;

      return {
        isCorrect: Boolean(data?.is_correct),
        correctOption: data?.correct_option ?? 0,
        explanation: data?.explanation || '',
        sourceTitle: data?.source_title || '',
      };
    } catch (err) {
      console.error('Database answer verification error:', err);
      return {
        isCorrect: false,
        correctOption: 0,
        explanation: 'Unable to verify answer key from server.',
        sourceTitle: '',
      };
    }
  }
};
