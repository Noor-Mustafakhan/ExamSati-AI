/**
 * Student Progress and Mistakes Persistence Service
 *
 * ARCHITECTURAL NOTICE ON LOCALSTORAGE PERSISTENCE & LIMITATIONS:
 * 1. Scope: Browser localStorage is used as an immediate offline-friendly local buffer.
 * 2. Limitations:
 *    - Storage Quota: Subject to browser-enforced origin limits (~5MB).
 *    - Cache Eviction: Data is local to the current browser/device and will be lost
 *      if the user clears browsing data, runs in private/incognito mode, or switches devices.
 *    - Security: Local storage is unencrypted client-side state. Never store credentials or tokens here.
 *    - Multi-device Sync: Local storage cannot sync progress across multiple phones or laptops.
 * 3. Enterprise Migration Bridge:
 *    - When authenticated and Supabase credentials are configured, data bridges to backend tables
 *      (`test_attempts`, `student_mistakes`). Local storage is strictly the fallback client tier.
 */

const STORAGE_KEYS = {
  ATTEMPTS: 'examsathi_test_attempts',
  MISTAKES: 'examsathi_student_mistakes',
  QUESTION_LOGS: 'examsathi_question_logs',
  MASCOT_PREFS: 'examsathi_mascot_prefs',
  BOOKMARKS: 'examsathi_bookmarked_questions',
};

// Default ExamBuddy settings (Sound is OFF by default as required)
const DEFAULT_MASCOT_PREFS = {
  mode: 'funny', // 'normal' | 'funny' | 'gentle_roast'
  soundEnabled: false,
  animationsEnabled: true,
};

export const studentProgressService = {
  /**
   * Save a question mistake to the student's Mistake Notebook
   */
  recordMistake({ questionId, questionText, selectedOption, correctOption, explanation, subject, topic, options }) {
    try {
      const existing = this.getMistakes();
      const matchIndex = existing.findIndex((m) => m.questionId === questionId);

      if (matchIndex >= 0) {
        existing[matchIndex].timesFailed = (existing[matchIndex].timesFailed || 1) + 1;
        existing[matchIndex].lastAttemptDate = new Date().toISOString();
        existing[matchIndex].selectedOption = selectedOption;
        existing[matchIndex].mastered = false;
      } else {
        existing.unshift({
          questionId,
          questionText,
          selectedOption,
          correctOption,
          explanation,
          subject: subject || 'General',
          topic: topic || 'General',
          options: options || [],
          timesFailed: 1,
          mastered: false,
          savedAt: new Date().toISOString(),
          lastAttemptDate: new Date().toISOString(),
        });
      }

      localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(existing));
      return existing;
    } catch (e) {
      console.error('Failed to save mistake:', e);
      return [];
    }
  },

  /**
   * Retrieve all saved mistakes
   */
  getMistakes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MISTAKES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Mark a mistake as reviewed or mastered after successful re-practice
   */
  resolveMistake(questionId) {
    try {
      const mistakes = this.getMistakes();
      const updated = mistakes.map((m) =>
        m.questionId === questionId ? { ...m, mastered: true, resolvedAt: new Date().toISOString() } : m
      );
      localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(updated));
      return updated;
    } catch {
      return [];
    }
  },

  /**
   * Remove a mistake from notebook
   */
  removeMistake(questionId) {
    try {
      const mistakes = this.getMistakes();
      const filtered = mistakes.filter((m) => m.questionId !== questionId);
      localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(filtered));
      return filtered;
    } catch {
      return [];
    }
  },

  /**
   * Clear all resolved mistakes
   */
  clearMasteredMistakes() {
    try {
      const mistakes = this.getMistakes();
      const activeOnly = mistakes.filter((m) => !m.mastered);
      localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(activeOnly));
      return activeOnly;
    } catch {
      return [];
    }
  },

  /**
   * Log an individual question attempt (Practice or Test)
   */
  recordQuestionAttempt({ questionId, selectedOption, isCorrect, subject, topic }) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
      const logs = raw ? JSON.parse(raw) : [];

      logs.unshift({
        questionId,
        selectedOption,
        isCorrect,
        subject: subject || 'General',
        topic: topic || 'General',
        timestamp: new Date().toISOString(),
      });

      // Keep last 500 logs
      if (logs.length > 500) logs.pop();

      localStorage.setItem(STORAGE_KEYS.QUESTION_LOGS, JSON.stringify(logs));
      return logs;
    } catch {
      return [];
    }
  },

  /**
   * Get consecutive right / wrong streak for real-time ExamBuddy reactions
   */
  getRecentStreak() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
      const logs = raw ? JSON.parse(raw) : [];
      if (!logs.length) return { consecutiveCorrect: 0, consecutiveIncorrect: 0 };

      let consecutiveCorrect = 0;
      let consecutiveIncorrect = 0;

      for (const log of logs) {
        if (log.isCorrect) {
          if (consecutiveIncorrect > 0) break;
          consecutiveCorrect++;
        } else {
          if (consecutiveCorrect > 0) break;
          consecutiveIncorrect++;
        }
      }

      return { consecutiveCorrect, consecutiveIncorrect };
    } catch {
      return { consecutiveCorrect: 0, consecutiveIncorrect: 0 };
    }
  },

  /**
   * Save a mock test result
   */
  saveTestAttempt(attempt) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(attempt);
      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(list));
      return list;
    } catch {
      return [];
    }
  },

  /**
   * Retrieve test attempts
   */
  getTestAttempts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Get ExamBuddy preferences
   */
  getMascotPreferences() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MASCOT_PREFS);
      return raw ? { ...DEFAULT_MASCOT_PREFS, ...JSON.parse(raw) } : DEFAULT_MASCOT_PREFS;
    } catch {
      return DEFAULT_MASCOT_PREFS;
    }
  },

  /**
   * Update ExamBuddy preferences
   */
  saveMascotPreferences(newPrefs) {
    try {
      const current = this.getMascotPreferences();
      const updated = { ...current, ...newPrefs };
      localStorage.setItem(STORAGE_KEYS.MASCOT_PREFS, JSON.stringify(updated));
      return updated;
    } catch {
      return DEFAULT_MASCOT_PREFS;
    }
  },

  /**
   * Identify recurring topic-level struggle areas for targeted ExamBuddy coaching
   */
  getRepeatedTopicMistakes(threshold = 2) {
    try {
      const mistakes = this.getMistakes().filter((m) => !m.mastered);
      const topicCounts = {};

      for (const m of mistakes) {
        const topic = m.topic || 'General';
        topicCounts[topic] = (topicCounts[topic] || 0) + (m.timesFailed || 1);
      }

      const repeated = Object.entries(topicCounts)
        .filter(([, count]) => count >= threshold)
        .map(([topic, count]) => ({ topic, count }));

      return repeated;
    } catch {
      return [];
    }
  },

  /**
   * Get student progress for a specific topic based on actual attempt logs
   */
  getTopicProgress(topicTitle) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
      const logs = raw ? JSON.parse(raw) : [];
      if (!logs.length || !topicTitle) return null;

      const normTopic = topicTitle.trim().toLowerCase();
      const topicLogs = logs.filter(
        (l) => l.topic && l.topic.trim().toLowerCase() === normTopic
      );

      if (!topicLogs.length) return null;

      const totalAttempts = topicLogs.length;
      const correctAttempts = topicLogs.filter((l) => l.isCorrect).length;
      const uniqueQuestions = new Set(topicLogs.map((l) => l.questionId)).size;
      const accuracy = Math.round((correctAttempts / totalAttempts) * 100);

      return {
        attempts: totalAttempts,
        correct: correctAttempts,
        uniqueAttempted: uniqueQuestions,
        accuracy,
        completed: correctAttempts >= 3 || (accuracy >= 70 && totalAttempts >= 3),
      };
    } catch {
      return null;
    }
  },

  /**
   * Get student progress map for all topics from real attempt records
   */
  getAllTopicsProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
      const logs = raw ? JSON.parse(raw) : [];
      if (!logs.length) return {};

      const map = {};
      for (const log of logs) {
        if (!log.topic) continue;
        const norm = log.topic.trim().toLowerCase();
        if (!map[norm]) {
          map[norm] = { attempts: 0, correct: 0, questionIds: new Set() };
        }
        map[norm].attempts++;
        if (log.isCorrect) map[norm].correct++;
        if (log.questionId) map[norm].questionIds.add(log.questionId);
      }

      const result = {};
      for (const [norm, data] of Object.entries(map)) {
        const accuracy = Math.round((data.correct / data.attempts) * 100);
        result[norm] = {
          attempts: data.attempts,
          correct: data.correct,
          uniqueAttempted: data.questionIds.size,
          accuracy,
          completed: data.correct >= 3 || (accuracy >= 70 && data.attempts >= 3),
        };
      }
      return result;
    } catch {
      return {};
    }
  },
};

