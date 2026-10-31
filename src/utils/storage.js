// Utility for managing local demo state with fallbacks

const STORAGE_KEYS = {
  BOOKMARKS: 'examsathi_bookmarked_questions',
  SAVED_EXAMS: 'examsathi_saved_exams',
  TEST_ATTEMPTS: 'examsathi_test_attempts',
  REPORTED_QUESTIONS: 'examsathi_reported_questions',
  USER_PREFERENCES: 'examsathi_user_prefs'
};

export const getBookmarkedQuestionIds = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    return raw ? JSON.parse(raw) : ['mcq-pa-01', 'mcq-pa-03'];
  } catch {
    return ['mcq-pa-01', 'mcq-pa-03'];
  }
};

export const toggleBookmarkQuestion = (questionId) => {
  try {
    const current = getBookmarkedQuestionIds();
    let updated;
    if (current.includes(questionId)) {
      updated = current.filter(id => id !== questionId);
    } else {
      updated = [...current, questionId];
    }
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Storage error:', e);
    return [];
  }
};

export const getSavedExamIds = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_EXAMS);
    return raw ? JSON.parse(raw) : ['fpsc-inspector-customs-2026', 'ppsc-tehsildar-2026'];
  } catch {
    return ['fpsc-inspector-customs-2026', 'ppsc-tehsildar-2026'];
  }
};

export const toggleSaveExam = (examId) => {
  try {
    const current = getSavedExamIds();
    let updated;
    if (current.includes(examId)) {
      updated = current.filter(id => id !== examId);
    } else {
      updated = [...current, examId];
    }
    localStorage.setItem(STORAGE_KEYS.SAVED_EXAMS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Storage error:', e);
    return [];
  }
};

export const saveTestAttempt = (attempt) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEST_ATTEMPTS);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(attempt);
    localStorage.setItem(STORAGE_KEYS.TEST_ATTEMPTS, JSON.stringify(list));
    return list;
  } catch (e) {
    console.error('Storage error:', e);
    return [];
  }
};

export const reportQuestion = (report) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REPORTED_QUESTIONS);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ ...report, date: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEYS.REPORTED_QUESTIONS, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};
