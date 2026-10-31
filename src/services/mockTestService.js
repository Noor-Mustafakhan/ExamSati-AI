import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { mockTestsList } from '../data/mockTests.js';
import { mockQuestions } from '../data/questions.js';

export const mockTestService = {
  async getMockTests() {
    if (!isSupabaseConfigured) {
      return { data: mockTestsList, isLive: false, error: null };
    }

    try {
      const { data, error } = await supabase
        .from('mock_tests')
        .select(`
          id,
          title,
          slug,
          description,
          duration_minutes,
          total_questions,
          negative_marking,
          exams:exam_id (commissions:commission_id (code))
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        return { data: mockTestsList, isLive: false, error: null };
      }

      const formatted = data.map(t => ({
        id: t.slug,
        dbId: t.id,
        title: t.title,
        description: t.description,
        durationMinutes: t.duration_minutes,
        totalQuestions: t.total_questions,
        negativeMarking: t.negative_marking,
        commission: t.exams?.commissions?.code || 'FPSC',
      }));

      return { data: formatted, isLive: true, error: null };
    } catch (err) {
      return { data: isSupabaseConfigured ? [] : mockTestsList, isLive: false, error: err.message };
    }
  },

  async getMockTestQuestions(mockTestDbId) {
    if (!isSupabaseConfigured || !mockTestDbId) {
      return { data: isSupabaseConfigured ? [] : mockQuestions.slice(0, 4), isLive: false, error: null };
    }

    try {
      const { data, error } = await supabase
        .from('mock_test_questions')
        .select(`
          question_order,
          questions:question_id (
            id,
            question_text,
            options,
            difficulty,
            explanation,
            source_title,
            subjects:subject_id (name)
          )
        `)
        .eq('mock_test_id', mockTestDbId)
        .order('question_order');

      if (error) throw error;

      const formatted = (data || []).map(row => ({
        id: row.questions.id,
        question: row.questions.question_text,
        options: row.questions.options,
        difficulty: row.questions.difficulty,
        subject: row.questions.subjects?.name || 'General Knowledge',
        explanation: row.questions.explanation,
        sourceTitle: row.questions.source_title,
      }));

      return { data: formatted, isLive: true, error: null };
    } catch (err) {
      console.error('getMockTestQuestions error:', err);
      return { data: [], isLive: true, error: err.message };
    }
  },

  // Start test attempt for authenticated user
  async startAttempt(mockTestDbId, userId) {
    if (!isSupabaseConfigured || !userId) {
      return { attemptId: `local-${Date.now()}`, isLive: false };
    }

    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .insert({
          user_id: userId,
          mock_test_id: mockTestDbId,
          status: 'in_progress',
        })
        .select('id')
        .single();

      if (error) throw error;
      return { attemptId: data.id, isLive: true };
    } catch (err) {
      console.error('Failed to start DB test attempt:', err);
      return { attemptId: `local-${Date.now()}`, isLive: false };
    }
  },

  // Submit test attempt for secure server-side scoring
  async submitAttempt(attemptId, answersPayload) {
    if (!isSupabaseConfigured || String(attemptId).startsWith('local-')) {
      // Local client fallback scoring
      return null;
    }

    try {
      // Format answersPayload into array of objects required by RPC:
      // [{"question_id": "...", "selected_option": 0, "is_marked_for_review": false}]
      let formattedAnswers = [];
      if (Array.isArray(answersPayload)) {
        formattedAnswers = answersPayload;
      } else if (answersPayload && typeof answersPayload === 'object') {
        formattedAnswers = Object.entries(answersPayload).map(([qId, val]) => ({
          question_id: qId,
          selected_option: typeof val === 'object' && val !== null ? val.selectedOption : (val !== undefined ? val : null),
          is_marked_for_review: typeof val === 'object' && val !== null ? Boolean(val.isMarked) : false,
        }));
      }

      const { data, error } = await supabase.rpc('submit_mock_test_attempt', {
        p_attempt_id: attemptId,
        p_answers: formattedAnswers,
      });

      if (error) throw error;
      return { data, isLive: true };
    } catch (err) {
      console.error('Server scoring error:', err);
      return null;
    }
  },

  // Fetch student's completed attempts
  async getUserAttempts(userId) {
    if (!isSupabaseConfigured || !userId) {
      try {
        const raw = localStorage.getItem('examsathi_test_attempts');
        return { data: raw ? JSON.parse(raw) : [], isLive: false };
      } catch {
        return { data: [], isLive: false };
      }
    }

    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .select(`
          id,
          started_at,
          submitted_at,
          status,
          total_questions,
          correct_answers,
          incorrect_answers,
          unanswered_questions,
          penalty_rate,
          score,
          accuracy,
          mock_tests:mock_test_id (title, slug)
        `)
        .eq('user_id', userId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map(att => ({
        id: att.id,
        testTitle: att.mock_tests?.title || 'Competitive Mock Test',
        date: new Date(att.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        score: att.score,
        totalMarks: att.total_questions,
        accuracy: att.accuracy,
        correctCount: att.correct_answers,
        incorrectCount: att.incorrect_answers,
        unansweredCount: att.unanswered_questions,
        penaltyRate: att.penalty_rate,
      }));

      return { data: formatted, isLive: true };
    } catch (err) {
      return { data: [], isLive: false, error: err.message };
    }
  }
};
