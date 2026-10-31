import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { getBookmarkedQuestionIds, toggleBookmarkQuestion } from '../utils/storage.js';

export const savedQuestionService = {
  /**
   * Get list of saved question IDs for a given user.
   * If logged in and Supabase is configured, retrieves from saved_questions table.
   * Otherwise falls back to localStorage.
   */
  async getSavedIds(userId) {
    return this.getSavedQuestionIds(userId);
  },

  async getSavedQuestionIds(userId) {
    if (isSupabaseConfigured && userId) {
      try {
        const { data, error } = await supabase
          .from('saved_questions')
          .select('question_id')
          .eq('user_id', userId);

        if (!error && data) {
          return data.map(item => item.question_id);
        }
      } catch (err) {
        console.warn('Supabase fetch bookmarks failed, falling back to local storage:', err);
      }
    }
    return getBookmarkedQuestionIds();
  },

  /**
   * Toggle a bookmark status.
   * Supports both toggleSave(questionId, userId) and toggleSave(userId, questionId).
   * Always updates local storage as a mirror/offline fallback.
   */
  async toggleSave(arg1, arg2) {
    // Resolve questionId and userId regardless of argument order
    let questionId, userId;
    if (typeof arg1 === 'string' && (arg1.startsWith('mcq-') || arg1.startsWith('q-') || !arg2)) {
      questionId = arg1;
      userId = arg2;
    } else if (typeof arg2 === 'string' && (arg2.startsWith('mcq-') || arg2.startsWith('q-'))) {
      userId = arg1;
      questionId = arg2;
    } else {
      questionId = arg1 || arg2;
      userId = (arg1 === questionId ? arg2 : arg1);
    }

    if (!questionId) {
      const current = getBookmarkedQuestionIds();
      return { isSaved: false, savedIds: current, updatedList: current };
    }

    // Update local mirror
    const newLocalList = toggleBookmarkQuestion(questionId);
    const isNowSaved = newLocalList.includes(questionId);

    if (isSupabaseConfigured && userId) {
      try {
        if (isNowSaved) {
          // Insert bookmark
          const { error } = await supabase
            .from('saved_questions')
            .upsert(
              { user_id: userId, question_id: questionId },
              { onConflict: 'user_id,question_id' }
            );
          if (error) {
            console.warn('Error saving bookmark to Supabase:', error.message);
          }
        } else {
          // Delete bookmark
          const { error } = await supabase
            .from('saved_questions')
            .delete()
            .eq('user_id', userId)
            .eq('question_id', questionId);
          if (error) {
            console.warn('Error removing bookmark from Supabase:', error.message);
          }
        }
      } catch (err) {
        console.warn('Bookmark sync operation failed:', err);
      }
    }

    return {
      isSaved: isNowSaved,
      savedIds: newLocalList,
      updatedList: newLocalList,
    };
  }
};

