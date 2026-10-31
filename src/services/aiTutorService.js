/**
 * Client Service for AI Study Buddy
 * Communicates with server-side /api/ai-tutor/chat with source grounding,
 * prompt defense, and graceful fallback.
 */


export const aiTutorService = {
  /**
   * Send a query to the source-based AI Study Buddy
   * @param {Object} options
   * @param {string} options.query - Student question
   * @param {Array} [options.conversationHistory] - Previous chat turns [{role, text}]
   * @param {string} [options.language] - 'auto' | 'english' | 'roman_urdu'
   * @param {number} [options.timeoutMs] - Request timeout in ms (default 20000ms)
   */
  async askTutor({ query, conversationHistory = [], language = 'auto', timeoutMs = 20000 }) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      throw new Error('Please enter a question before sending.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('/api/ai-tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          conversationHistory,
          language,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errorMsg = `Server returned error (${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error) errorMsg = errData.error;
        } catch {
          // keep default error message if non-json
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return {
        answer: data.answer,
        sources: data.sources || [],
        provider: data.provider || 'ExamSathi Grounded Academic Engine',
        retrievalTimestamp: data.retrievalTimestamp || new Date().toISOString(),
        isLive: true,
      };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out while contacting ExamSathi AI engine. Please retry.');
      }
      throw err;
    }
  },
};
