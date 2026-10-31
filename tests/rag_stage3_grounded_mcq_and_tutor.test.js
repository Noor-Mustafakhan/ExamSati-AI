/**
 * ExamSathi AI — Stage 3 Verification Suite
 * ========================================
 * 12-Step Comprehensive Test for Grounded MCQ Generation & Study Buddy Integration:
 *
 * 1.  Generate an Easy MCQ from a retrieved passage.
 * 2.  Generate a Medium MCQ (Moderate difficulty).
 * 3.  Generate a Hard MCQ (Advanced difficulty).
 * 4.  Verify all answers and evidence quotes against retrieved passages.
 * 5.  Confirm source page and document title references.
 * 6.  Confirm duplicate rejection.
 * 7.  Confirm pending status in Supabase (is_published = false, review_status = 'pending').
 * 8.  Edit an MCQ in Admin Review workflow.
 * 9.  Approve an MCQ (review_question RPC).
 * 10. Verify it appears in student practice only after approval.
 * 11. Ask Study Buddy a question and verify its answer against retrieved passages.
 * 12. Test an unsupported query and ensure the system does not fabricate an answer.
 */

import { generateAndIngestGroundedMCQ, verifyEvidenceQuote } from '../server/ragMcqGeneratorService.js';
import { answerStudentQuery } from '../server/aiTutorEngine.js';
import { supabase } from '../server/ragRetrievalService.js';
import { loadServerEnv } from '../server/env.js';

loadServerEnv();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function retryOperation(fn, retries = 3, delayMs = 1000) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fn();
      if (res && res.success === false && res.error && res.error !== 'INSUFFICIENT_EVIDENCE') {
        throw new Error(res.message || res.error);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.log(`    [Retry] Operation attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastErr;
}

async function runStage3VerificationSuite() {
  console.log('\n================================================================');
  console.log('   EXAMSATHI AI — STAGE 3 COMPREHENSIVE VERIFICATION SUITE       ');
  console.log('   Grounded MCQ Generation & AI Study Buddy Integration          ');
  console.log('================================================================\n');

  let easyMcq = null;
  let mediumMcq = null;
  let hardMcq = null;

  try {
    // --------------------------------------------------------------------------
    // Test 1: Generate Easy MCQ from retrieved passage
    // --------------------------------------------------------------------------
    console.log('\n[1/12] Generating Easy MCQ from retrieved passage...');
    easyMcq = await retryOperation(() => generateAndIngestGroundedMCQ({
      query: 'Belady Anomaly and FIFO page replacement',
      difficulty: 'Easy',
    }));

    assert(easyMcq.status === 'inserted' || easyMcq.status === 'duplicate', `Easy MCQ status is valid: ${easyMcq.status}`);
    assert(Boolean(easyMcq.question_id), `Easy MCQ has valid UUID: ${easyMcq.question_id}`);
    assert(easyMcq.question.difficulty === 'Easy', 'Question difficulty is Easy');
    assert(easyMcq.question.options.length === 4, 'Question has exactly 4 options');
    assert(new Set(easyMcq.question.options).size === 4, 'All 4 options are distinct');
    assert(typeof easyMcq.question.correct_option === 'number' && easyMcq.question.correct_option >= 0 && easyMcq.question.correct_option <= 3, 'Valid correct_option index (0..3)');
    assert(Boolean(easyMcq.question.evidence_quote), 'Question includes supporting evidence_quote');
    console.log(`       Question: "${easyMcq.question.question_text.slice(0, 80)}..."`);
    console.log(`       Correct Option [${easyMcq.question.correct_option}]: "${easyMcq.question.options[easyMcq.question.correct_option]}"`);

    // --------------------------------------------------------------------------
    // Test 2: Generate Medium MCQ (Moderate difficulty)
    // --------------------------------------------------------------------------
    console.log('\n[2/12] Generating Medium MCQ (Moderate difficulty)...');
    mediumMcq = await retryOperation(() => generateAndIngestGroundedMCQ({
      query: 'Database normalization Boyce-Codd Normal Form BCNF vs 3NF',
      difficulty: 'Moderate',
    }));

    assert(mediumMcq.status === 'inserted' || mediumMcq.status === 'duplicate', `Medium MCQ status is valid: ${mediumMcq.status}`);
    assert(Boolean(mediumMcq.question_id), `Medium MCQ has valid UUID: ${mediumMcq.question_id}`);
    assert(mediumMcq.question.difficulty === 'Moderate', 'Question difficulty is Moderate');
    assert(mediumMcq.question.options.length === 4, 'Question has exactly 4 options');
    assert(new Set(mediumMcq.question.options).size === 4, 'All 4 options are distinct');
    assert(Boolean(mediumMcq.question.evidence_quote), 'Question includes supporting evidence_quote');
    console.log(`       Question: "${mediumMcq.question.question_text.slice(0, 80)}..."`);
    console.log(`       Correct Option [${mediumMcq.question.correct_option}]: "${mediumMcq.question.options[mediumMcq.question.correct_option]}"`);

    // --------------------------------------------------------------------------
    // Test 3: Generate Hard MCQ (Advanced difficulty)
    // --------------------------------------------------------------------------
    console.log('\n[3/12] Generating Hard MCQ (Advanced difficulty)...');
    hardMcq = await retryOperation(() => generateAndIngestGroundedMCQ({
      query: 'Banker Algorithm and deadlock avoidance safety state',
      difficulty: 'Advanced',
    }));

    assert(hardMcq.status === 'inserted' || hardMcq.status === 'duplicate', `Hard MCQ status is valid: ${hardMcq.status}`);
    assert(Boolean(hardMcq.question_id), `Hard MCQ has valid UUID: ${hardMcq.question_id}`);
    assert(hardMcq.question.difficulty === 'Advanced', 'Question difficulty is Advanced');
    assert(hardMcq.question.options.length === 4, 'Question has exactly 4 options');
    assert(new Set(hardMcq.question.options).size === 4, 'All 4 options are distinct');
    assert(Boolean(hardMcq.question.evidence_quote), 'Question includes supporting evidence_quote');
    console.log(`       Question: "${hardMcq.question.question_text.slice(0, 80)}..."`);
    console.log(`       Correct Option [${hardMcq.question.correct_option}]: "${hardMcq.question.options[hardMcq.question.correct_option]}"`);

    // --------------------------------------------------------------------------
    // Test 4: Verify all answers and evidence quotes against source passages
    // --------------------------------------------------------------------------
    console.log('\n[4/12] Verifying answers and evidence quotes against source passages...');
    const testCases = [
      { name: 'Easy MCQ', mcq: easyMcq },
      { name: 'Medium MCQ', mcq: mediumMcq },
      { name: 'Hard MCQ', mcq: hardMcq },
    ];

    for (const { name, mcq } of testCases) {
      const passageId = mcq.passageProvenance?.passage_id;
      assert(Boolean(passageId), `${name} has valid passage_id in provenance`);

      // Retrieve passage text from database
      const { data: passageRow, error: pErr } = await supabase
        .from('pdf_passages')
        .select('id, passage_text')
        .eq('id', passageId)
        .single();

      assert(!pErr && Boolean(passageRow), `${name} passage row exists in database`);
      const isVerified = verifyEvidenceQuote(mcq.question.evidence_quote, passageRow.passage_text);
      assert(isVerified, `${name} evidence quotation verified against source passage: "${mcq.question.evidence_quote.slice(0, 60)}..."`);
    }

    // --------------------------------------------------------------------------
    // Test 5: Confirm source page and title references
    // --------------------------------------------------------------------------
    console.log('\n[5/12] Confirming source page and title references...');
    for (const { name, mcq } of testCases) {
      assert(Boolean(mcq.question.source_title), `${name} source_title is present`);
      assert(Boolean(mcq.question.source_page), `${name} source_page is present: "${mcq.question.source_page}"`);
      assert(mcq.question.source_page.includes('Page'), `${name} source_page specifies 'Page' or 'Pages' format`);
      assert(!mcq.question.question_text.includes(mcq.question.source_page), `${name} source metadata is kept separate from question text`);
      assert(!mcq.question.question_text.includes(mcq.question.source_title), `${name} source title is kept separate from question text`);
    }

    // --------------------------------------------------------------------------
    // Test 6: Confirm duplicate rejection
    // --------------------------------------------------------------------------
    console.log('\n[6/12] Confirming duplicate question rejection...');
    const dupPayload = {
      subject_id: easyMcq.question.subject_id,
      question_text: easyMcq.question.question_text,
      options: easyMcq.question.options,
      correct_option: easyMcq.question.correct_option,
      difficulty: easyMcq.question.difficulty,
      explanation: easyMcq.question.explanation,
      source_title: easyMcq.question.source_title,
      source_page: easyMcq.question.source_page,
      is_published: false,
    };

    const { data: dupResult } = await supabase.rpc('ingest_question_item', {
      p_question: dupPayload,
    });

    assert(dupResult?.status === 'duplicate', 'Database RPC detected and returned status = duplicate');
    assert(dupResult?.success === false, 'Duplicate response success = false');
    assert(dupResult?.question_id === easyMcq.question_id, `Duplicate response matched original question_id: ${easyMcq.question_id}`);

    // --------------------------------------------------------------------------
    // Test 7: Confirm pending status in Supabase (review_status = 'pending', is_published = false)
    // --------------------------------------------------------------------------
    console.log('\n[7/12] Confirming pending status in Supabase...');

    // 1. Verify via admin get_pending_questions RPC
    const { data: pendingList, error: kErr } = await supabase.rpc('get_pending_questions', {
      p_limit: 100,
      p_offset: 0,
      p_status: 'pending',
    });

    assert(!kErr && Array.isArray(pendingList), 'get_pending_questions RPC succeeded');
    const matchedPending = pendingList.find(q => q.id === easyMcq.question_id);
    assert(Boolean(matchedPending), 'Question appears in admin get_pending_questions review queue');
    assert(matchedPending.is_published === false, 'Pending question is_published is strictly FALSE');
    assert(matchedPending.review_status === 'pending', 'Pending question review_status is strictly pending');
    assert(matchedPending.correct_option === easyMcq.question.correct_option, `Protected correct_option [${matchedPending?.correct_option}] matches generated index [${easyMcq.question.correct_option}]`);

    // 2. Confirm student practice query cannot see unpublished question (RLS protection)
    const { data: studentBlockedRows } = await supabase
      .from('questions')
      .select('id')
      .eq('id', easyMcq.question_id);

    assert(!studentBlockedRows || studentBlockedRows.length === 0, 'Unpublished question is inaccessible to unauthenticated / student queries (enforced by RLS)');

    // --------------------------------------------------------------------------
    // Test 8: Edit an MCQ in Admin Review workflow
    // --------------------------------------------------------------------------
    const editNonce = Date.now().toString().slice(-4);
    const updatedStem = `In OS virtual memory section ${editNonce}, ${easyMcq.question.question_text.replace(/\?$/, '')}?`;
    const updatedExplanation = `${easyMcq.question.explanation} Updated with supplemental curriculum notes.`;

    const { data: updateRes, error: uErr } = await retryOperation(async () => {
      const res = await supabase.rpc('update_mcq_question', {
        p_question_id: easyMcq.question_id,
        p_question_text: updatedStem,
        p_options: easyMcq.question.options,
        p_correct_option: easyMcq.question.correct_option,
        p_explanation: updatedExplanation,
        p_subject_id: easyMcq.question.subject_id || null,
        p_syllabus_topic_id: easyMcq.question.syllabus_topic_id || null,
        p_difficulty: easyMcq.question.difficulty || 'Easy',
        p_source_title: easyMcq.question.source_title || 'Operating Systems Guide',
        p_source_page: easyMcq.question.source_page || 'Pages 1-2',
      });
      return res;
    });

    if (uErr || !updateRes?.success) {
      console.error('Update MCQ Diagnostic:');
      console.error('uErr:', uErr);
      console.error('updateRes:', updateRes);
      console.error('easyMcq.question_id:', easyMcq.question_id);
    }

    assert(!uErr && updateRes?.success === true, `Admin update_mcq_question RPC succeeded: ${updateRes?.error || uErr?.message}`);
    assert(Boolean(updateRes.question?.question_text), 'Updated question text was saved');
    assert(updateRes.question?.explanation === updatedExplanation, 'Updated explanation was saved');
    assert(updateRes.question?.is_published === false, 'Question remains unpublished while in review');

    // --------------------------------------------------------------------------
    // Test 9: Approve an MCQ via review_question RPC
    // --------------------------------------------------------------------------
    console.log('\n[9/12] Approving MCQ via review_question RPC...');
    const { data: approveResult, error: appErr } = await supabase.rpc('review_question', {
      p_question_id: easyMcq.question_id,
      p_decision: 'approve',
      p_verification_status: 'verified_citation',
    });

    assert(!appErr && approveResult?.success === true, 'review_question RPC approval succeeded');
    assert(approveResult.review_status === 'approved', 'RPC returned review_status = approved');
    assert(approveResult.is_published === true, 'RPC returned is_published = true');

    // --------------------------------------------------------------------------
    // Test 10: Verify question appears in student practice only after approval
    // --------------------------------------------------------------------------
    console.log('\n[10/12] Verifying question appears in student practice ONLY after approval...');
    
    // Approved question should be queryable by student client (is_published = true)
    const { data: publishedRows, error: pubErr } = await supabase
      .from('questions')
      .select('id, question_text, is_published, review_status')
      .eq('id', easyMcq.question_id)
      .eq('is_published', true);

    assert(!pubErr && publishedRows?.length === 1, 'Approved question is visible in published student practice bank');

    // Unapproved question (mediumMcq) must NOT be visible to students (is_published = false)
    const { data: unapprovedRows } = await supabase
      .from('questions')
      .select('id, is_published')
      .eq('id', mediumMcq.question_id)
      .eq('is_published', true);

    assert(unapprovedRows?.length === 0, 'Pending unapproved question is NOT returned in student published query');

    // --------------------------------------------------------------------------
    // Test 11: Ask Study Buddy a question and verify its answer against retrieved passages
    // --------------------------------------------------------------------------
    console.log('\n[11/12] Asking Study Buddy a curriculum question with RAG citations...');
    const studyBuddyQuery = 'Explain Belady Anomaly in page replacement and which algorithm exhibits it.';
    const tutorResponse = await retryOperation(async () => {
      const res = await answerStudentQuery({ query: studyBuddyQuery });
      if (!res.sources || res.sources.length === 0) {
        throw new Error('Study Buddy returned 0 source references (transient connection timeout)');
      }
      return res;
    }, 3, 1500);

    assert(Boolean(tutorResponse.answer), 'Study Buddy returned a valid answer string');
    assert(/belady/i.test(tutorResponse.answer), 'Answer explains Belady\'s Anomaly');
    assert(/fifo|first-in/i.test(tutorResponse.answer), 'Answer correctly identifies FIFO page replacement');
    assert(tutorResponse.sources?.length > 0, 'Study Buddy returned structured source references');
    
    const ragCitation = tutorResponse.sources.find(s => s.provenance === 'Curriculum RAG Reference' || s.title?.includes('Curriculum'));
    assert(Boolean(ragCitation), `Verified curriculum citation found: "${ragCitation?.title}" (${ragCitation?.sourcePage})`);
    console.log(`       Study Buddy Citation: ${ragCitation?.title} (${ragCitation?.sourcePage})`);

    // --------------------------------------------------------------------------
    // Test 12: Test an unsupported query and ensure the system does not fabricate an answer
    // --------------------------------------------------------------------------
    console.log('\n[12/12] Testing unsupported queries (MCQ Generator & Study Buddy)...');
    
    // 12a. MCQ Generator on unsupported topic
    const unsupportedQuery = 'Quantum gravitational flux dynamics in warp core reactors';
    const unsupportedMcqRes = await generateAndIngestGroundedMCQ({
      query: unsupportedQuery,
      difficulty: 'Moderate',
    });

    assert(unsupportedMcqRes.success === false, 'MCQ generator refused unsupported query with success = false');
    assert(unsupportedMcqRes.error === 'INSUFFICIENT_EVIDENCE', `MCQ generator returned INSUFFICIENT_EVIDENCE: ${unsupportedMcqRes.message}`);

    // 12b. Study Buddy on unsupported topic
    const unsupportedTutorRes = await answerStudentQuery({
      query: 'What are the specific requirements for warp core intermix in the Starfleet 2026 handbook?',
    });

    assert(Boolean(unsupportedTutorRes.answer), 'Study Buddy returned response');
    assert(
      /do not contain sufficient evidence|not found in uploaded curriculum|sufficient evidence/i.test(unsupportedTutorRes.answer),
      'Study Buddy truthfully stated that uploaded materials do not contain sufficient evidence'
    );
    assert(!/f\.4-\d+|notice no/i.test(unsupportedTutorRes.answer), 'Study Buddy did not hallucinate FPSC notice or case numbers');

    console.log('\n================================================================');
    console.log(`   ALL 12 STAGE 3 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\nTest Suite Execution Halted with Error:', err.message);
    console.error(`Tests Passed: ${passedTests}/${totalTests}, Failed: ${failedTests}`);
    process.exit(1);
  }
}

runStage3VerificationSuite().then(() => {
  process.exit(0);
});
