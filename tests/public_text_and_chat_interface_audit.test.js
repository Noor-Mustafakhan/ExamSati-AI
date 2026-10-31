import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Public Text & Chat Interface Audit', () => {
  test('1. FPSCJobsPage does not display internal technical descriptions or unverified live server claims', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'FPSCJobsPage.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Forbidden internal technical policy texts
    assert.doesNotMatch(content, /Official Retrieval & Deadline Policy/i, 'Must not contain "Official Retrieval & Deadline Policy"');
    assert.doesNotMatch(content, /Connected to live FPSC server index/i, 'Must not claim "Connected to live FPSC server index"');
    assert.doesNotMatch(content, /Verifying deadline records in Asia\/Karachi timezone/i, 'Must not show internal timezone evaluation messages');
    assert.doesNotMatch(content, /Evaluating official deadlines/i, 'Must not show internal deadline evaluation messages');
    assert.doesNotMatch(content, /Manual Document Import/i, 'Must not expose developer document import UI on public jobs page');
  });

  test('2. LandingPage does not expose internal development stage labels or demo references', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'LandingPage.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.doesNotMatch(content, /Stage 3/i, 'Must not expose internal development milestones like "Stage 3"');
    assert.doesNotMatch(content, /Open tutor demo/i, 'Must not refer to student feature as "demo"');
    assert.doesNotMatch(content, /Connected to live FPSC server index/i);
  });

  test('3. ExamsPage does not make unsupported live recruitment drive claims', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'ExamsPage.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.doesNotMatch(content, /FPSC Live Recruitment Drive/i, 'Must not make unverified live recruitment claims');
  });

  test('4. DashboardLayout sidebar displays clean student sync status rather than database backend names', () => {
    const filePath = path.join(rootDir, 'src', 'components', 'layout', 'DashboardLayout.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.doesNotMatch(content, /Connected to Supabase/i, 'Must not expose backend infrastructure names');
    assert.doesNotMatch(content, /Local Preview Mode/i, 'Must not expose developer preview mode label');
    assert.match(content, /Account Synced/i, 'Must show clean student-facing status');
  });

  test('5. AITutorPage message composer is spacious, auto-growing, and preserves user text on error', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'AITutorPage.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // Policy banner removed
    assert.doesNotMatch(content, /Retrieved text is strictly sandboxed/i, 'Must not force students to read sandboxing policy banner');

    // Textarea ref and auto-grow logic present
    assert.match(content, /textareaRef/, 'Must have textareaRef for dynamic height calculation');
    assert.match(content, /Math\.min\(Math\.max\(scrollH, 56\), 160\)/, 'Must auto-grow with comfortable bounds between 56px and 160px');

    // Clear and comfortable placeholder
    assert.match(content, /placeholder="Ask a question about your exam preparation\.\.\."/, 'Must provide comfortable, concise placeholder');
    assert.doesNotMatch(content, /placeholder=".*\(Enter to send, Shift\+Enter for new line\)"/, 'Must not crowd instructions into placeholder');

    // Separate keyboard instructions
    assert.match(content, /Press Enter to send, Shift \+ Enter for new line/, 'Must provide clear helper text separate from placeholder');

    // Send button has comfortable sizing and is protected during isTyping
    assert.match(content, /disabled=\{!inputValue\.trim\(\) \|\| isTyping\}/, 'Must disable send action while typing or empty');

    // Failed query preservation
    assert.match(content, /setInputValue\(query\); \/\/ Preserve text on failure/, 'Must restore user text on request failure so question can be retried');
  });
});
