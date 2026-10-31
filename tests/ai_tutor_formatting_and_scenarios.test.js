import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { answerStudentQuery, normalizeMarkdown } from '../server/aiTutorEngine.js';
import { isSafeUrl } from '../src/utils/markdownUtils.js';

describe('AI Tutor Answer Quality & Markdown Formatting Verifications', () => {

  // Test Case 1: "What is the difference between RAM and ROM?"
  test('Test 1: "What is the difference between RAM and ROM?" answers directly, cleanly, and includes clean table', async () => {
    const res = await answerStudentQuery({ query: 'What is the difference between RAM and ROM?' });
    assert.ok(res.answer, 'Expected an answer');
    
    // Direct answer first
    assert.match(res.answer, /volatile/i, 'Mentions volatile nature of RAM');
    assert.match(res.answer, /non-volatile/i, 'Mentions non-volatile nature of ROM');
    
    // Check no escaped markdown pipes
    assert.doesNotMatch(res.answer, /\\\|/, 'Must not contain escaped pipes (\\|)');
    assert.doesNotMatch(res.answer, /\|\s*\\/, 'Must not contain broken table endings (|\\)');
    
    // Check table syntax
    assert.match(res.answer, /\|.*\|.*\|/, 'Must include valid markdown table');
    assert.match(res.answer, /\| :?---+:? \|/, 'Must include table header separator row');
    
    // No unsolicited exam vacancies
    assert.doesNotMatch(res.answer, /Advt\. No\.|vacanc(y|ies)|Customs Collectorate/i, 'Must not attach irrelevant exam claims to basic RAM vs ROM query');
  });

  // Test Case 2: "Explain the OSI model in simple English."
  test('Test 2: "Explain the OSI model in simple English." provides direct answer and numbered steps', async () => {
    const res = await answerStudentQuery({ query: 'Explain the OSI model in simple English.' });
    assert.ok(res.answer);
    
    // Direct answer first
    assert.match(res.answer, /7-layer/i, 'Mentions 7-layer architecture');
    assert.match(res.answer, /Application Layer/i, 'Mentions Application Layer');
    assert.match(res.answer, /Physical Layer/i, 'Mentions Physical Layer');
    
    // Numbered steps / layers
    assert.match(res.answer, /1\.\s+\*\*Application Layer/i, 'Uses clean numbered list for layers');
    
    // Practical memory tip
    assert.match(res.answer, /\*\*A\*\*ll \*\*P\*\*eople \*\*S\*\*eem/i, 'Includes memorable learning mnemonic');
  });

  // Test Case 3: "Give me five DBMS MCQs with correct answers and explanations."
  test('Test 3: "Give me five DBMS MCQs with correct answers and explanations." returns 5 distinct MCQs with verified answers', async () => {
    const res = await answerStudentQuery({ query: 'Give me five DBMS MCQs with correct answers and explanations.' });
    assert.ok(res.answer);
    
    // Verify 5 distinct questions
    assert.match(res.answer, /Q1:/, 'Must contain Q1');
    assert.match(res.answer, /Q2:/, 'Must contain Q2');
    assert.match(res.answer, /Q3:/, 'Must contain Q3');
    assert.match(res.answer, /Q4:/, 'Must contain Q4');
    assert.match(res.answer, /Q5:/, 'Must contain Q5');
    
    // Verify answers and explanations
    assert.match(res.answer, /\*\(Correct\)\*/, 'Must clearly mark correct option');
    assert.match(res.answer, /\*Explanation:/, 'Must provide clear pedagogical explanation');
  });

  // Test Case 4: Comparison table query
  test('Test 4: Comparison table query renders valid table syntax without escape artifacts', async () => {
    const rawTable = `| Feature | TCP | UDP |\n|---|---|---|\n| Connection | Connection-oriented | Connectionless |\n| Reliability | High (ACK) | Low (Best-effort) |`;
    const normalized = normalizeMarkdown(rawTable);
    
    assert.ok(normalized.includes('| Feature | TCP | UDP |'));
    assert.ok(!normalized.includes('\\|'));
    assert.ok(!normalized.includes('|\\'));
  });

  // Test Case 5: Numbered step-by-step procedure
  test('Test 5: Numbered step-by-step explanation formats cleanly', async () => {
    const procedure = `### How to Apply for FPSC Exams:\n1. Deposit challan fee in State Bank / NBP.\n2. Open official website.\n3. Submit online application form.`;
    const normalized = normalizeMarkdown(procedure);
    
    assert.match(normalized, /1\. Deposit/);
    assert.match(normalized, /2\. Open/);
    assert.match(normalized, /3\. Submit/);
  });

  // Test Case 6: Links and source citations
  test('Test 6: Verified query includes genuine source links and citations', async () => {
    const res = await answerStudentQuery({ query: 'What is the latest FPSC advertisement and closing date?' });
    assert.ok(res.answer);
    assert.ok(res.sources && res.sources.length > 0, 'Must include citations');
    
    for (const src of res.sources) {
      assert.ok(src.officialSourceUrl, 'Source must have URL');
      assert.ok(isSafeUrl(src.officialSourceUrl), 'URL must be safe');
      assert.match(src.officialSourceUrl, /^https?:\/\//, 'Must be valid HTTP/HTTPS link');
    }
  });

  // Test Case 7: Long answer containing headings, lists, table, and code
  test('Test 7: Long answer containing headings, lists, a table, and code normalizes cleanly', () => {
    const longContent = `
# Computer Science Fundamentals

### 1. Memory Hierarchy
Registers -> Cache -> RAM -> Secondary Storage

### 2. RAM vs ROM Comparison
| Type | Volatility | Access Time |\\
|---|---|---|\\
| RAM \\| Volatile \\| Fast |
| ROM \\| Non-Volatile \\| Moderate |

### 3. Example Code
\`\`\`c
#include <stdio.h>
int main() {
    // Escape character in code \\n should remain intact
    printf("RAM & ROM\\n");
    return 0;
}
\`\`\`
`.trim();

    const normalized = normalizeMarkdown(longContent);
    
    // Code block backslashes should be preserved
    assert.ok(normalized.includes('printf("RAM & ROM\\n");'), 'Preserves code block backslashes');
    // Table escaped pipes should be cleaned
    assert.ok(!normalized.includes('\\|'), 'Cleans table escaped pipes');
    assert.ok(!normalized.includes('|\\'), 'Cleans table trailing backslashes');
    assert.match(normalized, /\| Type \| Volatility \| Access Time \|/);
  });

  // Test Case 8: Malformed or empty inputs
  test('Test 8: Malformed or empty inputs are safely handled', async () => {
    // Empty query rejection
    await assert.rejects(
      async () => {
        await answerStudentQuery({ query: '' });
      },
      { message: /Query string is required/ }
    );

    await assert.rejects(
      async () => {
        await answerStudentQuery({ query: '    ' });
      },
      { message: /Query string is required/ }
    );

    // Malformed markdown strings in normalizer
    assert.equal(normalizeMarkdown(null), '');
    assert.equal(normalizeMarkdown(undefined), '');
    assert.equal(normalizeMarkdown(''), '');
    assert.equal(normalizeMarkdown(12345), '');
  });

});
