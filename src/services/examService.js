import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { mockExams } from '../data/exams.js';

export const examService = {
  async getExams({ commissionCode = 'All', category = 'All', searchQuery = '' } = {}) {
    if (!isSupabaseConfigured) {
      // Filter mock exams
      let result = [...mockExams];
      if (commissionCode !== 'All') {
        result = result.filter(e => e.commission.toLowerCase() === commissionCode.toLowerCase());
      }
      if (category !== 'All' && category !== 'All Categories') {
        result = result.filter(e => e.category === category);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.department?.toLowerCase().includes(q) ||
          e.commission.toLowerCase().includes(q)
        );
      }
      return { data: result, isLive: false, error: null };
    }

    try {
      let query = supabase
        .from('exams')
        .select(`
          id,
          title,
          slug,
          department,
          category,
          scale,
          format,
          negative_marking,
          description,
          content_status,
          is_published,
          commissions:commission_id (id, code, name, province)
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (category !== 'All' && category !== 'All Categories') {
        query = query.eq('category', category);
      }

      if (searchQuery.trim()) {
        query = query.ilike('title', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return { data: [], isLive: true, error: null };
      }

      // Format response to match existing UI structure
      const formatted = data.map(exam => ({
        id: exam.slug,
        dbId: exam.id,
        title: exam.title,
        commission: exam.commissions?.code || 'FPSC',
        department: exam.department || 'Federal Department',
        category: exam.category,
        scale: exam.scale,
        format: exam.format,
        negativeMarking: exam.negative_marking,
        summary: exam.description,
      }));

      // Filter by commission code client side if joined
      const filtered = commissionCode === 'All'
        ? formatted
        : formatted.filter(e => e.commission.toLowerCase() === commissionCode.toLowerCase());

      return { data: filtered, isLive: true, error: null };
    } catch (err) {
      return { data: mockExams, isLive: false, error: err.message };
    }
  },

  async getExamBySlug(slug) {
    if (!isSupabaseConfigured) {
      const found = mockExams.find(e => e.id === slug) || mockExams[0];
      return { data: found, isLive: false, error: null };
    }

    try {
      const { data, error } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          slug,
          department,
          category,
          scale,
          format,
          negative_marking,
          description,
          content_status,
          commissions:commission_id (id, code, name, province),
          syllabus_topics (
            id,
            section_title,
            topic_title,
            description,
            source_title,
            verification_status,
            display_order
          )
        `)
        .eq('slug', slug)
        .single();

      if (error) throw error;
      if (!data) return { data: null, isLive: true, error: 'Exam not found' };

      // Group syllabus topics by section
      const sectionsMap = {};
      (data.syllabus_topics || []).forEach(top => {
        const sec = top.section_title || 'General Syllabus';
        if (!sectionsMap[sec]) {
          sectionsMap[sec] = { part: sec, topics: [] };
        }
        sectionsMap[sec].topics.push(top.topic_title);
      });

      const formatted = {
        id: data.slug,
        dbId: data.id,
        title: data.title,
        commission: data.commissions?.code || 'FPSC',
        department: data.department || 'Government Department',
        category: data.category,
        scale: data.scale,
        format: data.format,
        negativeMarking: data.negative_marking,
        summary: data.description,
        syllabus: Object.values(sectionsMap),
        overview: {
          totalMarks: 100,
          totalTime: '100 Minutes',
          qualifyingScore: '50% (General Merit)',
          testMedium: 'English'
        }
      };

      return { data: formatted, isLive: true, error: null };
    } catch (err) {
      const fallback = mockExams.find(e => e.id === slug) || mockExams[0];
      return { data: fallback, isLive: false, error: err.message };
    }
  },

  /**
   * Retrieves granular, syllabus-structured subject and topic breakdown with real database question counts
   *
   * @param {string} slug - Exam profile slug (e.g. 'fpsc-lecturer-cs-2026')
   * @returns {Promise<{ data: Object|null, isLive: boolean, error: string|null }>}
   */
  async getExamSyllabusBreakdown(slug) {
    if (!isSupabaseConfigured) {
      return { data: null, isLive: false, error: 'Database connection offline' };
    }

    try {
      const { data, error } = await supabase.rpc('get_exam_syllabus_breakdown', {
        p_exam_slug: slug,
      });

      if (error) throw error;
      return { data, isLive: true, error: null };
    } catch (err) {
      console.error(`Error fetching syllabus breakdown for ${slug}:`, err);
      return { data: null, isLive: true, error: err.message || 'Failed to retrieve syllabus outline' };
    }
  },
};

