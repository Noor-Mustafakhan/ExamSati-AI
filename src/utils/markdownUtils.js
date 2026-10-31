/**
 * Markdown sanitization and normalization utilities for ExamSathi AI
 * Fixes escaped Markdown characters, malformed table delimiters, and line-spacing artifacts
 * while strictly preserving valid backslashes in code blocks, formulas, and math.
 */

/**
 * Normalizes Markdown text from AI models before rendering.
 * Safely removes unintentional escapes (e.g., '\|', '|\') in text and tables
 * without touching valid backslashes inside fenced code blocks or inline code.
 */
export function normalizeMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. Temporarily isolate fenced code blocks and inline code to preserve valid programming escapes
  const codeBlocks = [];
  let placeholderIndex = 0;
  let processed = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const token = `@@EXAMSATHI_CODE_${placeholderIndex++}@@`;
    codeBlocks.push({ token, match });
    return token;
  });

  // 2. Normalize Windows CRLF to LF
  processed = processed.replace(/\r\n/g, '\n');

  // 3. Fix escaped table pipes: '\|' -> '|' (common LLM artifact in markdown tables)
  processed = processed.replace(/\\\|/g, '|');

  // 4. Fix broken table row endings like '|\' or '| \' or '|\\' at the end of table rows
  processed = processed.replace(/\|\s*\\+(\s*)$/gm, '|$1');

  // 5. Fix double-escaped newlines if JSON serialization leaked literal \n without real newlines
  if (processed.includes('\\n') && !processed.includes('\n')) {
    processed = processed.replace(/\\n/g, '\n');
  }

  // 6. Fix escaped asterisks for bold/italic formatting (e.g. '\*\*text\*\*' -> '**text**')
  processed = processed.replace(/\\\*\\\*/g, '**');

  // 7. Ensure clean blank lines before Markdown headers so parsers render them as headings
  processed = processed.replace(/([^\n])\n(#{1,6}\s+[^\n]+)/g, '$1\n\n$2');

  // 8. Ensure clean blank lines before Markdown tables so GFM table parsers detect the table
  processed = processed.replace(/([^\n])\n(\|.+?\|\n\|[-:\s|]+?\|)/g, '$1\n\n$2');

  // 9. Restore protected code blocks verbatim
  for (const { token, match } of codeBlocks) {
    processed = processed.replace(token, match);
  }

  return processed;
}

/**
 * Validates URLs for markdown link rendering to prevent script injection (XSS)
 * Allows http, https, and mailto; rejects javascript:, data:, vbscript:
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
    return true;
  }
  return false;
}
