import { describe, it } from 'node:test';
import assert from 'node:assert';
import { answerStudentQuery } from '../server/aiTutorEngine.js';

describe('Chatbot Diagnosis & Repair: 8 Mandatory User Scenarios', () => {
  // Scenario 1: RAM vs ROM
  it('Scenario 1: "What is the difference between RAM and ROM?" returns accurate memory comparison, not negative marking rules', async () => {
    const result = await answerStudentQuery({
      query: 'What is the difference between RAM and ROM?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /RAM/i, 'Must discuss RAM');
    assert.match(result.answer, /ROM/i, 'Must discuss ROM');
    assert.match(result.answer, /volatile/i, 'Must highlight volatility');
    assert.doesNotMatch(result.answer, /negative marking/i, 'Must NOT confuse RAM vs ROM with negative marking rules');
    assert.doesNotMatch(result.answer, /Inspector Customs/i, 'Must NOT confuse RAM vs ROM with Inspector Customs job ad');
    assert.ok(result.sources && result.sources.length > 0, 'Must have curriculum source');
  });

  // Scenario 2: OSI Model
  it('Scenario 2: "Explain the OSI model for an FPSC Computer Science exam." returns 7-layer architecture, not job vacancies', async () => {
    const result = await answerStudentQuery({
      query: 'Explain the OSI model for an FPSC Computer Science exam.',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /OSI|Open Systems Interconnection/i, 'Must explain OSI model');
    assert.match(result.answer, /Application|Presentation|Session|Transport|Network|Data Link|Physical/i, 'Must mention OSI layers');
    assert.doesNotMatch(result.answer, /Inspector Customs/i, 'Must NOT return Inspector Customs job advertisement');
    assert.doesNotMatch(result.answer, /Appraising\/Valuation/i, 'Must NOT return valuation officer job ad');
    assert.ok(result.sources && result.sources.length > 0, 'Must cite FPSC Computer Science curriculum');
  });

  // Scenario 3: Five medium-level DBMS MCQs
  it('Scenario 3: "Give me five medium-level DBMS MCQs with answers and explanations." returns 5 distinct MCQs with verified answers', async () => {
    const result = await answerStudentQuery({
      query: 'Give me five medium-level DBMS MCQs with answers and explanations.',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /Q1:|Question 1/i, 'Must contain Q1 or Question 1');
    assert.match(result.answer, /Q2:|Question 2/i, 'Must contain Q2 or Question 2');
    assert.match(result.answer, /Q3:|Question 3/i, 'Must contain Q3 or Question 3');
    assert.match(result.answer, /Q4:|Question 4/i, 'Must contain Q4 or Question 4');
    assert.match(result.answer, /Q5:|Question 5/i, 'Must contain Q5 or Question 5');
    assert.match(result.answer, /Explanation/i, 'Must provide explanations');
    assert.match(result.answer, /Referential Integrity/i, 'Must cover DBMS referential integrity');
    assert.doesNotMatch(result.answer, /Inspector Customs \(BS-16\)/i, 'Must NOT return customs job ad');
  });

  // Scenario 4: Latest FPSC advertisement
  it('Scenario 4: "What is the latest FPSC advertisement?" returns official Consolidated Advt 01/2026 with official source link', async () => {
    const result = await answerStudentQuery({
      query: 'What is the latest FPSC advertisement?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /01\/2026/i, 'Must cite Consolidated Advertisement No. 01/2026');
    assert.ok(result.sources && result.sources.length > 0, 'Must include source link');
    assert.ok(result.sources[0].officialSourceUrl.includes('fpsc.gov.pk'), 'Source URL must be genuine fpsc.gov.pk');
  });

  // Scenario 5: Question outside platform scope
  it('Scenario 5: Out-of-scope query clearly declines non-exam requests without fabricating citations', async () => {
    const result = await answerStudentQuery({
      query: 'Can you give me the best recipe for baking chocolate brownies?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /competitive exam|FPSC|civil service|scope/i, 'Must clarify platform focus');
    assert.strictEqual(result.sources.length, 0, 'Must NOT fabricate FPSC sources for cooking recipes');
  });

  // Scenario 6: Empty message validation
  it('Scenario 6: Empty or whitespace query rejects with a descriptive validation error', async () => {
    await assert.rejects(
      async () => {
        await answerStudentQuery({ query: '   ', conversationHistory: [], language: 'auto' });
      },
      {
        message: /Query (string|parameter) is required/i,
      }
    );
  });

  // Scenario 7: Failed or unavailable AI API fallback
  it('Scenario 7: When external AI API is unavailable, grounded local engine responds reliably without crashing', async () => {
    // Calling without external key triggers the Grounded Academic Knowledge Engine
    const result = await answerStudentQuery({
      query: 'What is the difference between Article 2 and Article 2A of the Pakistan Constitution?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Must return answer');
    assert.match(result.answer, /Article 2/i, 'Must discuss Article 2');
    assert.match(result.answer, /Objectives Resolution/i, 'Must discuss Objectives Resolution');
    assert.ok(result.provider.includes('ExamSathi Grounded Academic Engine'), 'Must identify provider correctly');
  });

  // Scenario 8: Question with no reliable answer in documents
  it('Scenario 8: Question lacking reliable documentation explains uncertainty without hallucinating dates or percentages', async () => {
    const result = await answerStudentQuery({
      query: 'What is the exact passing percentage for the FPSC 2029 Assistant Director exam?',
      conversationHistory: [],
      language: 'auto',
    });

    assert.ok(result.answer, 'Answer must not be empty');
    assert.match(result.answer, /not published|verify|official notification|unconfirmed|2029/i, 'Must state uncertainty');
    assert.doesNotMatch(result.answer, /The exact passing percentage for 2029 is 73\.5%/i, 'Must not invent fake statistics');
  });
});
