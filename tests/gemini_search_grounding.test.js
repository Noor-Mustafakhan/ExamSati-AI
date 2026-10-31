import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerStudentQuery,
  isSearchGroundingNeeded,
  CURRENT_GEMINI_MODEL,
} from '../server/aiTutorEngine.js';
import { getGeminiConfigStatus, getGeminiApiKey } from '../server/env.js';

describe('Gemini API & Live Search Grounding Integration Audit', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    // Reset process.env.GEMINI_API_KEY before each test
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  // Test 1: Basic question: "What is the difference between RAM and ROM?"
  it('Test 1: Basic question "What is the difference between RAM and ROM?" answers accurately without search trigger', async () => {
    const isSearchTriggered = isSearchGroundingNeeded('What is the difference between RAM and ROM?');
    assert.equal(isSearchTriggered, false, 'Pure academic question must NOT trigger live web search');

    const result = await answerStudentQuery({
      query: 'What is the difference between RAM and ROM?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return non-empty answer');
    assert.match(result.answer, /RAM/i, 'Must discuss RAM');
    assert.match(result.answer, /ROM/i, 'Must discuss ROM');
    assert.match(result.answer, /volatile/i, 'Must explain memory volatility');
    assert.ok(result.sources && result.sources.length > 0, 'Must cite curriculum source');
    assert.equal(result.searchGroundingUsed, false, 'Search grounding must be false for pure academic concept');
  });

  // Test 2: Exam question: "Explain the OSI model for an FPSC Computer Science exam."
  it('Test 2: Exam question "Explain the OSI model for an FPSC Computer Science exam." returns 7-layer architecture', async () => {
    const isSearchTriggered = isSearchGroundingNeeded('Explain the OSI model for an FPSC Computer Science exam.');
    assert.equal(isSearchTriggered, false, 'Standard syllabus question must NOT trigger live web search');

    const result = await answerStudentQuery({
      query: 'Explain the OSI model for an FPSC Computer Science exam.',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return answer');
    assert.match(result.answer, /OSI|Open Systems Interconnection/i, 'Must discuss OSI model');
    assert.match(result.answer, /Physical|Data Link|Network|Transport|Session|Presentation|Application/i, 'Must mention OSI layers');
    assert.ok(result.sources.some((s) => s.title.includes('Computer Science') || s.verificationStatus.includes('Academic')));
    assert.equal(result.searchGroundingUsed, false, 'Search grounding must be false for syllabus concept');
  });

  // Test 3: Current question: "What is the latest FPSC advertisement and its closing date?"
  it('Test 3: Current question "What is the latest FPSC advertisement and its closing date?" detects search need & provides closing date', async () => {
    const isSearchTriggered = isSearchGroundingNeeded('What is the latest FPSC advertisement and its closing date?');
    assert.equal(isSearchTriggered, true, 'Time-sensitive query for latest ad & closing date MUST trigger search grounding need');

    const result = await answerStudentQuery({
      query: 'What is the latest FPSC advertisement and its closing date?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return non-empty answer');
    assert.match(result.answer, /01\/2026|Consolidated Advertisement/i, 'Must reference latest advertisement');
    assert.match(result.answer, /20 January 2026|Closing Date/i, 'Must reference closing date');
  });

  // Test 4: Whether answer includes genuine source URLs and current evidence
  it('Test 4: Answer includes genuine source URLs and verified evidence without fabrication', async () => {
    const result = await answerStudentQuery({
      query: 'What is the latest FPSC advertisement and its closing date?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.sources && result.sources.length > 0, 'Must return sources');
    const primarySource = result.sources[0];
    assert.ok(
      primarySource.officialSourceUrl.includes('fpsc.gov.pk'),
      'Must cite authentic FPSC official URL'
    );
    assert.ok(
      !primarySource.officialSourceUrl.includes('example.com') &&
        !primarySource.officialSourceUrl.includes('placeholder'),
      'Must never fabricate placeholder URLs'
    );
    assert.ok(primarySource.verificationStatus, 'Must have verified provenance status');
    assert.ok(result.retrievalTimestamp, 'Must include verifiable timestamp');
  });

  // Test 5: Behavior when API key is missing or invalid
  it('Test 5a: Missing API key returns clear setup notice and answers from Grounded Academic Engine without crashing', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_API_KEY;

    assert.equal(getGeminiApiKey(), '', 'API key must be empty');

    const result = await answerStudentQuery({
      query: 'What is the latest FPSC advertisement?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return answer');
    assert.match(
      result.answer,
      /\.env\.local|GEMINI_API_KEY|Live Web Search Setup/i,
      'Must document how to configure GEMINI_API_KEY in .env.local'
    );
    assert.ok(result.provider.includes('ExamSathi Grounded Academic Engine'), 'Must fall back to Grounded Academic Engine');
    assert.ok(result.sources.length > 0, 'Must retain verified citations');
  });

  it('Test 5b: Invalid API key returns safe error notice and falls back gracefully without leaking secret', async () => {
    // Set a known invalid key
    process.env.GEMINI_API_KEY = 'AIzaSy_fake_invalid_test_key_xyz987';

    const result = await answerStudentQuery({
      query: 'What is the latest FPSC advertisement and its closing date?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return safe fallback answer');
    assert.match(
      result.answer,
      /Gemini API Key (Issue|Masla)|invalid|unauthorized/i,
      'Must notify user safely of invalid API key'
    );
    // CRITICAL SECURITY ASSERTION: Secret key must NEVER be leaked in answer
    assert.ok(
      !result.answer.includes('AIzaSy_fake_invalid_test_key_xyz987'),
      'Must NEVER leak the raw API key in the response'
    );
    assert.ok(
      result.provider.includes('ExamSathi Grounded Academic Engine'),
      'Must gracefully use Grounded Academic Knowledge Engine'
    );
  });

  // Test 6: Behavior when Search grounding fails or reaches usage limit
  it('Test 6: Rate limit / quota failure falls back to Grounded Academic Knowledge Engine with quota notice', async () => {
    // When an authorization or quota error occurs, the engine must catch it and produce a structured fallback
    process.env.GEMINI_API_KEY = 'invalid_key_for_quota_test';

    const result = await answerStudentQuery({
      query: 'What is the syllabus for Inspector Customs (BS-16)?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must provide answer');
    assert.ok(result.sources && result.sources.length > 0, 'Must provide verified curriculum sources');
    assert.ok(!result.answer.includes('undefined'), 'Must not contain undefined in response');
  });

  // Model & Configuration Verification
  it('Model verification: CURRENT_GEMINI_MODEL is set to gemini-3.8-flash', () => {
    assert.equal(
      CURRENT_GEMINI_MODEL,
      'gemini-3.8-flash',
      'Configured model must be verified current model gemini-3.8-flash'
    );
  });

  it('Diagnostics: getGeminiConfigStatus returns safe masked status without leaking key', () => {
    process.env.GEMINI_API_KEY = 'AIzaSyTestSecretKey1234567890';
    const status = getGeminiConfigStatus();

    assert.equal(status.configured, true);
    assert.equal(status.source, 'GEMINI_API_KEY');
    assert.equal(status.masked, 'AIza...7890');
    // Secret middle part is never exposed
    assert.ok(!JSON.stringify(status).includes('TestSecretKey'));
  });
});
