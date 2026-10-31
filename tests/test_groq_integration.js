/**
 * GroqCloud API Key & Model Health Verification Script
 * Tests:
 * 1. .env loading of GROQ_API_KEY
 * 2. GroqCloud authentication and LPU model response
 * 3. Structured JSON MCQ generation
 * 4. Study Buddy response generation with citations
 */

import { getGroqApiKey, getGroqConfigStatus, loadServerEnv } from '../server/env.js';
import { Groq } from 'groq-sdk';
import { generateAndIngestGroundedMCQ } from '../server/ragMcqGeneratorService.js';
import { answerStudentQuery } from '../server/aiTutorEngine.js';

loadServerEnv();

async function runGroqTest() {
  console.log('\n============================================================');
  console.log('       EXAMSATHI AI — GROQCLOUD INTEGRATION VERIFIER        ');
  console.log('============================================================\n');

  const groqStatus = getGroqConfigStatus();
  console.log('1. GroqCloud Environment Status:');
  console.log(`   - Configured: ${groqStatus.configured ? 'YES' : 'NO'}`);
  console.log(`   - Source Var: ${groqStatus.source}`);
  console.log(`   - Masked Key: ${groqStatus.masked || 'None'}`);
  console.log(`   - Target Model: ${groqStatus.model}\n`);

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    console.log('⚠️  NO GROQ API KEY DETECTED IN .env');
    console.log('   Please paste your Groq API key into .env:');
    console.log('   GROQ_API_KEY=gsk_your_key_here\n');
    console.log('   (Remember to save the file with Ctrl+S in your editor!)\n');
    process.exit(1);
  }

  console.log('2. Testing Direct GroqCloud Authentication & Completion...');
  try {
    const groq = new Groq({ apiKey });
    const t0 = Date.now();
    const chatComp = await groq.chat.completions.create({
      model: groqStatus.model || 'llama3-8b-8192',
      messages: [
        { role: 'system', content: 'You are ExamSathi AI. Return JSON with status="ok".' },
        { role: 'user', content: 'Ping test' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    const t1 = Date.now();
    console.log(`   ✓ GroqCloud responded in ${t1 - t0}ms!`);
    console.log(`   ✓ Raw response: ${chatComp.choices?.[0]?.message?.content?.trim()}`);
  } catch (authErr) {
    console.error(`   ✗ GroqCloud API Authentication Error: ${authErr.message}`);
    process.exit(1);
  }

  console.log('\n3. Testing Stage 3 Grounded MCQ Generation via GroqCloud...');
  try {
    const mcqRes = await generateAndIngestGroundedMCQ({
      query: 'Belady Anomaly and FIFO page replacement',
      difficulty: 'Easy',
    });
    console.log(`   ✓ MCQ Generation Status: ${mcqRes.status}`);
    console.log(`   ✓ Provider/Model Used:   ${mcqRes.modelUsed}`);
    console.log(`   ✓ Question Stem:         "${mcqRes.question?.question_text?.slice(0, 75)}..."`);
    console.log(`   ✓ Verified Evidence:     "${mcqRes.question?.evidence_quote?.slice(0, 70)}..."`);
  } catch (mcqErr) {
    console.error(`   ✗ MCQ Generation Error: ${mcqErr.message}`);
    process.exit(1);
  }

  console.log('\n4. Testing Study Buddy Retrieval & Answer via GroqCloud...');
  try {
    const tutorRes = await answerStudentQuery({
      query: 'What is Belady Anomaly and which page replacement algorithm exhibits it?',
    });
    console.log(`   ✓ Provider:   ${tutorRes.provider}`);
    console.log(`   ✓ Citations:  ${tutorRes.sources?.length || 0} reference source(s)`);
    console.log(`   ✓ Answer:     "${tutorRes.answer?.slice(0, 120)}..."\n`);
  } catch (tutorErr) {
    console.error(`   ✗ Study Buddy Error: ${tutorErr.message}`);
    process.exit(1);
  }

  console.log('============================================================');
  console.log('   🎉 GROQCLOUD INTEGRATION IS FULLY OPERATIONAL AND LIVE!   ');
  console.log('============================================================\n');
}

runGroqTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
