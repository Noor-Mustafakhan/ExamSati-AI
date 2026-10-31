import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerStudentQuery,
  classifyQueryIntent,
  isDocumentRelevant,
} from '../server/aiTutorEngine.js';
import { importManualDocument } from '../server/fpscRetrievalService.js';

describe('Query Intent Classification, Document Relevance & Unrelated Topic Defense', () => {

  // Scenario A: "Windows MCQs"
  test('Scenario A: "Windows MCQs" generates Windows-related MCQs, NOT recruitment advertisements', async () => {
    const res = await answerStudentQuery({ query: 'Windows MCQs' });
    assert.ok(res.answer, 'Expected response');

    // Must be classified as practice_mcqs with subtopic windows
    const intent = classifyQueryIntent('Windows MCQs');
    assert.equal(intent.type, 'practice_mcqs');
    assert.equal(intent.subtopic, 'windows');

    // Must contain Windows concepts
    assert.match(res.answer, /NTFS|Task Manager|File Explorer|User Account Control|pagefile/i);
    assert.match(res.answer, /Q1:|Q2:|Q3:|Q4:|Q5:|\b1\.\s|\b2\.\s|Question 1/i);
    assert.match(res.answer, /\*\(Correct\)\*|Correct Answer/i);

    // CRITICAL: Must NOT contain FPSC recruitment advertisement details
    assert.doesNotMatch(res.answer, /Inspector Customs/i, 'Must not contain Inspector Customs advertisement');
    assert.doesNotMatch(res.answer, /Assistant Director.*FIA/i, 'Must not contain FIA advertisement');
    assert.doesNotMatch(res.answer, /Consolidated Advertisement/i, 'Must not contain Consolidated Advertisement');
    assert.doesNotMatch(res.answer, /185 Posts|42 Posts/i, 'Must not contain vacancy counts');
    assert.doesNotMatch(res.answer, /Revenue Division/i, 'Must not contain Revenue Division');
    assert.doesNotMatch(res.answer, /Retrieved directly from official FPSC/i, 'Must not make false official retrieval claims');

    // Citations must be empty for general Windows practice questions
    assert.equal(res.sources.length, 0, 'No false advertisement citations should be attached');
  });

  // Scenario B: "Explain the OSI model"
  test('Scenario B: "Explain the OSI model" provides a clear educational explanation', async () => {
    const res = await answerStudentQuery({ query: 'Explain the OSI model' });
    assert.ok(res.answer);

    const intent = classifyQueryIntent('Explain the OSI model');
    assert.equal(intent.type, 'subject_explanation');
    assert.equal(intent.subtopic, 'cs_osi_model');

    assert.match(res.answer, /7-layer|reference model/i);
    assert.match(res.answer, /Application Layer/i);
    assert.match(res.answer, /Physical Layer/i);
    assert.doesNotMatch(res.answer, /vacanc(y|ies)|Inspector Customs|closing date/i);
  });

  // Scenario C: "Give me five DBMS MCQs"
  test('Scenario C: "Give me five DBMS MCQs" returns DBMS questions with options and correct answers', async () => {
    const res = await answerStudentQuery({ query: 'Give me five DBMS MCQs' });
    assert.ok(res.answer);

    const intent = classifyQueryIntent('Give me five DBMS MCQs');
    assert.equal(intent.type, 'practice_mcqs');
    assert.equal(intent.subtopic, 'dbms');

    assert.match(res.answer, /Referential Integrity|2NF|Isolation|JOIN|Candidate Key|database|foreign key/i);
    assert.match(res.answer, /Q1:.*Q2:.*Q3:.*Q4:.*Q5:|\b1\..*\b2\..*\b3\..*\b4\..*\b5\./s);
    assert.match(res.answer, /\*\(Correct\)\*|Correct Answer/i);
    assert.doesNotMatch(res.answer, /Advt\. No\.|vacanc(y|ies)|Customs/i);
  });

  // Scenario D: "What is the latest FPSC advertisement and its closing date?"
  test('Scenario D: "What is the latest FPSC advertisement and its closing date?" returns verified advertisement info', async () => {
    const res = await answerStudentQuery({ query: 'What is the latest FPSC advertisement and its closing date?' });
    assert.ok(res.answer);

    const intent = classifyQueryIntent('What is the latest FPSC advertisement and its closing date?');
    assert.equal(intent.type, 'official_advertisement');

    assert.match(res.answer, /Consolidated Advertisement|Advt|FPSC/i);
    assert.match(res.answer, /20 January 2026|January 2026/i);
    assert.ok(res.sources && res.sources.length > 0, 'Must have verified official source link');
    assert.ok(res.sources[0].officialSourceUrl.includes('fpsc.gov.pk'));
  });

  // Scenario E: Ask a Windows question immediately after an FPSC advertisement question
  test('Scenario E: Windows question immediately after an advertisement question is NOT contaminated by previous context', async () => {
    // Step 1: User asks for advertisement
    const prevTurn = {
      role: 'user',
      text: 'What is the latest FPSC advertisement and its closing date?',
    };
    const prevAnswer = {
      role: 'assistant',
      text: `### FPSC Consolidated Advertisement No. 01/2026 Official Details:
Retrieved directly from official FPSC publication records:
1. Inspector Customs / Intelligence Officer (BS-16) [Case No. F.4-02/2026-R]: 185 Posts. Closing Date: 20 January 2026.
2. Assistant Director (Investigation) (BS-17) [Case No. F.4-15/2026-R]: 42 Posts.`,
    };

    // Step 2: User now asks "windows mcqs" with advertisement in history
    const res = await answerStudentQuery({
      query: 'windows mcqs',
      conversationHistory: [prevTurn, prevAnswer],
    });

    assert.ok(res.answer);
    // Must produce Windows MCQs
    assert.match(res.answer, /Windows|NTFS|Task Manager|File Explorer/i);
    assert.match(res.answer, /(Q1:|###\s*\*\*1\.|1\.\s+)/i);

    // Contamination check: Must NOT regurgitate Inspector Customs or 185 vacancies into the Windows MCQs answer
    assert.doesNotMatch(res.answer, /Inspector Customs/i, 'Must not leak Inspector Customs into new question');
    assert.doesNotMatch(res.answer, /185 Posts/i, 'Must not leak 185 Posts into new question');
    assert.doesNotMatch(res.answer, /Assistant Director.*FIA/i, 'Must not leak FIA into new question');
    assert.equal(res.sources.length, 0, 'Must not carry over advertisement citations');
  });

  // Scenario F: Ask questions in two separate chat sessions
  test('Scenario F: Separate chat sessions remain isolated without cross-session context leakage', async () => {
    // Session 1: CSS Exam rules consultation
    const session1Res = await answerStudentQuery({
      query: 'What is the syllabus and passing marks for CSS MPT?',
      conversationHistory: [],
    });
    assert.match(session1Res.answer, /200 Marks|MPT|33%/i);

    // Session 2: Independent session asking for Windows MCQs
    const session2Res = await answerStudentQuery({
      query: 'give me 5 windows mcqs',
      conversationHistory: [],
    });
    assert.match(session2Res.answer, /NTFS|Task Manager|pagefile/i);
    assert.doesNotMatch(session2Res.answer, /CSS MPT|200 Marks|passing marks/i, 'Session 2 must not inherit Session 1 topics');
  });

  // Scenario G: Test with irrelevant retrieved documents and unavailable search service
  test('Scenario G: Irrelevant documents are discarded and no unsupported claims or false citations are presented', async () => {
    // Check isDocumentRelevant
    const advtDocText = `FEDERAL PUBLIC SERVICE COMMISSION Consolidated Advertisement No. 01/2026 Inspector Customs 185 vacancies Revenue Division.`;
    
    // Windows query vs Advertisement document
    const isRelWindows = isDocumentRelevant('windows mcqs', advtDocText);
    assert.equal(isRelWindows, false, 'Advertisement document must be deemed irrelevant to Windows MCQs');

    const isRelOSI = isDocumentRelevant('Explain the OSI model', advtDocText);
    assert.equal(isRelOSI, false, 'Advertisement document must be deemed irrelevant to OSI model');

    // When query is genuinely about customs/advertisement:
    const isRelCustoms = isDocumentRelevant('inspector customs eligibility', advtDocText);
    assert.equal(isRelCustoms, true, 'Customs query is relevant to customs advertisement');

    // Run query with non-existent topic
    const generalRes = await answerStudentQuery({
      query: 'Explain the concept of quantum computing qubits',
      conversationHistory: [],
    });
    assert.ok(generalRes.answer);
    assert.doesNotMatch(generalRes.answer, /Inspector Customs|Consolidated Advertisement|Advt\. No\./i);
    assert.equal(generalRes.sources.length, 0, 'No false citations generated for general academic query');
  });

  // Test Manually Imported Document Handling
  test('Manually imported document is recognized and answered appropriately', async () => {
    const imported = importManualDocument({
      title: 'FPSC Computer Science Lecturer Scheme 2026',
      officialSourceUrl: 'https://www.fpsc.gov.pk/jobs/gr/cs-lecturer-2026',
      advertisementNo: 'Advt. No. 04/2026-R',
      publicationDate: '01 March 2026',
      text: 'Specialized scheme for Lecturer Computer Science (BS-17): 50% Computer Science core, 30% Software Engineering, 20% Teaching Methodology.',
      notes: 'Test imported scheme',
    });

    const intent = classifyQueryIntent('What is the scheme in FPSC Computer Science Lecturer Scheme 2026?');
    assert.equal(intent.type, 'imported_document');
    assert.equal(intent.matchedDoc.id, imported.id);

    const res = await answerStudentQuery({
      query: 'What is the scheme in FPSC Computer Science Lecturer Scheme 2026?',
    });

    assert.match(res.answer, /Lecturer Computer Science|50% Computer Science core/i);
    assert.ok(res.sources.length > 0);
    assert.equal(res.sources[0].title, 'FPSC Computer Science Lecturer Scheme 2026');
  });

});
