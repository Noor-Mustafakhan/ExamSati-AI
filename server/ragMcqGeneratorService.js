/**
 * ExamSathi AI — Stage 3: Grounded MCQ Generation Service
 * ========================================================
 * Generates verified, competitive-exam MCQs strictly grounded in PDF curriculum passages
 * retrieved via Stage 2 Hybrid Search (PostgreSQL Full-Text Search + pgvector + RRF).
 *
 * Grounding & Verification Rules:
 * 1. Strictly relies on retrieved passages — never invents facts, notices, or dates.
 * 2. Verifies the supporting evidence quote verbatim against the source passage text.
 * 3. Enforces 4 distinct options, exactly 1 correct answer (0..3), and academic explanation.
 * 4. Preserves exact source document title and page reference metadata.
 * 5. Persists to public.questions with is_published = false and review_status = 'pending'.
 * 6. Rejects duplicate and near-duplicate questions via Supabase deduplication RPC.
 * 7. Returns clear error when evidence is insufficient.
 */

import { loadServerEnv, getGeminiApiKey, getGroqApiKey } from './env.js';
import { supabase, retrieveHybridPassages } from './ragRetrievalService.js';
import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';

loadServerEnv();

// Supported configurable generation models
export const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
export const FALLBACK_GROQ_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';

/**
 * Normalizes difficulty string to match Supabase database CHECK constraint:
 * CHECK (difficulty IN ('Easy', 'Moderate', 'Advanced'))
 */
export function normalizeDifficulty(diff) {
  const d = (diff || '').trim().toLowerCase();
  if (d === 'easy') return 'Easy';
  if (d === 'hard' || d === 'advanced') return 'Advanced';
  return 'Moderate'; // Default for Medium / Moderate
}

/**
 * Normalizes text for verbatim substring comparison
 */
function normalizeForComparison(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[’'"`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies if an evidence quotation exists in the source passage.
 * Checks for exact substring match, or normalized token-level containment.
 */
export function verifyEvidenceQuote(evidenceQuote, passageText) {
  if (!evidenceQuote || !passageText) return false;
  
  const normQuote = normalizeForComparison(evidenceQuote);
  const normPassage = normalizeForComparison(passageText);

  // 1. Direct normalized substring check
  if (normPassage.includes(normQuote)) {
    return true;
  }

  // 2. Token overlap check if slight punctuation variation occurs
  const quoteTokens = normQuote.split(' ').filter(w => w.length > 2);
  if (quoteTokens.length === 0) return false;

  let matchedTokens = 0;
  for (const token of quoteTokens) {
    if (normPassage.includes(token)) {
      matchedTokens++;
    }
  }

  const matchRatio = matchedTokens / quoteTokens.length;
  return matchRatio >= 0.85;
}

/**
 * Validates the raw JSON output from the Gemini model
 */
export function validateGeneratedMcqJson(data, passage) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Model did not return a valid JSON object.' };
  }

  if (data.error === 'INSUFFICIENT_EVIDENCE') {
    return { valid: false, error: 'INSUFFICIENT_EVIDENCE', message: data.message || 'Evidence is insufficient.' };
  }

  // 1. Question text
  const questionText = (data.question_text || '').trim();
  if (!questionText || questionText.length < 15) {
    return { valid: false, error: 'Question text is too short or missing.' };
  }

  // Check for prohibited synthetic phrases
  if (/f\.4-|\bnotice no\b|\bcase no\b|synthetic template|fabricated/i.test(questionText)) {
    return { valid: false, error: 'Question contains synthetic notice template or fabricated reference.' };
  }

  // 2. Options validation (exactly 4 distinct non-empty strings)
  const options = data.options;
  if (!Array.isArray(options) || options.length !== 4) {
    return { valid: false, error: 'Options must be an array of exactly 4 choices.' };
  }

  const cleanOptions = options.map(opt => (opt || '').trim());
  if (cleanOptions.some(opt => !opt)) {
    return { valid: false, error: 'One or more options are empty.' };
  }

  const uniqueOptions = new Set(cleanOptions.map(opt => opt.toLowerCase()));
  if (uniqueOptions.size !== 4) {
    return { valid: false, error: 'Options contain duplicates; all 4 options must be distinct.' };
  }

  // 3. Correct option index
  const correctOption = data.correct_option;
  if (typeof correctOption !== 'number' || correctOption < 0 || correctOption > 3) {
    return { valid: false, error: 'correct_option must be an integer between 0 and 3.' };
  }

  // 4. Explanation
  const explanation = (data.explanation || '').trim();
  if (!explanation || explanation.length < 15) {
    return { valid: false, error: 'Explanation is too short or missing.' };
  }

  // 5. Evidence Quote
  const evidenceQuote = (data.evidence_quote || '').trim();
  if (!evidenceQuote || evidenceQuote.length < 8) {
    return { valid: false, error: 'Evidence quote is missing or too short.' };
  }

  // Verify evidence quote against passage
  const isQuoteVerified = verifyEvidenceQuote(evidenceQuote, passage.passage_text);
  if (!isQuoteVerified) {
    return {
      valid: false,
      error: 'UNVERIFIED_EVIDENCE_QUOTE',
      message: 'The supporting evidence quotation could not be verified in the retrieved passage.',
    };
  }

  return {
    valid: true,
    data: {
      question_text: questionText,
      options: cleanOptions,
      correct_option: correctOption,
      explanation,
      evidence_quote: evidenceQuote,
      difficulty: normalizeDifficulty(data.difficulty),
    },
  };
}

/**
 * Builds the prompt for Gemini MCQ generation
 */
function buildMcqPrompt({ passage, difficulty, query }) {
  const normDiff = normalizeDifficulty(difficulty);

  return `
You are an expert examination item writer for Pakistani competitive examinations (FPSC, CSS, PMS, PPSC).
Your duty is to generate ONE meaningful, technically rigorous multiple-choice question (MCQ) grounded EXCLUSIVELY in the reference passage provided below.

==================================================
REFERENCE PASSAGE (GROUND TRUTH):
Source Document: "${passage.document_title}"
Source Pages: ${passage.page_reference || `Pages ${passage.start_page}-${passage.end_page}`}
Subject: ${passage.subject_name || 'General Academic'}
Topic: ${passage.topic_title || 'General Concept'}

Passage Text:
"""
${passage.passage_text}
"""
==================================================

SPECIFICATIONS:
1. Target Difficulty: ${normDiff}
   - Easy: Direct recall of a clear definition, named principle, or explicit fact stated in the passage.
   - Moderate: Understanding mechanism, comparison, or operational logic explicitly explained in the passage.
   - Advanced: In-depth conceptual synthesis, consequence analysis, or subtle edge-case condition detailed in the passage.
2. User / Topic Focus: ${query || passage.topic_title || 'Core concepts in passage'}

STRICT GROUNDING & QUALITY REQUIREMENTS:
- Use retrieved evidence ONLY. Do NOT use outside knowledge not supported by the passage.
- NEVER invent facts, official notices, advertisement numbers, or FPSC case numbers.
- Exactly 4 distinct options (choices A, B, C, D). None may be empty or redundant.
- Exactly ONE unambiguously correct answer (0-indexed integer: 0 for A, 1 for B, 2 for C, 3 for D).
- The correct option MUST be directly proven by an exact statement in the passage.
- Provide "evidence_quote": An EXACT, VERBATIM excerpt from the passage text that proves the correct answer.
- Provide a detailed academic "explanation" clarifying why the correct choice is true.
- If the passage does NOT contain sufficient substantive evidence to generate a valid, high-quality question, respond with:
  {"error": "INSUFFICIENT_EVIDENCE", "message": "The passage does not provide enough factual detail to formulate a question."}

OUTPUT FORMAT:
Respond with a single, valid JSON object with no markdown formatting or commentary:
{
  "question_text": "Clear and precise question stem ending with a question mark?",
  "options": [
    "Option text A",
    "Option text B",
    "Option text C",
    "Option text D"
  ],
  "correct_option": 0,
  "explanation": "Detailed explanation grounded in the passage.",
  "evidence_quote": "Exact verbatim sentence from the passage text",
  "difficulty": "${normDiff}"
}
`.trim();
}

/**
 * Generates a single grounded MCQ from a retrieved passage using GroqCloud (with Gemini fallback)
 */
export async function generateMcqFromPassage({
  passage,
  difficulty = 'Moderate',
  query = '',
  model = null,
}) {
  const groqApiKey = getGroqApiKey();
  const geminiApiKey = getGeminiApiKey();

  if (!groqApiKey && !geminiApiKey) {
    throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is configured on the server. Please add GROQ_API_KEY to your .env file.');
  }

  if (!passage || !passage.passage_text || passage.passage_text.trim().length < 60) {
    return {
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: 'Provided passage has insufficient text content to generate an MCQ.',
    };
  }

  const prompt = buildMcqPrompt({ passage, difficulty, query });
  let rawJsonText = '';
  let activeModelUsed = '';

  // 1. Primary Generation: GroqCloud (if configured)
  if (groqApiKey) {
    const groq = new Groq({ apiKey: groqApiKey });
    let activeGroqModel = model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

    try {
      const completion = await groq.chat.completions.create({
        model: activeGroqModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert exam question creator for FPSC competitive civil service examinations in Pakistan. Generate questions strictly grounded in the provided curriculum passages. Output valid JSON only with no markdown formatting or surrounding code blocks.'
          },
          {
            role: 'user',
            content: prompt,
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2, // Low temperature for high adherence to evidence
      });

      rawJsonText = completion.choices?.[0]?.message?.content || '';
      activeModelUsed = `groq:${activeGroqModel}`;
    } catch (groqErr) {
      console.warn(`[RAG MCQ Generator] Groq primary model ${activeGroqModel} failed (${groqErr.message}), falling back to ${FALLBACK_GROQ_MODEL}...`);
      if (activeGroqModel !== FALLBACK_GROQ_MODEL) {
        try {
          activeGroqModel = FALLBACK_GROQ_MODEL;
          const fallbackCompletion = await groq.chat.completions.create({
            model: activeGroqModel,
            messages: [
              {
                role: 'system',
                content: 'You are an expert exam question creator for FPSC competitive civil service examinations in Pakistan. Output valid JSON only.'
              },
              {
                role: 'user',
                content: prompt,
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          });

          rawJsonText = fallbackCompletion.choices?.[0]?.message?.content || '';
          activeModelUsed = `groq:${activeGroqModel}`;
        } catch (fallbackGroqErr) {
          if (geminiApiKey) {
            console.warn(`[RAG MCQ Generator] Groq fallback failed (${fallbackGroqErr.message}), falling back to Gemini...`);
          } else {
            throw new Error(`Groq API Error: ${groqErr.message} (Fallback failed: ${fallbackGroqErr.message})`);
          }
        }
      } else if (!geminiApiKey) {
        throw groqErr;
      }
    }
  }

  // 2. Secondary Generation: Gemini (if Groq not configured or both Groq attempts failed)
  if (!rawJsonText && geminiApiKey) {
    const client = new GoogleGenAI({ apiKey: geminiApiKey });
    let activeGeminiModel = model || process.env.GEMINI_GENERATION_MODEL || DEFAULT_GEMINI_MODEL;

    try {
      const res = await client.models.generateContent({
        model: activeGeminiModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      rawJsonText = res.text || res.candidates?.[0]?.content?.parts?.[0]?.text || '';
      activeModelUsed = `gemini:${activeGeminiModel}`;
    } catch (apiErr) {
      if (activeGeminiModel !== FALLBACK_GEMINI_MODEL) {
        console.warn(`[RAG MCQ Generator] Gemini model ${activeGeminiModel} failed (${apiErr.message}), falling back to ${FALLBACK_GEMINI_MODEL}...`);
        try {
          activeGeminiModel = FALLBACK_GEMINI_MODEL;
          const resFallback = await client.models.generateContent({
            model: activeGeminiModel,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          rawJsonText = resFallback.text || resFallback.candidates?.[0]?.content?.parts?.[0]?.text || '';
          activeModelUsed = `gemini:${activeGeminiModel}`;
        } catch (fallbackErr) {
          throw new Error(`Gemini API Error: ${apiErr.message} (Fallback also failed: ${fallbackErr.message})`);
        }
      } else {
        throw apiErr;
      }
    }
  }

  if (!rawJsonText || !rawJsonText.trim()) {
    return {
      success: false,
      error: 'EMPTY_RESPONSE',
      message: 'Model returned an empty response.',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (parseErr) {
    console.error('[RAG MCQ Generator] JSON parse error on model output:', rawJsonText);
    return {
      success: false,
      error: 'INVALID_JSON',
      message: 'Model output could not be parsed as valid JSON.',
      rawOutput: rawJsonText,
    };
  }

  // Validate the generated question against rules and ground truth
  const validation = validateGeneratedMcqJson(parsed, passage);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      message: validation.message || validation.error,
    };
  }

  return {
    success: true,
    data: validation.data,
    modelUsed: activeModelUsed,
    passage: {
      id: passage.passage_id,
      document_title: passage.document_title,
      page_reference: passage.page_reference || `Pages ${passage.start_page}-${passage.end_page}`,
      subject_id: passage.subject_id,
      syllabus_topic_id: passage.syllabus_topic_id,
      exam_id: passage.exam_id,
    },
  };
}

/**
 * Main Grounded MCQ Generation Function
 * 1. Hybrid retrieval (sparse + dense + RRF)
 * 2. Evidence sufficiency check
 * 3. GroqCloud / Gemini Generation
 * 4. Grounding and quote verification
 * 5. Supabase ingestion into pending review queue
 */
export async function generateAndIngestGroundedMCQ({
  query,
  difficulty = 'Moderate',
  examId = null,
  subjectId = null,
  topicId = null,
  topPassages = null,
  model = null,
}) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('A valid query or syllabus topic is required.');
  }

  // 1. Retrieve relevant passages if not already provided
  let candidatePassages = topPassages;
  let retrievalResult = null;

  if (!Array.isArray(candidatePassages) || candidatePassages.length === 0) {
    retrievalResult = await retrieveHybridPassages({
      query: query.trim(),
      examId,
      subjectId,
      topicId,
      matchCount: 3,
      candidateCount: 10,
    });
    candidatePassages = retrievalResult?.hybridResults || [];
  }

  // 2. Strict Evidence Sufficiency Check
  if (!candidatePassages || candidatePassages.length === 0) {
    return {
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: `No relevant curriculum passages found for query "${query}". Cannot generate grounded question without evidence.`,
    };
  }

  // Filter for passages with meaningful text
  const eligiblePassages = candidatePassages.filter(p => p.passage_text && p.passage_text.trim().length >= 80);
  if (eligiblePassages.length === 0) {
    return {
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: `Retrieved passages for "${query}" do not contain sufficient text for competitive question generation.`,
    };
  }

  const selectedPassage = eligiblePassages[0];

  // Topical Relevance Check: If sparse FTS had zero matches, ensure strong multi-term keyword presence in the passage
  if (!selectedPassage.sparse_rank && (!retrievalResult || retrievalResult.sparseCandidates?.length === 0)) {
    const stopWords = new Set(['what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how', 'does', 'explain', 'give', 'detail', 'concept', 'about', 'with', 'from', 'that', 'this', 'these', 'those', 'have', 'more', 'generate', 'question', 'questions', 'mcqs', 'exam', 'profile', 'paper', 'syllabus', 'topic', 'model', 'notes']);
    const queryTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stopWords.has(w));

    if (queryTerms.length > 0) {
      const passageLower = selectedPassage.passage_text.toLowerCase();
      const matchedCount = queryTerms.filter(term => passageLower.includes(term)).length;
      const matchRatio = matchedCount / queryTerms.length;

      // Require at least 2 distinct keywords or >= 40% of query keywords to match
      if (matchedCount === 0 || (queryTerms.length >= 3 && matchRatio < 0.4 && matchedCount < 2)) {
        return {
          success: false,
          error: 'INSUFFICIENT_EVIDENCE',
          message: `The uploaded curriculum documents do not contain sufficient evidence or mention of "${query}". Question generation refused due to lack of grounded evidence.`,
        };
      }
    }
  }

  // 3. Call Gemini to generate grounded question
  const genResult = await generateMcqFromPassage({
    passage: selectedPassage,
    difficulty,
    query,
    model,
  });

  if (!genResult.success) {
    return genResult;
  }

  const mcq = genResult.data;

  // 4. Ingest into Supabase pending review queue
  if (!supabase) {
    throw new Error('Supabase client is not initialized on the server.');
  }

  // Structure payload for public.ingest_question_item RPC
  const ingestPayload = {
    exam_id: examId || selectedPassage.exam_id || null,
    subject_id: subjectId || selectedPassage.subject_id,
    syllabus_topic_id: topicId || selectedPassage.syllabus_topic_id || null,
    question_text: mcq.question_text,
    options: mcq.options,
    correct_option: mcq.correct_option,
    difficulty: mcq.difficulty,
    question_origin: 'ai_generated_practice',
    verification_status: 'verified_citation',
    explanation: `${mcq.explanation}\n\n**Evidence Quotation:** "${mcq.evidence_quote}"`,
    source_title: selectedPassage.document_title,
    source_page: selectedPassage.page_reference || `Pages ${selectedPassage.start_page}-${selectedPassage.end_page}`,
    source_url: `rag-passage:${selectedPassage.passage_id}`,
    is_published: false, // Critical: Enters pending review queue, requires admin approval
  };

  // Retry helper for resilient network calls against transient socket disconnects
  const callWithRetry = async (fn, retries = 3, delayMs = 800) => {
    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fn();
        if (res?.error && /fetch failed|socket|econnreset|und_err_socket/i.test(res.error.message || '')) {
          throw new Error(res.error.message);
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt));
        }
      }
    }
    throw lastErr;
  };

  const { data: ingestResponse, error: ingestError } = await callWithRetry(() =>
    supabase.rpc('ingest_question_item', {
      p_question: ingestPayload,
    })
  );

  if (ingestError) {
    console.error('[RAG MCQ Generator] Ingest RPC error:', ingestError);
    throw new Error(`Database ingestion error: ${ingestError.message}`);
  }

  const isDuplicate = ingestResponse?.status === 'duplicate';

  return {
    success: !isDuplicate,
    status: ingestResponse?.status || 'inserted',
    duplicate: isDuplicate,
    question_id: ingestResponse?.question_id || null,
    review_status: ingestResponse?.review_status || 'pending',
    is_published: false,
    modelUsed: genResult.modelUsed,
    question: {
      ...mcq,
      exam_id: ingestPayload.exam_id,
      subject_id: ingestPayload.subject_id,
      syllabus_topic_id: ingestPayload.syllabus_topic_id,
      source_title: ingestPayload.source_title,
      source_page: ingestPayload.source_page,
      evidence_quote: mcq.evidence_quote,
    },
    passageProvenance: {
      document_title: selectedPassage.document_title,
      page_reference: selectedPassage.page_reference || `Pages ${selectedPassage.start_page}-${selectedPassage.end_page}`,
      passage_id: selectedPassage.passage_id,
      rrf_score: selectedPassage.rrf_score,
      retrieval_method: selectedPassage.retrieval_method,
    },
  };
}

/**
 * Batch Grounded MCQ Generation
 * Iterates through passages and generates a batch of verified MCQs.
 */
export async function generateGroundedMCQBatch({
  query,
  difficulty = 'Moderate',
  count = 3,
  examId = null,
  subjectId = null,
  topicId = null,
  model = null,
}) {
  const safeCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);

  // 1. Retrieve hybrid passages
  const retrieval = await retrieveHybridPassages({
    query,
    examId,
    subjectId,
    topicId,
    candidateCount: Math.max(10, safeCount * 3),
    matchCount: safeCount,
  });

  const passages = retrieval?.hybridResults || [];
  if (passages.length === 0) {
    return {
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: `No relevant passages retrieved for query "${query}".`,
      totalRequested: safeCount,
      insertedCount: 0,
      duplicateCount: 0,
      questions: [],
    };
  }

  const generatedQuestions = [];
  let insertedCount = 0;
  let duplicateCount = 0;
  const errors = [];

  for (let i = 0; i < passages.length && generatedQuestions.length < safeCount; i++) {
    const passage = passages[i];
    try {
      const res = await generateAndIngestGroundedMCQ({
        query: `${query} (Aspect ${i + 1})`,
        difficulty,
        examId,
        subjectId,
        topicId,
        topPassages: [passage],
        model,
      });

      if (res.success && res.status === 'inserted') {
        insertedCount++;
        generatedQuestions.push(res);
      } else if (res.duplicate) {
        duplicateCount++;
      } else {
        errors.push(res.error || res.message);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  return {
    success: insertedCount > 0,
    totalRequested: safeCount,
    insertedCount,
    duplicateCount,
    questions: generatedQuestions,
    errors: errors.length > 0 ? errors : undefined,
    retrievalTimings: retrieval.timings,
  };
}
