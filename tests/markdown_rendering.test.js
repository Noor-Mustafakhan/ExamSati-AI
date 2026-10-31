import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarkdown, isSafeUrl } from '../src/utils/markdownUtils.js';

describe('Markdown Sanitization & Rendering Normalizer Audit', () => {
  it('fixes escaped table pipes (\\|) in Markdown table rows', () => {
    const raw = '| Header 1 \\| Header 2 |\n| --- \\| --- |\n| Val 1 \\| Val 2 |';
    const cleaned = normalizeMarkdown(raw);

    assert.equal(cleaned.includes('\\|'), false, 'Must remove backslash before table pipe');
    assert.ok(cleaned.includes('| Header 1 | Header 2 |'), 'Must produce clean valid table syntax');
  });

  it('fixes broken trailing backslashes at row ends (|\\ or | \\)', () => {
    const raw = '| Col 1 | Col 2 |\\\n| --- | --- |  \\\n| Val 1 | Val 2 |';
    const cleaned = normalizeMarkdown(raw);

    assert.equal(cleaned.includes('|\\'), false, 'Must remove broken trailing backslash after pipe');
    assert.ok(cleaned.includes('| Col 1 | Col 2 |'));
  });

  it('preserves valid backslashes inside fenced code blocks', () => {
    const codeWithBackslashes = '```javascript\nconst regex = /\\d+\\|[a-z]/;\nconsole.log("\\n");\n```';
    const cleaned = normalizeMarkdown(codeWithBackslashes);

    assert.ok(cleaned.includes('/\\d+\\|[a-z]/'), 'Must preserve regex backslash and escaped pipe in code');
    assert.ok(cleaned.includes('"\\n"'), 'Must preserve literal \\n in code');
  });

  it('preserves valid backslashes inside inline code', () => {
    const inlineCode = 'Use the pattern `\\d+` for matching digits.';
    const cleaned = normalizeMarkdown(inlineCode);

    assert.ok(cleaned.includes('`\\d+`'), 'Must preserve backslash in inline code');
  });

  it('ensures clean spacing before Markdown headers and tables', () => {
    const raw = 'Paragraph text\n### Heading 3\nMore text\n| A | B |\n|---|---|\n| 1 | 2 |';
    const cleaned = normalizeMarkdown(raw);

    assert.ok(cleaned.includes('Paragraph text\n\n### Heading 3'));
    assert.ok(cleaned.includes('More text\n\n| A | B |'));
  });

  it('validates safe URLs and rejects malicious script/data protocols', () => {
    assert.equal(isSafeUrl('https://www.fpsc.gov.pk'), true);
    assert.equal(isSafeUrl('http://example.com/syllabus'), true);
    assert.equal(isSafeUrl('mailto:candidate@examsathi.pk'), true);

    // XSS / Malicious protocols must be rejected
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(null), false);
  });
});
