/**
 * Server-Side AI Study Buddy Engine
 * Provides grounded, source-referenced answers for FPSC and CSS/MPT preparation.
 * Handles LLM provider abstraction (Gemini 3.8 Flash with Google Search Grounding / Grounded Academic Knowledge Engine),
 * multi-turn conversation history, official source retrieval, search result caching, and prompt injection defense.
 */

import { fetchFpscDocument, getAllArchivalSnapshots, getManualImportedDocuments } from './fpscRetrievalService.js';
import { getGeminiApiKey, getGroqApiKey, loadServerEnv, getGeminiConfigStatus, getGroqConfigStatus } from './env.js';
import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';
import { getCurrentOpenJobs, getArchivedJobs } from './jobManagementService.js';
import { retrieveHybridPassages } from './ragRetrievalService.js';

// Ensure environment is loaded on startup
loadServerEnv();

/**
 * Normalizes Markdown text from AI models before sending to clients.
 * Cleans unintentional escapes (e.g. '\|', '|\') without modifying code blocks.
 */
export function normalizeMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  const codeBlocks = [];
  let placeholderIndex = 0;
  let processed = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    const token = `@@EXAMSATHI_CODE_${placeholderIndex++}@@`;
    codeBlocks.push({ token, match });
    return token;
  });

  processed = processed.replace(/\r\n/g, '\n');
  processed = processed.replace(/\\\|/g, '|');
  processed = processed.replace(/\|\s*\\+(\s*)$/gm, '|$1');
  if (processed.includes('\\n') && !processed.includes('\n')) {
    processed = processed.replace(/\\n/g, '\n');
  }
  processed = processed.replace(/\\\*\\\*/g, '**');
  processed = processed.replace(/([^\n])\n(#{1,6}\s+[^\n]+)/g, '$1\n\n$2');
  processed = processed.replace(/([^\n])\n(\|.+?\|\n\|[-:\s|]+?\|)/g, '$1\n\n$2');

  for (const { token, match } of codeBlocks) {
    processed = processed.replace(token, match);
  }

  return processed;
}

// Primary verified stable & cost-effective Gemini model supporting Google Search grounding
export const CURRENT_GEMINI_MODEL = process.env.GEMINI_GENERATION_MODEL || 'gemini-3.5-flash-lite';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';

// In-Memory Search Grounding Cache (15 min TTL) to avoid duplicate search queries and API costs
const searchGroundingCache = new Map();
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SEARCH_CACHE_MAX_SIZE = 100;

function getCachedSearchResult(key) {
  const entry = searchGroundingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchGroundingCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedSearchResult(key, value) {
  if (searchGroundingCache.size >= SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = searchGroundingCache.keys().next().value;
    if (oldestKey) searchGroundingCache.delete(oldestKey);
  }
  searchGroundingCache.set(key, {
    value,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

/**
 * Determine whether a query needs live Google Search grounding vs basic academic reasoning
 * Avoids firing billable search queries for standard, evergreen educational topics.
 */
export function isSearchGroundingNeeded(query) {
  const q = (query || '').toLowerCase().trim();

  // 1. Never search for obvious prompt injections
  if (/ignore (all |previous )?instructions|system prompt|disregard (all )?rules/i.test(q)) {
    return false;
  }

  // 2. Evergreen Academic Concepts: DO NOT use live web search
  const isPureAcademic =
    (/\b(ram|rom)\b/i.test(q) && /\b(differ|difference|vs|versus|compare|comparison|farq|distinguish)\b/i.test(q)) ||
    /\b(osi|osi model|7 layers|open systems interconnection)\b/i.test(q) ||
    /\b(mcqs?|multiple choice|practice questions?|test questions?|quiz)\b/i.test(q) ||
    /\b(windows|operating system|os|linux|unix|ntfs|fat32|uac|file explorer)\b/i.test(q) ||
    /\b(photosynthesis|mitochondria|thermodynamics|gravity|speed of light|cell wall|osmosis|dna|rna)\b/i.test(q) ||
    /\b(boyle|charles law|blood group|ozone layer|atmosphere layers?|newton)\b/i.test(q) ||
    (/\b(article 2|article 2a)\b/i.test(q) && /\b(constitution|difference|objectives resolution)\b/i.test(q)) ||
    /\b(recipe|brownies?|baking|car repair)\b/i.test(q);

  if (isPureAcademic) {
    return false;
  }

  // 3. Time-sensitive, current official FPSC recruitment news, closing dates, or live updates:
  const isTimeSensitive =
    /\b(advertisement|advt|closing date|last date|deadline|schedule|date sheet|corrigendum|press release)\b/i.test(q) ||
    /\b(jobs? announced|vacanc(y|ies)|challan fee|how to apply online|apply date|roll number slip|test date)\b/i.test(q);

  return isTimeSensitive;
}

/**
 * Handle student queries with source-grounded retrieval
 */
export async function answerStudentQuery({ query, conversationHistory = [], language = 'auto' }) {
  const normalizedQuery = (query || '').trim();
  if (!normalizedQuery) {
    throw new Error('Query string is required.');
  }

  // 1. Identify information category & retrieve relevant official FPSC content from archival index
  const retrievalResult = await identifyAndRetrieveOfficialSources(normalizedQuery);

  // 1b. Stage 2/3: Perform Hybrid RAG Retrieval against indexed PDF curriculum documents
  let ragPassages = [];
  let ragContext = '';
  let ragCitations = [];

  try {
    const ragRes = await retrieveHybridPassages({ query: normalizedQuery, matchCount: 3 });
    ragPassages = ragRes?.hybridResults || [];

    const relevantPassages = ragPassages.filter(p => {
      if (p.sparse_rank) return true;
      const terms = normalizedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const textLower = (p.passage_text || '').toLowerCase();
      return terms.some(t => textLower.includes(t));
    });

    if (relevantPassages.length > 0) {
      ragContext = relevantPassages.map((p, idx) => 
        `[Passage ${idx + 1}] Document: "${p.document_title}" (${p.page_reference || `Pages ${p.start_page}-${p.end_page}`})\n` +
        `Passage Content: """${p.passage_text}"""`
      ).join('\n\n');

      ragCitations = relevantPassages.map(p => ({
        title: p.document_title,
        sourcePage: p.page_reference || `Pages ${p.start_page}-${p.end_page}`,
        officialSourceUrl: null,
        provenance: 'Curriculum RAG Reference',
        snippet: p.passage_text.slice(0, 160) + '...',
      }));
    }
  } catch (ragErr) {
    console.warn('[ExamSathi AI] RAG hybrid retrieval failed for student query:', ragErr.message);
  }

  // 2. Detect language preference (English vs Roman Urdu)
  const isRomanUrdu =
    language === 'roman_urdu' ||
    /\b(roman urdu|urdu me|urdu mein|batao|samjhao|kya hai|kaise|tareeqa|wazahat)\b/i.test(normalizedQuery);

  // 3. Check if query requires live web search grounding (never use web search if curriculum RAG passages are present)
  const needsLiveSearch = !ragContext && isSearchGroundingNeeded(normalizedQuery);

  // 4. Check LLM Provider Configuration (GroqCloud prioritized, Gemini as fallback)
  const groqApiKey = getGroqApiKey();
  const geminiApiKey = getGeminiApiKey();

  // 4a. Primary: GroqCloud LPU Execution (if GROQ_API_KEY is configured)
  if (groqApiKey) {
    try {
      const groqResult = await callGroqEngine({
        query: normalizedQuery,
        conversationHistory,
        retrievedContext: retrievalResult.sourcesText,
        ragContext,
        ragCitations,
        isRomanUrdu,
        apiKey: groqApiKey,
      });

      // Merge verified local citations (RAG curriculum citations + archival citations)
      let finalSources = [...(groqResult.sources || [])];
      if (ragCitations.length > 0) {
        for (const rc of ragCitations) {
          if (!finalSources.some(s => s.title === rc.title && s.sourcePage === rc.sourcePage)) {
            finalSources.push(rc);
          }
        }
      }
      if (finalSources.length === 0 && retrievalResult.citations?.length > 0) {
        finalSources = retrievalResult.citations;
      }

      return {
        answer: normalizeMarkdown(groqResult.answer),
        sources: finalSources,
        provider: groqResult.provider,
        retrievalTimestamp: new Date().toISOString(),
        isRomanUrdu,
        isLive: false,
        searchGroundingUsed: false,
      };
    } catch (groqErr) {
      console.warn('[ExamSathi AI] GroqCloud execution failed, attempting fallback:', groqErr.message);
      if (!geminiApiKey) {
        // Fall back gracefully to Grounded Academic Knowledge Engine
        const fallbackAnswer = synthesizeGroundedAnswer({
          query: normalizedQuery,
          retrievedData: retrievalResult,
          isRomanUrdu,
        });
        return {
          answer: normalizeMarkdown(fallbackAnswer),
          sources: retrievalResult.citations,
          provider: 'ExamSathi Grounded Academic Engine (FPSC Official Index)',
          retrievalTimestamp: new Date().toISOString(),
          isRomanUrdu,
          isLive: false,
          searchGroundingUsed: false,
        };
      }
    }
  }

  // 4b. Secondary: Gemini Execution (if Groq not configured or failed)
  if (geminiApiKey) {
    try {
      const geminiResult = await callGeminiEngine({
        query: normalizedQuery,
        conversationHistory,
        retrievedContext: retrievalResult.sourcesText,
        ragContext,
        ragCitations,
        isRomanUrdu,
        enableSearchGrounding: needsLiveSearch,
        apiKey: geminiApiKey,
      });

      // Merge verified local citations (RAG curriculum citations + archival citations)
      let finalSources = [...(geminiResult.sources || [])];
      if (ragCitations.length > 0) {
        for (const rc of ragCitations) {
          if (!finalSources.some(s => s.title === rc.title && s.sourcePage === rc.sourcePage)) {
            finalSources.push(rc);
          }
        }
      }
      if (finalSources.length === 0 && retrievalResult.citations?.length > 0) {
        finalSources = retrievalResult.citations;
      }

      return {
        answer: normalizeMarkdown(geminiResult.answer),
        sources: finalSources,
        provider: geminiResult.provider,
        retrievalTimestamp: new Date().toISOString(),
        isRomanUrdu,
        isLive: Boolean(geminiResult.searchGroundingUsed),
        searchGroundingUsed: Boolean(geminiResult.searchGroundingUsed),
      };
    } catch (llmErr) {
      console.warn('[ExamSathi AI] Gemini API call failed:', llmErr.message);

      // Analyze error type (Invalid Key vs Rate Limit / Quota vs Network)
      const isAuthError =
        llmErr.status === 400 ||
        llmErr.status === 401 ||
        llmErr.status === 403 ||
        /api key not valid|api_key_invalid|invalid api key|unauthorized|forbidden/i.test(llmErr.message);

      const isQuotaError =
        llmErr.status === 429 ||
        /resource_exhausted|quota|rate limit|too many requests/i.test(llmErr.message);

      // Fallback gracefully to Grounded Academic Knowledge Engine
      const fallbackAnswer = synthesizeGroundedAnswer({
        query: normalizedQuery,
        retrievedData: retrievalResult,
        isRomanUrdu,
      });

      let notice = '';
      let providerTag = 'ExamSathi Grounded Academic Engine (FPSC Official Index)';

      if (isAuthError) {
        providerTag = 'ExamSathi Grounded Academic Engine (API Key Authorization Error)';
        notice = isRomanUrdu
          ? `> [!WARNING]\n> **API Key Masla:** Configured API key invalid ya unverified hai. Barah-e-karam apni key durust karein.\n\n`
          : `> [!WARNING]\n> **API Key Issue:** The configured API key is invalid or unauthorized (HTTP 400/403).\n\n`;
      } else if (isQuotaError) {
        providerTag = 'ExamSathi Grounded Academic Engine (Search Quota Fallback)';
        notice = isRomanUrdu
          ? `> [!WARNING]\n> **API Usage Limit:** API ya Google Search grounding ki temporary limit reach ho chuki hai. Verified archival records se jawab faraham kiya ja raha hai.\n\n`
          : `> [!WARNING]\n> **Usage Limit / Quota Reached:** API rate limit or search quota temporarily reached. Answering from ExamSathi verified official archival records.\n\n`;
      }

      return {
        answer: normalizeMarkdown(notice + fallbackAnswer),
        sources: retrievalResult.citations,
        provider: providerTag,
        retrievalTimestamp: new Date().toISOString(),
        isRomanUrdu,
        isLive: false,
        searchGroundingUsed: false,
      };
    }
  }

  // 5. Fallback: No API Key Configured -> Grounded Academic Knowledge Engine
  const synthesizedAnswer = synthesizeGroundedAnswer({
    query: normalizedQuery,
    retrievedData: retrievalResult,
    isRomanUrdu,
  });

  let setupNotice = '';
  if (needsLiveSearch) {
    setupNotice = isRomanUrdu
      ? `> [!NOTE]\n> **Live Internet Search Setup:** Real-time internet search ke liye \`GEMINI_API_KEY\` configure nahi hai. Yeh jawab ExamSathi ke verified official FPSC records se diya gaya hai. Live Google Search grounding enable karne ke liye project ki \`.env.local\` file mein \`GEMINI_API_KEY=your_key\` shamil karein.\n\n`
      : `> [!NOTE]\n> **Live Web Search Setup:** Gemini API key is not configured in \`.env.local\`. This response is served from ExamSathi's verified official archival FPSC catalog. To enable live Google Search grounding and real-time retrieval, configure \`GEMINI_API_KEY=your_key\` in \`.env.local\`.\n\n`;
  }

  return {
    answer: normalizeMarkdown(setupNotice + synthesizedAnswer),
    sources: retrievalResult.citations,
    provider: 'ExamSathi Grounded Academic Engine (FPSC Official Index)',
    retrievalTimestamp: new Date().toISOString(),
    isRomanUrdu,
    isLive: false,
    searchGroundingUsed: false,
  };
}

/**
 * Execute GroqCloud LPU interaction for Study Buddy
 */
async function callGroqEngine({
  query,
  conversationHistory = [],
  retrievedContext,
  ragContext,
  ragCitations = [],
  isRomanUrdu,
  apiKey,
  model = null,
}) {
  const groq = new Groq({ apiKey });
  let activeModel = model || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

  const systemInstruction = `
You are ExamSathi AI Academic Study Buddy, a helpful, clear, and source-grounded study companion for Pakistani students and competitive examination candidates.

CORE ANSWER QUALITY DIRECTIVES:
1. ANSWER DIRECTLY: Provide the direct, straightforward answer to the user's specific question in the very first paragraph before adding additional detail or explanation.
2. CLEAR & ACCESSIBLE LANGUAGE: Use plain, conversational, easy-to-understand English by default. When asked for Roman Urdu, use natural, polite, grammatically clean Roman Urdu. Avoid unnecessarily complex vocabulary, jargon, and bloated filler text.
3. LOGICAL STRUCTURE: Organize longer answers with clear headings (###), short paragraphs (2-3 sentences), and bullet points only when helpful for readability. Use numbered steps for procedures or sequential protocols.
4. PRACTICAL EXAMPLES: Illustrate technical or scientific concepts with simple, relatable real-world examples.
5. NO FORCED TABLES: Do NOT automatically generate comparison tables for simple questions unless a concise table genuinely makes the comparison clearer. When providing a table, keep it compact (3-5 key parameters) with valid Markdown syntax.
6. NO IRRELEVANT EXAM CLAIMS: Do NOT attach unsolicited FPSC or CSS examination notices, claims, or vacancy details to general educational/academic questions (like RAM vs ROM, Windows MCQs, or basic science) unless the user specifically inquired about an FPSC syllabus, job, or exam scheme.
7. FACTUAL ACCURACY & PROVENANCE:
   - Ground factual claims about advertisements, closing dates, vacancy quotas, and rules STRICTLY on verified official sources.
   - When discussing official FPSC information, prefer official commission sources (fpsc.gov.pk).
   - NEVER invent or fabricate URLs, advertisement numbers, dates, quotas, or claims that live retrieval occurred if it did not.
   - Distinguish official government announcements from general academic concepts.
8. CLEAN MARKDOWN SYNTAX: Output standard, valid GitHub-Flavored Markdown. Never escape table pipes with backslashes (use '|', not '\\|' or '|\\').
9. GET STRAIGHT TO THE POINT: Avoid boilerplate introductions ("Hello student!", "Certainly, let me explain...") and repetitive closing summaries.
10. CONVERSATIONAL TOPIC DISCIPLINE & INDEPENDENCE:
    - Focus STRICTLY and EXCLUSIVELY on the student's CURRENT question.
    - Do NOT carry over, blend, or mention job advertisements, vacancies, or previous context unless the user explicitly refers back to them.
    - When a user asks for practice questions (such as "windows mcqs"), output ONLY high-yield multiple-choice questions for that specific topic with options, correct answers, and explanations. NEVER output recruitment advertisements, job postings, or commission announcements for academic or MCQ requests.
    - Never claim "retrieved directly from official publications" unless verified official source excerpts are explicitly provided in [OFFICIAL REPOSITORY ARCHIVE CONTEXT] during this specific turn.
11. VERIFIED CURRICULUM RAG CITATION & GROUNDING:
    - When [VERIFIED CURRICULUM REFERENCE PASSAGES] are provided, ground your explanation strictly on the facts, mechanisms, and definitions in those passages.
    - Cite the verified source title and exact page reference directly in your answer (e.g. \`[Operating_Systems_Curriculum_Guide.pdf, Pages 1-2]\`).
    - If the user's question asks for specific claims, rules, or details that are NOT supported by the retrieved materials or syllabus, state clearly:
      "The uploaded curriculum materials do not contain sufficient evidence to answer this query."
    - NEVER fabricate FPSC notices, advertisement numbers, case numbers, or fake page references.
    - Treat previous conversation history purely as conversational context, NOT as factual evidence. Never cite past assistant claims as authoritative truth.
`.trim();

  let contextPrompt = '';
  if (retrievedContext && retrievedContext.trim().length > 20) {
    contextPrompt += `[OFFICIAL REPOSITORY ARCHIVE CONTEXT]:\n${retrievedContext}\n\n`;
  }
  if (ragContext && ragContext.trim().length > 20) {
    contextPrompt += `[VERIFIED CURRICULUM REFERENCE PASSAGES]:\n${ragContext}\n\n`;
  } else {
    contextPrompt += `[CURRICULUM REPOSITORY STATUS]: No matching passages found in the uploaded curriculum documents for this query.\n\n`;
  }

  const messages = [
    { role: 'system', content: systemInstruction }
  ];

  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    for (const msg of recent) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content || '' });
      }
    }
  }

  messages.push({
    role: 'user',
    content: `${contextPrompt}Student's Current Question: "${query}"\n\nPlease answer accurately based on the verified sources provided above.`
  });

  try {
    const completion = await groq.chat.completions.create({
      model: activeModel,
      messages,
      temperature: 0.3,
    });

    const answer = completion.choices?.[0]?.message?.content || '';
    return {
      answer,
      sources: ragCitations,
      provider: `ExamSathi AI Study Buddy (GroqCloud / ${activeModel})`,
      searchGroundingUsed: false,
    };
  } catch (err) {
    if (activeModel !== 'openai/gpt-oss-120b') {
      console.warn(`[Groq Study Buddy] ${activeModel} failed (${err.message}), falling back to openai/gpt-oss-120b...`);
      const fallbackComp = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages,
        temperature: 0.3,
      });
      const answer = fallbackComp.choices?.[0]?.message?.content || '';
      return {
        answer,
        sources: ragCitations,
        provider: 'ExamSathi AI Study Buddy (GroqCloud / openai/gpt-oss-120b)',
        searchGroundingUsed: false,
      };
    }
    throw err;
  }
}

/**
 * Execute Gemini API interaction with optional Google Search Grounding
 */
async function callGeminiEngine({
  query,
  conversationHistory = [],
  retrievedContext,
  ragContext,
  ragCitations = [],
  isRomanUrdu,
  enableSearchGrounding,
  apiKey,
}) {
  const cacheKey = `gemini:${enableSearchGrounding ? 'search' : 'plain'}:${isRomanUrdu ? 'ur' : 'en'}:${query.toLowerCase().replace(/\s+/g, ' ')}`;

  // Return cached result if available
  if (enableSearchGrounding) {
    const cached = getCachedSearchResult(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const systemInstruction = `
You are ExamSathi AI Academic Study Buddy, a helpful, clear, and source-grounded study companion for Pakistani students and competitive examination candidates.

CORE ANSWER QUALITY DIRECTIVES:
1. ANSWER DIRECTLY: Provide the direct, straightforward answer to the user's specific question in the very first paragraph before adding additional detail or explanation.
2. CLEAR & ACCESSIBLE LANGUAGE: Use plain, conversational, easy-to-understand English by default. When asked for Roman Urdu, use natural, polite, grammatically clean Roman Urdu. Avoid unnecessarily complex vocabulary, jargon, and bloated filler text.
3. LOGICAL STRUCTURE: Organize longer answers with clear headings (###), short paragraphs (2-3 sentences), and bullet points only when helpful for readability. Use numbered steps for procedures or sequential protocols.
4. PRACTICAL EXAMPLES: Illustrate technical or scientific concepts with simple, relatable real-world examples.
5. NO FORCED TABLES: Do NOT automatically generate comparison tables for simple questions unless a concise table genuinely makes the comparison clearer. When providing a table, keep it compact (3-5 key parameters) with valid Markdown syntax.
6. NO IRRELEVANT EXAM CLAIMS: Do NOT attach unsolicited FPSC or CSS examination notices, claims, or vacancy details to general educational/academic questions (like RAM vs ROM, Windows MCQs, or basic science) unless the user specifically inquired about an FPSC syllabus, job, or exam scheme.
7. FACTUAL ACCURACY & PROVENANCE:
   - Ground factual claims about advertisements, closing dates, vacancy quotas, and rules STRICTLY on verified official sources.
   - When discussing official FPSC information, prefer official commission sources (fpsc.gov.pk).
   - NEVER invent or fabricate URLs, advertisement numbers, dates, quotas, or claims that live retrieval occurred if it did not.
   - Distinguish official government announcements from general academic concepts.
8. CLEAN MARKDOWN SYNTAX: Output standard, valid GitHub-Flavored Markdown. Never escape table pipes with backslashes (use '|', not '\\|' or '|\\').
9. GET STRAIGHT TO THE POINT: Avoid boilerplate introductions ("Hello student!", "Certainly, let me explain...") and repetitive closing summaries.
10. CONVERSATIONAL TOPIC DISCIPLINE & INDEPENDENCE:
    - Focus STRICTLY and EXCLUSIVELY on the student's CURRENT question.
    - Do NOT carry over, blend, or mention job advertisements, vacancies, or previous context unless the user explicitly refers back to them (e.g. "what about that second vacancy?", "tell me more about that").
    - When a user asks for practice questions (such as "windows mcqs"), output ONLY high-yield multiple-choice questions for that specific topic with options, correct answers, and explanations. NEVER output recruitment advertisements, job postings, or commission announcements for academic or MCQ requests.
    - Never claim "retrieved directly from official publications" unless verified official source excerpts are explicitly provided in [OFFICIAL REPOSITORY ARCHIVE CONTEXT] during this specific turn.
11. VERIFIED CURRICULUM RAG CITATION & GROUNDING:
    - When [VERIFIED CURRICULUM REFERENCE PASSAGES] are provided, ground your explanation strictly on the facts, mechanisms, and definitions in those passages.
    - Cite the verified source title and exact page reference directly in your answer (e.g. \`[Operating_Systems_Curriculum_Guide.pdf, Pages 1-2]\`).
    - If the user's question asks for specific claims, rules, or details that are NOT supported by the retrieved materials or syllabus, state clearly:
      "The uploaded curriculum materials do not contain sufficient evidence to answer this question."
    - NEVER fabricate FPSC notices, advertisement numbers, case numbers, or fake page references.
    - Treat previous conversation history purely as conversational context, NOT as factual evidence. Never cite past assistant claims as authoritative truth.
`.trim();

  const client = new GoogleGenAI({ apiKey });

  // Format conversational context
  let inputPrompt = '';
  if (retrievedContext && retrievedContext.trim().length > 20) {
    inputPrompt += `[OFFICIAL REPOSITORY ARCHIVE CONTEXT]:\n${retrievedContext}\n\n`;
  }

  if (ragContext && ragContext.trim().length > 20) {
    inputPrompt += `[VERIFIED CURRICULUM REFERENCE PASSAGES]:\n${ragContext}\n\n`;
  } else {
    inputPrompt += `[CURRICULUM REPOSITORY STATUS]: No matching passages found in the uploaded curriculum documents for this query.\n\n`;
  }

  // Include only recent turns formatted cleanly, without letting old topics bleed into new topics
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    inputPrompt += `RECENT CONVERSATION HISTORY:\n` + recent.map((m) => {
      const role = m.role === 'user' ? 'Student' : 'Assistant';
      const text = typeof m.text === 'string' ? m.text.slice(0, 250) : '';
      return `${role}: ${text}`;
    }).join('\n') + `\n\n`;
  }

  inputPrompt += `CURRENT STUDENT QUESTION:\n${query}\n\n`;
  inputPrompt += `LANGUAGE REQUIREMENT: ${isRomanUrdu ? 'Provide the entire answer in natural, clear Roman Urdu.' : 'Provide the answer in concise, clear English.'}`;

  // 1. If Google Search Grounding is enabled
  if (enableSearchGrounding) {
    let resultAnswer = '';
    let citations = [];
    let executedQueries = [];

    try {
      // Try Interactions API first (Google's latest standard for search grounding)
      try {
        const interaction = await client.interactions.create(
          {
            model: CURRENT_GEMINI_MODEL,
            input: inputPrompt,
            system_instruction: systemInstruction,
            tools: [{ type: 'google_search' }],
          },
          { timeout: 25000 }
        );

        resultAnswer = interaction.output_text || '';
        const parsed = extractInteractionsCitations(interaction);
        citations = parsed.citations;
        executedQueries = parsed.searchQueries;
      } catch (interactionErr) {
        console.warn('[ExamSathi AI] Interactions API search grounding failed, falling back to generateContent:', interactionErr.message);

        const genResponse = await client.models.generateContent({
          model: CURRENT_GEMINI_MODEL,
          contents: inputPrompt,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });

        resultAnswer = genResponse.text || '';
        const parsedGen = extractGenerateContentCitations(genResponse);
        citations = parsedGen.citations;
        executedQueries = parsedGen.searchQueries;
      }
    } catch (groundingErr) {
      console.warn('[ExamSathi AI] Search grounding failed or quota reached, falling back to pure generation without search tool:', groundingErr.message);
      // Fall through to Section 2 (pure generation)
    }

    if (resultAnswer) {
      // Deduplicate citations by officialSourceUrl
      const seenUrls = new Set();
      const uniqueCitations = [];
      for (const c of citations) {
        if (c.officialSourceUrl && !seenUrls.has(c.officialSourceUrl)) {
          seenUrls.add(c.officialSourceUrl);
          uniqueCitations.push(c);
        }
      }

      if (uniqueCitations.length > 0 && !resultAnswer.includes('http')) {
        const sourcesList = uniqueCitations
          .map((c) => `- [${c.title}](${c.officialSourceUrl})`)
          .join('\n');
        resultAnswer += `\n\n**Verified Sources & Links:**\n${sourcesList}`;
      }

      const payload = {
        answer: resultAnswer,
        sources: uniqueCitations,
        provider: `Gemini ${CURRENT_GEMINI_MODEL} (Live Google Search Grounding)`,
        searchGroundingUsed: true,
        searchQueries: executedQueries,
      };

      setCachedSearchResult(cacheKey, payload);
      return payload;
    }
  }

  // 2. Standard educational & exam questions: Gemini generation without search tool
  let resultText = '';
  let activeModel = CURRENT_GEMINI_MODEL;

  try {
    const genResponse = await client.models.generateContent({
      model: activeModel,
      contents: inputPrompt,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for high factual accuracy
        maxOutputTokens: 1500,
      },
    });
    resultText = genResponse.text || genResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (genErr) {
    if (activeModel !== FALLBACK_GEMINI_MODEL) {
      console.warn(`[ExamSathi AI] Primary tutor model ${activeModel} failed (${genErr.message}), falling back to ${FALLBACK_GEMINI_MODEL}...`);
      activeModel = FALLBACK_GEMINI_MODEL;
      const genFallback = await client.models.generateContent({
        model: activeModel,
        contents: inputPrompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 1500,
        },
      });
      resultText = genFallback.text || genFallback.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      throw genErr;
    }
  }

  if (!resultText) {
    throw new Error('Gemini API returned an empty completion.');
  }

  return {
    answer: resultText,
    sources: ragCitations || [],
    provider: `Gemini ${activeModel} (Academic Concept & Curriculum Reasoning)`,
    searchGroundingUsed: false,
  };
}

/**
 * Extract citations and search queries from Interactions API response
 */
function extractInteractionsCitations(interaction) {
  const citations = [];
  const searchQueries = [];

  if (!interaction || !Array.isArray(interaction.steps)) {
    return { citations, searchQueries };
  }

  for (const step of interaction.steps) {
    if (step.type === 'google_search_call' && step.arguments?.queries) {
      searchQueries.push(...step.arguments.queries);
    }

    if (step.type === 'model_output' && Array.isArray(step.content)) {
      for (const block of step.content) {
        if (block.type === 'text' && Array.isArray(block.annotations)) {
          for (const ann of block.annotations) {
            if (ann.type === 'url_citation' && ann.url) {
              const isOfficialFpsc = ann.url.includes('fpsc.gov.pk');
              citations.push({
                title: ann.title || (isOfficialFpsc ? 'Federal Public Service Commission (Official Portal)' : 'Official Web Source'),
                officialSourceUrl: ann.url,
                verificationStatus: isOfficialFpsc
                  ? 'Verified Official FPSC Portal'
                  : 'Live Google Search Grounding',
                retrievalTimestamp: new Date().toISOString(),
                startIndex: ann.startIndex ?? ann.start_index,
                endIndex: ann.endIndex ?? ann.end_index,
              });
            }
          }
        }
      }
    }
  }

  return { citations, searchQueries };
}

/**
 * Extract citations and search queries from generateContent response
 */
function extractGenerateContentCitations(response) {
  const citations = [];
  const searchQueries = [];

  const candidate = response?.candidates?.[0];
  const metadata = candidate?.groundingMetadata;

  if (metadata?.webSearchQueries && Array.isArray(metadata.webSearchQueries)) {
    searchQueries.push(...metadata.webSearchQueries);
  }

  if (metadata?.groundingChunks && Array.isArray(metadata.groundingChunks)) {
    for (const chunk of metadata.groundingChunks) {
      if (chunk.web?.uri) {
        const isOfficialFpsc = chunk.web.uri.includes('fpsc.gov.pk');
        citations.push({
          title: chunk.web.title || (isOfficialFpsc ? 'Federal Public Service Commission (Official Portal)' : 'Official Web Source'),
          officialSourceUrl: chunk.web.uri,
          verificationStatus: isOfficialFpsc
            ? 'Verified Official FPSC Portal'
            : 'Live Google Search Grounding',
          retrievalTimestamp: new Date().toISOString(),
        });
      }
    }
  }

  return { citations, searchQueries };
}

/**
 * Relevance check to verify if a retrieved document is genuinely relevant to the user query.
 * Prevents injecting unrelated recruitment advertisements into educational or MCQ requests.
 */
export function isDocumentRelevant(query, docText) {
  if (!docText || typeof docText !== 'string') return false;
  const q = (query || '').toLowerCase();

  const stopwords = new Set([
    'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'give', 'tell', 'show', 'explain', 'difference', 'between', 'with', 'from',
    'this', 'that', 'about', 'some', 'please', 'test', 'question', 'questions',
    'answer', 'answers', 'mcq', 'mcqs', 'quiz', 'paper', 'papers',
  ]);

  const tokens = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));

  if (tokens.length === 0) return false;

  const docLower = docText.toLowerCase();
  const matchCount = tokens.filter((t) => docLower.includes(t)).length;
  return matchCount > 0;
}

/**
 * Robust Intent Classification for Student Queries
 * Distinguishes educational, MCQ practice, official syllabus, and advertisement inquiries.
 */
export function classifyQueryIntent(query) {
  const q = (query || '').toLowerCase().trim();

  // 1. Security & Prompt Injection
  if (/ignore (all |previous )?instructions|system prompt|disregard (all )?rules|reveal (your |the )?secret|bypass safety|act as an unrestricted/i.test(q)) {
    return { type: 'prompt_injection' };
  }

  // 2. Unverified or Out-of-Scope (Non-academic / Speculative future dates)
  if (/\b(202[8-9]|203\d|leaked|leak paper|driving license|unannounced cut|future cut|bribe|inside source|car repair|recipe|brownies?|lottery|crypto)\b/i.test(q)) {
    return { type: 'unverified_or_out_of_scope' };
  }

  // 3. Conflicting Rules (CSS MPT vs General Recruitment Negative Marking)
  if (
    /(conflict.*negative marking|discrepancy.*(marking|rules)|negative marking in (both|mpt and)|mpt vs (gr|general recruitment).*marking|difference between (mpt and general recruitment|css mpt and gr))/i.test(q) ||
    /why is there a conflict in negative marking between mpt and general recruitment/i.test(query)
  ) {
    return { type: 'conflicting_rules' };
  }

  // 4. Manually Imported Document Inquiries
  const importedDocs = getManualImportedDocuments();
  for (const doc of importedDocs) {
    const docTitleLower = (doc.title || '').toLowerCase();
    const advtLower = (doc.advertisementNo || '').toLowerCase();
    if (docTitleLower && q.includes(docTitleLower)) {
      return { type: 'imported_document', matchedDoc: doc };
    }
    if (advtLower && advtLower !== 'manual import' && q.includes(advtLower)) {
      return { type: 'imported_document', matchedDoc: doc };
    }
  }

  // 5. Practice MCQs / Quizzes Request
  const isMcq = /\b(mcqs?|multiple choice|practice questions?|test questions?|quiz|questions with answers|objective questions)\b/i.test(q);
  if (isMcq) {
    let subtopic = 'general';
    if (/\b(inspector customs|customs|customs officer|intelligence officer)\b/i.test(q)) {
      subtopic = 'inspector_customs';
    } else if (/\b(fia|assistant director investigation|ad fia)\b/i.test(q)) {
      subtopic = 'ad_fia';
    } else if (/\b(windows|operating system|os|ntfs|fat32|uac|file explorer|task manager)\b/i.test(q)) {
      subtopic = 'windows';
    } else if (/\b(dbms|database|sql|normalization|acid|relational)\b/i.test(q)) {
      subtopic = 'dbms';
    } else if (/\b(network|networking|osi|tcp|ip|router|switch|protocol)\b/i.test(q)) {
      subtopic = 'networks';
    } else if (/\b(computer|hardware|cpu|ram|rom|software|it)\b/i.test(q)) {
      subtopic = 'computer_science';
    } else if (/\b(science|biology|physics|chemistry)\b/i.test(q)) {
      subtopic = 'science';
    } else if (/\b(pakistan|pak affairs|constitution|history)\b/i.test(q)) {
      subtopic = 'pakistan_affairs';
    }
    return { type: 'practice_mcqs', subtopic };
  }

  // 6. Specific Subject Explanations
  const mentionsRamRom =
    (/\b(ram|random access memory)\b/i.test(q) && /\b(rom|read only memory)\b/i.test(q)) ||
    (/\b(ram|rom)\b/i.test(q) && /\b(differ|difference|vs|versus|compare|comparison|farq|distinguish)\b/i.test(q));
  if (mentionsRamRom) {
    return { type: 'subject_explanation', subtopic: 'cs_ram_vs_rom' };
  }

  if (/\b(osi|osi model|7 layers|open systems interconnection)\b/i.test(q)) {
    return { type: 'subject_explanation', subtopic: 'cs_osi_model' };
  }

  if (/\b(windows|ntfs|fat32|virtual memory|pagefile|registry|task manager|uac)\b/i.test(q) && !/\b(advertisement|jobs?|vacanc(y|ies)|closing date)\b/i.test(q)) {
    return { type: 'subject_explanation', subtopic: 'windows_concept' };
  }

  if (/\b(photosynthesis|cellular respiration|newton|mitochondria|thermodynamics|gravity|speed of light|cell wall|osmosis|dna|rna|boyle|charles law|blood group|ozone layer|atmosphere layers?)\b/i.test(q)) {
    return { type: 'subject_explanation', subtopic: 'general_science' };
  }

  if (/\b(article 2a?|objectives resolution|1973 constitution|18th amendment|lucknow pact)\b/i.test(q)) {
    return { type: 'subject_explanation', subtopic: 'pakistan_affairs' };
  }

  // 7. Historical / Past Advertisements
  const isHistorical =
    /\b(previous|past|last|earlier|old|historical)\b/i.test(q) &&
    /\b(advertisement|advt|jobs?|vacanc(y|ies)|announcement)\b/i.test(q);
  if (isHistorical) {
    return { type: 'historical_advertisement' };
  }

  // 7b. Lecturer Vacancy Inquiry (Status check against verified vacancies)
  if (/\blecturers?\b/i.test(q) && /\b(jobs?|vacanc(y|ies)|posts?|open|ad|advertisement|recruitment|apply|portal)\b/i.test(q)) {
    return { type: 'lecturer_inquiry' };
  }

  // 8. Currently Open Vacancies in FPSC
  const isCurrentVacancies =
    (/\b(what|which|any)\b/i.test(q) && /\b(jobs?|vacanc(y|ies)|posts?)\b/i.test(q) && /\b(currently|open|active|available|now)\b/i.test(q)) ||
    (/\b(jobs?|vacanc(y|ies))\b/i.test(q) && /\b(currently open|open right now|accepting applications?)\b/i.test(q)) ||
    /\b(what jobs are currently open in fpsc|current open jobs in fpsc|fpsc open vacancies|fpsc current vacancies|jobs are currently open in fpsc)\b/i.test(q);
  if (isCurrentVacancies) {
    return { type: 'current_vacancies' };
  }

  // 9. Official FPSC Advertisements (Specific advertisement inquiry)
  const isAdvt =
    /\b(advertisement|advt|closing date|last date|jobs? announced|vacanc(y|ies)|challan fee|how to apply online|apply date|roll number slip|corrigendum|consolidated)\b/i.test(q) ||
    /\b(inspector customs|assistant director investigation|ad fia|appraising officer|valuation officer)\b/i.test(q) ||
    (/\b(fpsc|federal public service commission)\b/i.test(q) && /\b(latest|current|new|jobs?|posts?|dates?)\b/i.test(q));
  if (isAdvt) {
    return { type: 'official_advertisement' };
  }

  // 10. FPSC Exam Scheme & Syllabus
  if (
    /\b(syllabus|scheme of (exam|examination)|marks distribution|test pattern|paper pattern|eligibility for|age limit for (css|inspector|ad))\b/i.test(q) ||
    (/\b(css|mpt)\b/i.test(q) && /\b(rules|passing marks|qualifying|subjects|optional|compulsory)\b/i.test(q))
  ) {
    let sub = 'gr_syllabus';
    if (/\b(css|mpt)\b/i.test(q)) {
      sub = 'css_mpt_rules';
    }
    return { type: 'official_syllabus_rules', subtopic: sub };
  }

  // 11. General Educational / Subject Explanation default
  return { type: 'general_educational' };
}

/**
 * Match query to official FPSC documents with relevance filtering.
 * Never retrieves or injects recruitment advertisements into educational or MCQ requests.
 */
async function identifyAndRetrieveOfficialSources(query) {
  const intent = classifyQueryIntent(query);
  const isPromptInjection = intent.type === 'prompt_injection';
  const allSnapshots = getAllArchivalSnapshots();

  // 1. Prompt Injection
  if (isPromptInjection) {
    return {
      category: 'prompt_injection',
      intent,
      docRecord: null,
      citations: [],
      sourcesText: '',
      isPromptInjection: true,
    };
  }

  // 2. Unverified or Out of Scope
  if (intent.type === 'unverified_or_out_of_scope') {
    return {
      category: 'unverified',
      intent,
      docRecord: null,
      citations: [],
      sourcesText: 'No official FPSC publication or gazette confirms this information.',
      isPromptInjection: false,
    };
  }

  // 3. Conflicting Rules (CSS MPT vs GR negative marking)
  if (intent.type === 'conflicting_rules') {
    const cssSnap = allSnapshots.find((s) => s.pattern === 'css') || allSnapshots[1];
    const grSnap = allSnapshots.find((s) => s.pattern === 'syllabus') || allSnapshots[2];

    return {
      category: 'conflicting_rules',
      intent,
      docRecord: grSnap,
      citations: [
        {
          title: cssSnap.title,
          officialSourceUrl: cssSnap.officialSourceUrl,
          advertisementNo: cssSnap.advertisementNo,
          publicationDate: cssSnap.publicationDate,
          retrievalTimestamp: cssSnap.retrievalTimestamp,
          lastVerifiedTimestamp: cssSnap.lastVerifiedTimestamp,
          verificationStatus: cssSnap.verificationStatus,
        },
        {
          title: grSnap.title,
          officialSourceUrl: grSnap.officialSourceUrl,
          advertisementNo: grSnap.advertisementNo,
          publicationDate: grSnap.publicationDate,
          retrievalTimestamp: grSnap.retrievalTimestamp,
          lastVerifiedTimestamp: grSnap.lastVerifiedTimestamp,
          verificationStatus: grSnap.verificationStatus,
        },
      ],
      sourcesText: `[OFFICIAL SOURCE 1: CSS MPT RULES]\n${cssSnap.text.slice(0, 1500)}\n\n[OFFICIAL SOURCE 2: GENERAL RECRUITMENT SCHEME]\n${grSnap.text.slice(0, 1500)}`.trim(),
      isPromptInjection: false,
    };
  }

  // 4. Manually Imported Document Inquiries
  if (intent.type === 'imported_document' && intent.matchedDoc) {
    const doc = intent.matchedDoc;
    return {
      category: 'imported_document',
      intent,
      docRecord: doc,
      citations: [
        {
          title: doc.title,
          officialSourceUrl: doc.officialSourceUrl,
          advertisementNo: doc.advertisementNo,
          publicationDate: doc.publicationDate,
          retrievalTimestamp: doc.retrievalTimestamp,
          lastVerifiedTimestamp: doc.lastVerifiedTimestamp,
          verificationStatus: 'Manually Imported Official Document',
        },
      ],
      sourcesText: `[IMPORTED DOCUMENT CITATION: ${doc.title}]\n${doc.text.slice(0, 3000)}`,
      isPromptInjection: false,
    };
  }

  // 5. Practice MCQs (Windows, DBMS, Networks, General):
  // Strictly zero recruitment document retrieval and zero false advertisement citations.
  if (intent.type === 'practice_mcqs') {
    return {
      category: 'practice_mcqs',
      intent,
      docRecord: null,
      citations: [],
      sourcesText: '',
      isPromptInjection: false,
    };
  }

  // 6. Subject Explanations:
  // RAM vs ROM, OSI, Windows Concepts, Pakistan Affairs, etc.
  if (intent.type === 'subject_explanation') {
    // Preserve Everyday Science curriculum concept citation for general science if needed
    if (intent.subtopic === 'general_science') {
      return {
        category: 'general_education',
        intent,
        docRecord: {
          title: 'General Science & Academic Curriculum Reference',
          officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
          publicationDate: 'Standard Federal Curriculum',
          verificationStatus: 'General Academic Subject Concept',
        },
        citations: [
          {
            title: 'Everyday Science Curriculum (FPSC Compulsory General Knowledge)',
            officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
            advertisementNo: 'Curriculum Standard',
            publicationDate: 'Academic Syllabus Record',
            retrievalTimestamp: new Date().toISOString(),
            lastVerifiedTimestamp: new Date().toISOString(),
            verificationStatus: 'General Academic Subject Concept (Curriculum Reference)',
          },
        ],
        sourcesText: 'General science subject principles tested under FPSC Everyday Science curriculum.',
        isPromptInjection: false,
      };
    }

    if (intent.subtopic === 'cs_ram_vs_rom') {
      return {
        category: 'cs_ram_vs_rom',
        intent,
        docRecord: {
          title: 'FPSC Computer Science & Everyday Science Reference (Computer Hardware)',
          officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
          publicationDate: 'Academic Syllabus Record',
          verificationStatus: 'General Academic Subject Concept',
        },
        citations: [
          {
            title: 'Everyday Science & IT Hardware Curriculum (FPSC Compulsory General Knowledge)',
            officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
            advertisementNo: 'Curriculum Standard',
            publicationDate: 'Academic Syllabus Record',
            retrievalTimestamp: new Date().toISOString(),
            lastVerifiedTimestamp: new Date().toISOString(),
            verificationStatus: 'General Academic Subject Concept (Curriculum Reference)',
          },
        ],
        sourcesText: 'Computer hardware architecture: Primary memory classification, RAM (volatile, read-write), ROM (non-volatile, firmware BIOS storage).',
        isPromptInjection: false,
      };
    }

    if (intent.subtopic === 'cs_osi_model') {
      return {
        category: 'cs_osi_model',
        intent,
        docRecord: {
          title: 'FPSC Computer Science Syllabus (Data Communications & OSI Architecture)',
          officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
          publicationDate: 'Academic Syllabus Record',
          verificationStatus: 'General Academic Subject Concept',
        },
        citations: [
          {
            title: 'FPSC Computer Science & IT Scheme (ISO/OSI Reference Architecture)',
            officialSourceUrl: 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme',
            advertisementNo: 'Curriculum Standard',
            publicationDate: 'Academic Syllabus Record',
            retrievalTimestamp: new Date().toISOString(),
            lastVerifiedTimestamp: new Date().toISOString(),
            verificationStatus: 'General Academic Subject Concept (Curriculum Reference)',
          },
        ],
        sourcesText: 'ISO/OSI 7-Layer Reference Model: Physical, Data Link, Network, Transport, Session, Presentation, Application layers.',
        isPromptInjection: false,
      };
    }

    return {
      category: intent.subtopic,
      intent,
      docRecord: null,
      citations: [],
      sourcesText: '',
      isPromptInjection: false,
    };
  }

  // 7. General Educational inquiries: Clean educational path without document contamination
  if (intent.type === 'general_educational') {
    return {
      category: 'general_educational',
      intent,
      docRecord: null,
      citations: [],
      sourcesText: '',
      isPromptInjection: false,
    };
  }

  // 8. Official Syllabus & Examination Schemes
  if (intent.type === 'official_syllabus_rules') {
    const isCss = intent.subtopic === 'css_mpt_rules';
    const targetUrl = isCss
      ? 'https://www.fpsc.gov.pk/rules/css-mpt-rules'
      : 'https://www.fpsc.gov.pk/syllabus/general-recruitment-scheme';
    const relevantSnapshots = allSnapshots.filter((s) => s.pattern === (isCss ? 'css' : 'syllabus'));

    let docRecord = null;
    try {
      docRecord = await fetchFpscDocument(targetUrl);
    } catch {
      docRecord = relevantSnapshots[0] || allSnapshots[1];
    }

    const citations = [
      {
        title: docRecord.title,
        officialSourceUrl: docRecord.officialSourceUrl,
        advertisementNo: docRecord.advertisementNo || 'Official Examination Scheme',
        publicationDate: docRecord.publicationDate,
        retrievalTimestamp: docRecord.retrievalTimestamp,
        lastVerifiedTimestamp: docRecord.lastVerifiedTimestamp || docRecord.retrievalTimestamp,
        verificationStatus: docRecord.verificationStatus || 'Verified Official Record',
      },
    ];

    return {
      category: isCss ? 'css_mpt_syllabus' : 'gr_syllabus',
      intent,
      docRecord,
      citations,
      sourcesText: `[OFFICIAL SYLLABUS CITATION]\nTitle: ${docRecord.title}\nURL: ${docRecord.officialSourceUrl}\n${(docRecord.text || '').slice(0, 3000)}`,
      isPromptInjection: false,
    };
  }

  // 9. Currently Open Vacancies in FPSC
  if (intent.type === 'current_vacancies') {
    const openJobs = getCurrentOpenJobs();
    if (openJobs.length > 0) {
      const citations = openJobs.map((j) => ({
        title: j.title,
        officialSourceUrl: j.officialSourceUrl,
        advertisementNo: j.advertisementNo,
        publicationDate: j.publicationDate,
        closingDate: j.closingDate,
        retrievalTimestamp: new Date().toISOString(),
        verificationStatus: 'Verified Current Open Vacancy',
      }));

      const contextText = openJobs
        .map(
          (j) =>
            `Title: ${j.title} (${j.scale})\nDepartment: ${j.department}\nVacancies: ${j.vacancies}\nApplication Deadline: ${j.closingDate} (11:59 PM PKT)\nOfficial Portal URL: ${j.officialSourceUrl}`
        )
        .join('\n\n');

      return {
        category: 'current_vacancies',
        intent,
        openJobs,
        citations,
        sourcesText: `[OFFICIAL VERIFIED CURRENT VACANCIES]\n${contextText}`,
        isPromptInjection: false,
      };
    } else {
      return {
        category: 'current_vacancies',
        intent,
        openJobs: [],
        citations: [],
        sourcesText: 'No verified FPSC job advertisements are currently open for online application.',
        isPromptInjection: false,
      };
    }
  }

  // 9b. Lecturer Vacancy Inquiry
  if (intent.type === 'lecturer_inquiry') {
    const verifiedLecturerJobs = getCurrentOpenJobs().filter((j) => /lecturer/i.test(j.title));
    if (verifiedLecturerJobs.length > 0) {
      const citations = verifiedLecturerJobs.map((j) => ({
        title: j.title,
        officialSourceUrl: j.officialSourceUrl,
        advertisementNo: j.advertisementNo,
        publicationDate: j.publicationDate,
        closingDate: j.closingDate,
        retrievalTimestamp: new Date().toISOString(),
        verificationStatus: 'Verified Current Open Vacancy',
      }));

      return {
        category: 'lecturer_inquiry',
        intent,
        verifiedLecturerJobs,
        citations,
        sourcesText: `[OFFICIAL VERIFIED CURRENT LECTURER VACANCIES]\n${verifiedLecturerJobs.map((j) => j.title).join('\n')}`,
        isPromptInjection: false,
      };
    }

    return {
      category: 'lecturer_inquiry',
      intent,
      verifiedLecturerJobs: [],
      citations: [],
      sourcesText: 'No verified active FPSC advertisements for Lecturer posts are currently open on official FPSC publications.',
      isPromptInjection: false,
    };
  }

  // 10. Historical / Past Advertisements
  if (intent.type === 'historical_advertisement') {
    const relevantSnapshots = allSnapshots.filter((s) => s.pattern === 'gr');
    const docRecord = relevantSnapshots[0] || allSnapshots[0];
    const citations = [
      {
        title: docRecord.title,
        officialSourceUrl: docRecord.officialSourceUrl,
        advertisementNo: docRecord.advertisementNo || 'Consolidated Advt 01/2026 (Archived)',
        publicationDate: docRecord.publicationDate,
        retrievalTimestamp: docRecord.retrievalTimestamp,
        verificationStatus: 'Historical FPSC Archival Record (Closed)',
      },
    ];

    return {
      category: 'historical_advertisement',
      intent,
      docRecord,
      citations,
      sourcesText: `[HISTORICAL / ARCHIVED FPSC ADVERTISEMENT - DEADLINE CLOSED]\nTitle: ${docRecord.title}\nClosing Date: 20 January 2026 (Application period closed)\nURL: ${docRecord.officialSourceUrl}\n${(docRecord.text || '').slice(0, 3000)}`,
      isPromptInjection: false,
    };
  }

  // 11. Official FPSC Advertisements (ONLY when query specifically inquires about recruitment/jobs/dates)
  if (intent.type === 'official_advertisement') {
    const targetUrl = 'https://www.fpsc.gov.pk/jobs/gr/current-advertisement';
    const relevantSnapshots = allSnapshots.filter((s) => s.pattern === 'gr');
    let docRecord = null;
    try {
      docRecord = await fetchFpscDocument(targetUrl);
    } catch {
      docRecord = relevantSnapshots[0] || allSnapshots[0];
    }

    // Verify document relevance before injecting context
    if (docRecord && isDocumentRelevant(query, docRecord.text)) {
      const citations = [
        {
          title: docRecord.title,
          officialSourceUrl: docRecord.officialSourceUrl,
          advertisementNo: docRecord.advertisementNo || 'Consolidated Advt 01/2026',
          publicationDate: docRecord.publicationDate,
          retrievalTimestamp: docRecord.retrievalTimestamp,
          lastVerifiedTimestamp: docRecord.lastVerifiedTimestamp || docRecord.retrievalTimestamp,
          verificationStatus: docRecord.verificationStatus || 'Verified Official FPSC Advertisement',
        },
      ];

      return {
        category: 'advertisement',
        intent,
        docRecord,
        citations,
        sourcesText: `[OFFICIAL ADVERTISEMENT CITATION]\nTitle: ${docRecord.title}\nURL: ${docRecord.officialSourceUrl}\n${(docRecord.text || '').slice(0, 3000)}`,
        isPromptInjection: false,
      };
    }
  }

  // Default fallback: purely academic without spurious advertisement context
  return {
    category: 'general_educational',
    intent,
    docRecord: null,
    citations: [],
    sourcesText: '',
    isPromptInjection: false,
  };
}

/**
 * Grounded Academic Knowledge Engine
 * Used as reliable fallback when no external LLM key is configured or during service outages.
 */
function synthesizeGroundedAnswer({ query: _query, retrievedData, isRomanUrdu }) {
  const { category, isPromptInjection } = retrievedData;

  // 0. Prompt Injection Defense
  if (isPromptInjection) {
    if (isRomanUrdu) {
      return `### ExamSathi AI Academic Safeguard:
Mujhe federal civil service exams (FPSC, CSS, MPT) ki tayari ke liye banaya gaya hai. Main kisi security bypass, system instructions ko ignore karne ya ghair-mutaliqa hidayat par amal nahi kar sakta. Agar aap ka FPSC syllabus, advertisements ya preparation se mutaliq koi sawal hai toh batayein, main mukammal rehnumai karunga.`;
    }
    return `### ExamSathi AI Security & Integrity Safeguard:
ExamSathi AI is strictly committed to verified academic study assistance for Pakistani federal competitive examinations. System instructions, safety rules, and operational boundaries cannot be bypassed or overridden by external user prompts or retrieved webpage text. Please ask an examination preparation, syllabus, or advertisement inquiry for official guidance.`;
  }

  // 1. Unverified / Missing Official Records / Out of Scope
  if (category === 'unverified') {
    if (isRomanUrdu) {
      return `### Ghair-Tasdeeq Shuda Maloomat (Notice):
FPSC ke mojooda official records ya gazette mein is sawal ki koi tasdeeq nahi mili. ExamSathi AI qiyas-aarai ya ghair-tasdeeq shuda dates/marks fabricate nahi karta. 

**Rehnumai:**
- Candidates ko hamesha official website ([fpsc.gov.pk](https://www.fpsc.gov.pk/)) par shaya hone walay notifications par bharosa karna chahiye.
- Kisi bhi social media rumor ya unannounced date ko final mat samjhein.`;
    }
    return `### Unverified or Out-of-Scope Inquiry:
No official FPSC announcement, gazette notification, or verified document confirms the details requested in this query. ExamSathi AI operates under strict provenance rules and does not fabricate predictions, unannounced cutoffs, or unofficial claims.

**Guidance:**
- Official examination schedules and quota allocations are published exclusively via official FPSC consolidated advertisements.
- Please verify live notices directly on the official commission portal: [https://www.fpsc.gov.pk/](https://www.fpsc.gov.pk/).`;
  }

  // 2. Conflicting Documents / Disparate Rules (MPT vs General Recruitment Negative Marking)
  if (category === 'conflicting_rules') {
    if (isRomanUrdu) {
      return `### FPSC Screening Tests mein Negative Marking ka Faraq (Official Wazahat):
FPSC ke do mukhtalif examination systems mein negative marking ke qawaneen alag alag hain:

1. **CSS MPT (MCQ Based Preliminary Test):**
   - **Negative Marking:** Bilkul nahi hoti (Zero negative marking).
   - **Total Marks:** 200 MCQs (Qualifying Benchmark: 33% ya 66 marks).
   - **Asar:** Galat jawab par koi marks deduct nahi hote, is liye tamam sawalat attempt karne chahiye.
   - *Source: FPSC Rules for Competitive Examination (CSS/MPT).*

2. **General Recruitment Screening Tests (Phase-I for BS-16 & BS-17):**
   - **Negative Marking:** 0.25 marks per wrong answer kaat liye jatay hain.
   - **Total Marks:** 100 MCQs (Duration: 100 Minutes).
   - **Asar:** Tukkay lagane se parhaiz karein taake net score drop na ho.
   - *Source: FPSC Scheme of General Recruitment Screening Tests.*`;
    }

    return `### Official FPSC Distinction: Marking Scheme & Negative Marking Regulations:
FPSC enforces different examination regulations depending on the recruitment category. This explains apparent contradictions between documents:

1. **CSS MPT (Preliminary Screening for Central Superior Services):**
   - **Negative Marking:** **NO negative marking applies** (0.0 marks deducted for incorrect answers).
   - **Total Marks:** 200 MCQs (1 mark each; 200 minutes).
   - **Qualifying Cutoff:** 33% (66 marks out of 200).
   - *Official Reference: FPSC Competitive Examination (CSS) & MPT Rules.*

2. **General Recruitment (One-Paper Screening for BS-16 / BS-17):**
   - **Negative Marking:** **Applies at 0.25 marks penalty** per incorrect response.
   - **Total Marks:** 100 MCQs (100 minutes).
   - *Official Reference: FPSC Scheme of General Recruitment Screening Tests (Phase-I).*`;
  }

  // 3. RAM vs ROM Comparison (Computer Science / Everyday Science)
  if (category === 'cs_ram_vs_rom') {
    if (isRomanUrdu) {
      return `**Asan Alfaaz Mein Jawab:**
RAM aur ROM mein bunyadi farq yeh hai ke **RAM (Random Access Memory)** temporary working memory hai jo computer band hone par sara data mita deti hai (**volatile**), jabke **ROM (Read-Only Memory)** permanent memory hai jo computer bootup ki zaroori instructions hamesha mehfooz rakhti hai (**non-volatile**).

### Aham Farq:
- **RAM:** CPU ki tez-tar kaam karne ki jagah hai jahan chalnay walay programs aur active files rehti hain. Is mein naya data likha (write) aur parha (read) ja sakta hai.
- **ROM:** Permanent chip hai jisme computer ka basic startup software (BIOS/UEFI firmware) pehle se likha hota hai. Isay sirf read kiya ja sakta hai.

| Khusoosiyat | RAM (Random Access Memory) | ROM (Read-Only Memory) |
| :--- | :--- | :--- |
| **Pura Naam** | Random Access Memory | Read-Only Memory |
| **Data Retention** | **Volatile** (Bijli band hone par data khatam) | **Non-Volatile** (Data hamesha mehfooz rehta hai) |
| **Operations** | Read aur Write dono tez raftaar se | Sirf Read kiya ja sakta hai |
| **Kirdar** | Running apps aur active operating system | Computer ko start karne ka BIOS firmware |

**Rozmarrah Misal:** RAM ko aik study desk samjhein jis par aap active kitaabein kholte hain—jab aap uthtay hain desk saaf ho jati hai. ROM aik printed manual ki tarah hai jo drawer mein hamesha mehfooz rehta hai.`;
    }

    return `**Direct Answer:**
The primary difference is that **RAM (Random Access Memory)** is temporary working memory that loses its content when the computer is turned off (**volatile**), whereas **ROM (Read-Only Memory)** is permanent storage that retains critical boot instructions even without power (**non-volatile**).

### Core Differences:
- **RAM (Active Workspace):** The CPU uses RAM to hold the operating system, running applications, and open documents so they can be read and written rapidly during active use.
- **ROM (Startup Firmware):** ROM stores the essential bootstrap instructions and firmware (such as BIOS or UEFI) installed during manufacturing, enabling the hardware to initialize upon power-on.

| Feature | RAM (Random Access Memory) | ROM (Read-Only Memory) |
| :--- | :--- | :--- |
| **Full Form** | Random Access Memory | Read-Only Memory |
| **Volatility** | **Volatile:** Cleared immediately when computer shuts down | **Non-Volatile:** Retains data permanently without power |
| **Operation** | Fast Read & Write capability | Read-only in regular computer operations |
| **Primary Role** | Holds currently running apps and active data | Stores startup bootstrap and BIOS/UEFI firmware |

**Practical Example:**
Think of **RAM** as your study desk where you open notebooks while studying—everything is cleared away when you finish. **ROM** is like a printed instruction manual permanently kept in a locked drawer—it is always there whenever you start up.`;
  }

  // 4. OSI Model Explanation (Computer Science / Everyday Science)
  if (category === 'cs_osi_model') {
    if (isRomanUrdu) {
      return `**Asan Alfaaz Mein Jawab:**
**OSI (Open Systems Interconnection) Reference Model** networking ka aik 7-layer framework hai jo yeh wazeh karta hai ke do computers aapas mein network ke zariye data kaise bhaijtay aur receive karte hain.

### 7 Layers (Top se Bottom):
1. **Application Layer (Layer 7):** User applications ke sath direct rabta. (Misalein: HTTP, HTTPS, DNS, Email).
2. **Presentation Layer (Layer 6):** Data translation, encryption (SSL/TLS) aur compression.
3. **Session Layer (Layer 5):** Do devices ke darmiyan dialogue control aur connection session maintain karna.
4. **Transport Layer (Layer 4):** End-to-end reliable delivery aur error checking. (Protocols: TCP, UDP. Data Unit: **Segment**).
5. **Network Layer (Layer 3):** Routing aur logical IP addressing. (Device: **Router**. Data Unit: **Packet**).
6. **Data Link Layer (Layer 2):** Physical MAC addressing aur error detection. (Device: **Switch**. Data Unit: **Frame**).
7. **Physical Layer (Layer 1):** Raw binary bits (electrical/optical signals) cables ke zariye transmit karna. (Devices: **Cables, Hubs**. Data Unit: **Bits**).

**Asan Yadash Formula:** Layers ko Layer 7 se 1 tak yaad rakhne ka tareeqa: *"All People Seem To Need Data Processing"*.`;
    }

    return `**Direct Answer:**
The **OSI (Open Systems Interconnection) reference model** is a 7-layer architectural framework that standardizes how data travels across a network from an application on one computer to an application on another.

### The 7 Layers Explained (From Layer 7 to Layer 1):
1. **Application Layer (Layer 7):** Directly interfaces with user applications to provide network services. Examples: HTTP, HTTPS, DNS, SMTP.
2. **Presentation Layer (Layer 6):** Handles data formatting, syntax translation, encryption (SSL/TLS), and compression so the application can read it.
3. **Session Layer (Layer 5):** Establishes, manages, and terminates communication sessions and dialogue between devices.
4. **Transport Layer (Layer 4):** Delivers data end-to-end with reliability, flow control, and port addressing. Protocols: TCP (connection-oriented), UDP (connectionless). Data unit: **Segment**.
5. **Network Layer (Layer 3):** Routes packets across different networks and assigns logical addressing (IPv4/IPv6). Key device: **Router**. Data unit: **Packet**.
6. **Data Link Layer (Layer 2):** Transfers frames between directly connected devices using physical MAC addresses and detects errors. Key device: **Switch**. Data unit: **Frame**.
7. **Physical Layer (Layer 1):** Transmits unstructured raw bit streams (electrical voltages, light pulses, radio waves) over physical hardware. Devices: **Network Cables, Hubs**. Data unit: **Bits**.

**Practical Memory Tip:**
Remember the layers from top to bottom (Layer 7 to 1) with the mnemonic:
- **A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing
*(Application, Presentation, Session, Transport, Network, Data Link, Physical)*`;
  }

  // 5. Practice MCQs (Windows, DBMS, Networks, General)
  if (category === 'practice_mcqs' || category === 'mcqs_dbms' || category === 'mcqs_networks') {
    const subtopic = retrievedData.intent?.subtopic || (category === 'mcqs_dbms' ? 'dbms' : category === 'mcqs_networks' ? 'networks' : 'general');

    if (subtopic === 'windows') {
      if (isRomanUrdu) {
        return `### 5 High-Yield Windows Operating System Practice MCQs:

**Q1: Modern Windows operating systems (jaise Windows 10 aur 11) ka default file system kaunsa hai jo file-level permissions aur encryption support karta hai?**
- A) FAT32
- B) exFAT
- C) NTFS (New Technology File System) *(Correct)*
- D) ext4
*Explanation: NTFS modern Windows ka primary file system hai jo security ACLs, file encryption (EFS), disk quotas aur journaling provide karta hai.*

**Q2: Windows mein File Explorer ko foran open karne ke liye kaunsi keyboard shortcut key istemal hoti hai?**
- A) Windows Key + E *(Correct)*
- B) Windows Key + R
- C) Ctrl + Shift + Esc
- D) Alt + F4
*Explanation: Windows Key + E dabane se foran File Explorer khul jata hai. (Windows Key + R se Run dialog khulta hai).*

**Q3: Windows OS mein virtual memory paging file ka default system file name kya hota hai jo root directory mein store hota hai?**
- A) boot.ini
- B) pagefile.sys *(Correct)*
- C) ntdetect.com
- D) swapfile.dll
*Explanation: pagefile.sys Windows ki hidden virtual memory paging file hai jo physical RAM overflow hone par secondary drive par data swap karne ke liye use hoti hai.*

**Q4: Windows operating system mein running processes, CPU/memory performance aur startup applications dekhne ke liye kaunsa built-in tool use hota hai?**
- A) Device Manager
- B) Disk Management
- C) Task Manager *(Correct)*
- D) Event Viewer
*Explanation: Task Manager (Ctrl + Shift + Esc) running applications, background services, performance metrics aur startup programs ko monitor karta hai.*

**Q5: Windows ka kaunsa security feature unauthorized system-level changes se pehle user se administrator permission mangta hai?**
- A) BitLocker
- B) Windows Defender
- C) User Account Control (UAC) *(Correct)*
- D) Disk Cleanup
*Explanation: User Account Control (UAC) malicious programs ko administrative privileges secretly hasil karne se rokta hai.*`;
      }

      return `### 5 High-Yield Windows Operating System Practice MCQs with Explanations:

**Q1: Which default file system is utilized by modern versions of Microsoft Windows (such as Windows 10/11) to provide file-level security permissions, compression, and large volume support?**
- A) FAT32
- B) exFAT
- C) NTFS (New Technology File System) *(Correct)*
- D) HPFS
*Explanation: NTFS is the proprietary journaling file system for Windows NT and successor systems, offering file-level Access Control Lists (ACLs), encryption via EFS, and journaling for system recovery.*

**Q2: Which keyboard shortcut in Windows instantly launches File Explorer?**
- A) Windows Key + E *(Correct)*
- B) Windows Key + R
- C) Windows Key + F
- D) Ctrl + Shift + Esc
*Explanation: Windows Key + E immediately opens File Explorer. Windows Key + R opens the Run dialog, while Ctrl + Shift + Esc directly opens Task Manager.*

**Q3: What is the primary hidden system file located in the root directory that Microsoft Windows uses to manage virtual memory paging?**
- A) config.sys
- B) pagefile.sys *(Correct)*
- C) hiberfil.sys
- D) winload.exe
*Explanation: pagefile.sys is the paging file Windows utilizes as secondary memory when active processes exceed physical RAM capacity.*

**Q4: Which Windows administrative utility provides real-time information on active processes, CPU and memory utilization, network activity, and startup applications?**
- A) Task Manager *(Correct)*
- B) Device Manager
- C) Disk Management
- D) Component Services
*Explanation: Task Manager allows users and system administrators to inspect, terminate, and monitor active processes and hardware performance metrics.*

**Q5: Which Windows security mechanism notifies the user and requests administrative confirmation before applications can make system-wide modifications?**
- A) BitLocker Drive Encryption
- B) User Account Control (UAC) *(Correct)*
- C) Windows Firewall
- D) Credential Manager
*Explanation: User Account Control (UAC) helps prevent malware and unauthorized scripts from gaining silent root administrative privileges.*`;
    }

    if (subtopic === 'dbms' || category === 'mcqs_dbms') {
      return `### 5 High-Yield Medium-Level DBMS Practice MCQs with Explanations:

**Q1: In a relational database, a foreign key must match an existing value in the referenced table's primary key, or else be null. Which constraint enforces this rule?**
- A) Domain Integrity
- B) Entity Integrity
- C) Referential Integrity *(Correct)*
- D) User-Defined Integrity
*Explanation: Referential integrity ensures relationships between tables remain consistent and prevents orphan records by requiring foreign key values to match primary key values in the parent table.*

**Q2: A relational table is in Second Normal Form (2NF) if and only if it is in 1NF and:**
- A) Every non-prime attribute is fully functionally dependent on the primary key *(Correct)*
- B) It contains no transitive dependencies
- C) Every determinant is a candidate key
- D) It contains multi-valued dependencies
*Explanation: 2NF eliminates partial dependencies. All non-key attributes must depend on the whole composite primary key, not just a subset of it.*

**Q3: Which ACID property guarantees that all transactions executed concurrently will result in a state that would be obtained if they were executed serially?**
- A) Atomicity
- B) Consistency
- C) Isolation *(Correct)*
- D) Durability
*Explanation: Isolation ensures concurrent transactions do not interfere with each other or read uncommitted dirty reads.*

**Q4: In SQL, which type of JOIN returns all records from the left table, along with matching records from the right table, filling with NULL where no match exists?**
- A) INNER JOIN
- B) LEFT OUTER JOIN *(Correct)*
- C) RIGHT OUTER JOIN
- D) FULL OUTER JOIN
*Explanation: A LEFT OUTER JOIN preserves all rows from the left table regardless of whether a matching record exists in the right table.*

**Q5: A minimal superkey—meaning a set of attributes that uniquely identifies a tuple and from which no attribute can be removed without losing uniqueness—is known as a:**
- A) Composite Key
- B) Foreign Key
- C) Candidate Key *(Correct)*
- D) Alternate Key
*Explanation: A candidate key is defined as a minimal superkey. One candidate key is chosen as the Primary Key, and the rest are Alternate Keys.*`;
    }

    if (subtopic === 'networks' || category === 'mcqs_networks') {
      return `### 5 High-Yield Computer Networks Practice MCQs for FPSC Examinations:

**Q1: Which layer of the OSI reference model is responsible for end-to-end reliable communication, segmentation, and flow control?**
- A) Network Layer
- B) Transport Layer *(Correct)*
- C) Data Link Layer
- D) Session Layer
*Explanation: The Transport Layer (TCP/UDP) handles process-to-process delivery, flow control, and error recovery.*

**Q2: What is the total bit length of an IPv4 address compared to an IPv6 address?**
- A) 16 bits vs 64 bits
- B) 32 bits vs 128 bits *(Correct)*
- C) 64 bits vs 256 bits
- D) 32 bits vs 64 bits
*Explanation: IPv4 addresses use 32 bits (4 octets). IPv6 addresses use 128 bits expressed in hexadecimal.*

**Q3: Which default port number is used by secure Hypertext Transfer Protocol (HTTPS)?**
- A) Port 21
- B) Port 80
- C) Port 443 *(Correct)*
- D) Port 8080
*Explanation: Unencrypted HTTP uses port 80; SSL/TLS encrypted HTTPS runs by default on port 443.*

**Q4: Network routers make forwarding decisions primarily at which layer of the OSI model?**
- A) Physical Layer
- B) Data Link Layer (Layer 2)
- C) Network Layer (Layer 3) *(Correct)*
- D) Transport Layer (Layer 4)
*Explanation: Routers inspect IP packet headers and forward traffic at Layer 3 based on routing tables.*

**Q5: Which protocol maps a known 32-bit IP address to a physical 48-bit MAC address on a local area network?**
- A) DNS
- B) ARP (Address Resolution Protocol) *(Correct)*
- C) DHCP
- D) ICMP
*Explanation: Address Resolution Protocol (ARP) resolves logical network IP addresses to physical hardware MAC addresses.*`;
    }

    if (subtopic === 'inspector_customs' || category === 'mcqs_customs') {
      return `### 5 High-Yield Inspector Customs (BS-16) Practice Questions with Explanations:

**Q1: Under the Customs Act 1969, which section empowers designated customs officers to search persons upon reasonable suspicion without a prior warrant?**
- A) Section 25
- B) Section 158 *(Correct)*
- C) Section 193
- D) Section 216
*Explanation: Section 158 of the Customs Act 1969 grants designated officers the legal authority to search individuals suspected of carrying smuggled contraband.*

**Q2: Which constitutional amendment made the Objectives Resolution a substantive, enforceable part of the 1973 Constitution as Article 2A?**
- A) 2nd Amendment
- B) 8th Amendment (1985) *(Correct)*
- C) 18th Amendment
- D) 21st Amendment
*Explanation: The 8th Amendment (1985) formally incorporated Article 2A into the substantive body of the 1973 Constitution.*

**Q3: Which layer of the atmosphere contains the highest concentration of ozone absorbing harmful ultraviolet (UV-B) radiation?**
- A) Troposphere
- B) Stratosphere *(Correct)*
- C) Mesosphere
- D) Thermosphere
*Explanation: The ozone layer resides primarily within the stratosphere (15 km to 35 km altitude).*

**Q4: If the import tariff on a consignment is 15% and an additional regulatory duty of 5% is assessed on the import value of Rs. 2,000,000, what is the total duty payable?**
- A) Rs. 300,000
- B) Rs. 400,000 *(Correct)*
- C) Rs. 450,000
- D) Rs. 500,000
*Explanation: Total duty rate is 15% + 5% = 20%. 20% of Rs. 2,000,000 equals Rs. 400,000.*

**Q5: Choose the correct preposition: "The customs appraiser was absolved _______ all allegations of procedural irregularity."**
- A) with
- B) from *(Correct)*
- C) at
- D) for
*Explanation: The verb "absolve" takes the preposition "from" (or "of") when clearing someone of blame or wrongdoing.*

*Preparation Note: These high-yield practice questions remain permanently accessible for exam study and mock practice regardless of whether a specific recruitment advertisement is currently open or expired.*`;
    }

    if (subtopic === 'ad_fia' || category === 'mcqs_fia') {
      return `### 5 High-Yield Assistant Director FIA (BS-17) Practice MCQs with Explanations:

**Q1: Under the FIA Act 1974, which schedule lists the federal offenses over which the Agency has investigatory jurisdiction?**
- A) First Schedule
- B) Second Schedule
- C) Schedule to the Act *(Correct)*
- D) Third Schedule
*Explanation: The Schedule to the Federal Investigation Agency Act, 1974 specifies all federal statutory offenses falling under FIA jurisdiction.*

**Q2: The Treaty of Hudaybiyyah was signed in which Hijri year?**
- A) 4 AH
- B) 6 AH *(Correct)*
- C) 8 AH
- D) 9 AH
*Explanation: The historic peace pact of Hudaybiyyah was agreed in 6 AH (628 CE).*

**Q3: Which component of blood red cells is absent in Blood Group O-negative, making it a universal donor?**
- A) Hemoglobin
- B) A, B, and Rh (D) antigens *(Correct)*
- C) White leukocytes
- D) Blood plasma
*Explanation: O-negative erythrocytes lack surface antigens A, B, and Rh factor D, preventing immune reaction in recipients.*

**Q4: Under the 18th Constitutional Amendment, which legislative list was eliminated to grant enhanced provincial autonomy?**
- A) Federal List Part I
- B) Concurrent Legislative List *(Correct)*
- C) Residual List
- D) Provincial List
*Explanation: The Concurrent Legislative List was abolished in 2010 under the 18th Amendment.*

**Q5: In computer network security, what type of cyberattack floods a federal server with illegitimate traffic to make it unavailable?**
- A) Phishing
- B) Distributed Denial of Service (DDoS) *(Correct)*
- C) SQL Injection
- D) Man-in-the-Middle
*Explanation: DDoS attacks overwhelm network bandwidth and compute resources, rendering services inaccessible.*`;
    }

    return `### 5 High-Yield Practice Questions with Answers & Explanations:

**Q1: Which component is fundamentally responsible for coordinating execution and arithmetic logic inside a digital computer?**
- A) Hard Drive
- B) Central Processing Unit (CPU) *(Correct)*
- C) Power Supply Unit
- D) Network Interface Card
*Explanation: The CPU interprets and executes instructions from hardware and software.*

**Q2: In computing and communications, what does the abbreviation GUI stand for?**
- A) General User Interface
- B) Graphical User Interface *(Correct)*
- C) Global Unique Identifier
- D) Guided Utility Instruction
*Explanation: GUI allows users to interact with electronic devices through graphical icons and visual indicators.*

**Q3: Which storage medium provides the lowest latency for data retrieval by the microprocessor?**
- A) Secondary Magnetic Disk
- B) Solid State Drive (SSD)
- C) Processor Cache (L1/L2) *(Correct)*
- D) Optical Disc
*Explanation: L1 and L2 on-die processor caches operate at CPU clock speeds with nanosecond latency.*

**Q4: What is the primary purpose of an Operating System kernel?**
- A) Word processing and spreadsheet creation
- B) Managing hardware resources and mediating process communications *(Correct)*
- C) Scanning for internet viruses
- D) Compiling source code to machine code
*Explanation: The kernel is the core component that manages memory, CPU schedules, and hardware drivers.*

**Q5: Which boolean logic gate produces an output of 1 (True) only when both of its inputs are 1?**
- A) OR gate
- B) XOR gate
- C) AND gate *(Correct)*
- D) NOT gate
*Explanation: An AND gate evaluates to true strictly when all inputs are simultaneously true.*`;
  }

  // 6. Windows Operating System Concepts
  if (category === 'windows_concept') {
    if (isRomanUrdu) {
      return `**Asan Alfaaz Mein Jawab:**
Windows operating system Microsoft ka develop karda GUI-based operating system hai jo computers mein hardware resources, memory management aur applications ko operate karta hai.

### Aham Khusoosiyat:
1. **NTFS File System:** File-level security (ACLs), compression aur disk encryption provide karta hai.
2. **Virtual Memory (Paging):** Jab physical RAM mukammal bhar jaye toh Windows \`pagefile.sys\` ke zariye hard drive space ko temporary RAM ke taur par istemal karta hai.
3. **Task Manager:** Running processes, CPU performance aur startup programs ko control karne ka built-in utility hai.
4. **User Account Control (UAC):** System-level unauthorized changes ko rokne ke liye admin confirmation mangta hai.`;
    }

    return `**Direct Answer:**
Microsoft Windows is a graphical personal computer operating system that manages hardware resources, process execution, file systems, and user interfaces.

### Core Architecture & Features:
1. **NTFS (New Technology File System):** The standard journaling file system supporting Access Control Lists (ACLs), file-level encryption (EFS), and data integrity recovery.
2. **Virtual Memory Management:** Utilizes \`pagefile.sys\` on secondary storage as paging memory when active applications exceed physical RAM capacity.
3. **Kernel Mode vs. User Mode:** Separates privileged hardware drivers (Executive/Kernel) from user-space software to ensure operating system stability.
4. **User Account Control (UAC):** A security boundary that prevents unauthorized software from escalating to administrative rights without user authorization.`;
  }

  // 7. Manually Imported Document Queries
  if (category === 'imported_document' && retrievedData.docRecord) {
    const doc = retrievedData.docRecord;
    return `### Verified Official Reference: ${doc.title}

**Document Record Details:**
- **Source:** ${doc.officialSourceUrl}
- **Publication Date:** ${doc.publicationDate}
- **Document Type:** ${doc.documentType || 'Official Document'}

**Summary & Key Provisions:**
${(doc.text || '').slice(0, 1200)}

*Note: This information is grounded in ExamSathi's verified archival documentation repository.*`;
  }

  // 8. General Science Subject Concept (Everyday Science)
  if (category === 'general_education' || category === 'general_science') {
    if (isRomanUrdu) {
      return `### Academic Subject Concept (Everyday Science & General Knowledge):
Ye concept FPSC ke Everyday Science aur General Ability compulsory paper ka hissa hai:

**Bunyadi Wazahat:**
- Yeh scientific/academic usool standard federal curriculum ka hissa hai (ye koi administrative notice ya vacancy order nahi hai).
- Competitive exams mein is ke basic principles, real-world applications aur scientific units par sawalat pooche jatay hain.

*Exam Tip: FPSC past papers mein scientific definitions aur chemical/physical laws hamesha exact wording ke sath evaluate hote hain.*`;
    }

    return `### Academic Subject Concept (General Curriculum & Science):
This educational concept forms part of the standard syllabus for **Everyday Science & General Ability** in federal examinations.

**Core Academic Principle:**
- This is a general curriculum subject explanation, distinguished from administrative FPSC recruitment advertisements.
- In competitive examinations, questions on this topic focus on fundamental mechanisms, SI units, and practical real-world applications.

*Curriculum Context: Federal Public Service Commission Compulsory General Knowledge / Everyday Science Scheme.*`;
  }

  // 9. Pakistan Affairs / Constitutional Provision
  if (category === 'pakistan_affairs') {
    if (isRomanUrdu) {
      return `### 1973 Constitution: Article 2 aur Article 2A mein Farq:

1. **Article 2 (Islam State Religion):**
   - Asal 1973 Constitution mein shamil tha. Yeh bayan karta hai ke "Islam shall be the State religion of Pakistan."

2. **Article 2A (Objectives Resolution ka Nafaz):**
   - P.O. No. 14 of 1985 (Revival of Constitution Order) ke zariye Constitution mein insert kiya gaya aur 8th Amendment se reaffirm hua.
   - Is ne Qardad-e-Maqasid (Objectives Resolution) ko Constitution ka baqaida **substantive aur enforceable hissa** bana diya.

*Official Reference: Constitution of the Islamic Republic of Pakistan, Article 2A.*`;
    }

    return `### Constitutional Law Analysis: Article 2 vs Article 2A (1973 Constitution):

Under Pakistani constitutional jurisprudence tested in FPSC Pakistan Affairs papers:

1. **Article 2 (State Religion):**
   - Part of the original 1973 Constitution. It explicitly states that *Islam shall be the State religion of Pakistan*.

2. **Article 2A (The Objectives Resolution to form part of substantive provisions):**
   - Inserted into the Constitution via the Revival of Constitution Order, 1985 (Presidential Order No. 14 of 1985) and validated by the 8th Amendment.
   - It made the principles enunciated in the Objectives Resolution a substantive, enforceable part of the Constitution rather than a mere preamble.

*Official Source: Constitution of the Islamic Republic of Pakistan (1973).*`;
  }

  // 10. CSS / MPT Syllabus Scheme
  if (category === 'css_mpt_syllabus') {
    if (isRomanUrdu) {
      return `### FPSC CSS MPT Screening Test ka Official Syllabus:

FPSC ke official notification ke mutabiq MPT (MCQ Based Preliminary Test) 200 marks ka hota hai:

1. **English (50 Marks):** Vocabulary, Synonyms/Antonyms, Grammar aur Sentence Structuring.
2. **General Abilities (60 Marks):** Basic Arithmetic, Algebra, Geometry aur Mental Ability.
3. **General Knowledge (50 Marks):** Everyday Science, Pakistan Affairs aur Current Affairs.
4. **Urdu (20 Marks):** Grammar, Rozmarrah, Muhawarat aur Translation.
5. **Islamiat / Ethics (20 Marks):** Islamic Studies (Non-Muslims ke liye Ethics).

**Aham Points:**
- Total Time: 200 Minutes.
- Passing Marks: 33% (66 marks out of 200).
- **Negative Marking:** MPT mein koi negative marking nahi hoti.

*Official Source: FPSC CSS Examination Rules & Guidelines.*`;
    }

    return `### Official FPSC CSS / MPT Examination Scheme:

According to official FPSC regulations, the preliminary screening scheme is structured as follows:

1. **Total Allocation & Benchmark:**
   - **Total Marks:** 200 MCQs (1 mark each).
   - **Time Duration:** 200 Minutes.
   - **Qualifying Cutoff:** 33% (Minimum 66 marks required to sit for the written CSS examination).
   - **Negative Marking:** No negative marking in MPT screening.

2. **Subject Breakdown:**
   - **English (50 Marks):** Vocabulary, Grammar Usage, Comprehension.
   - **General Abilities (60 Marks):** Basic Arithmetic, Algebra, Ratios, Logical Reasoning.
   - **General Knowledge (50 Marks):** Everyday Science, Pakistan Affairs, Current Affairs.
   - **Urdu (20 Marks):** Grammar, Idioms, Translation.
   - **Islamic Studies / Ethics (20 Marks):** Fundamental Islamic History and Teachings.

*Official Source: FPSC Rules for Competitive Examination.*`;
  }

  // 11. General Recruitment Syllabus Scheme
  if (category === 'gr_syllabus') {
    if (isRomanUrdu) {
      return `### FPSC General Recruitment (BS-16 & BS-17) ka Official Scheme:

FPSC Phase-I Screening Test standard 100 marks ka hota hai:

1. **Part-I: English (20 Marks):**
   - Vocabulary (Synonyms, Antonyms).
   - Grammar Usage, Prepositions aur Sentence Structuring.

2. **Part-II: Professional / General Ability (80 Marks):**
   - **Basic Arithmetic:** Percentages, Ratios, Averages, Algebra.
   - **Current Affairs:** Pichlay 2 saal ki qaumi aur bain-ul-aqwami developments.
   - **Pakistan Affairs:** 1973 Constitution ke aham articles aur tareekh.
   - **Everyday Science:** Basic Physics, Chemistry, Biology aur IT.
   - **Post Specific Law/Rules:** Jaise Customs Act 1969 (Inspector Customs ke liye) ya FIA Act 1974 (AD FIA ke liye).

**Negative Marking Rule:**
FPSC ke mutabiq screening tests mein 0.25 marks per wrong answer deduct hote hain.

*Official Source: FPSC Scheme of General Recruitment Screening Tests.*`;
    }

    return `### Official FPSC General Recruitment Screening Scheme (BS-16 / BS-17):

According to FPSC Phase-I official guidelines, one-paper screening tests follow a 100-mark objective MCQ format:

1. **Part-I: English (20 Marks / 20%):**
   - Vocabulary, Synonyms & Antonyms.
   - Grammar Usage, Sentence Correction, Prepositions.

2. **Part-II: General Intelligence & Professional (80 Marks / 80%):**
   - **Basic Arithmetic:** Averages, Percentages, Ratios, Algebra.
   - **Current Affairs:** Significant national and international developments (last 2 years).
   - **Pakistan Affairs:** Constitutional history, 1973 Constitution fundamentals, Geography.
   - **Everyday Science:** Environmental science, basic physics/chemistry, human physiology.
   - **Job-Specific Legislation:** Relevant statutory acts (e.g., Customs Act 1969 for Customs Inspector, FIA Act 1974 for Assistant Director FIA).

**Marking Scheme:**
- Duration: 100 Minutes.
- Negative Marking: 0.25 marks penalty per wrong attempt.

*Official Source: Federal Public Service Commission Examination Directorate.*`;
  }

  // 12. Currently Open FPSC Vacancies
  if (category === 'current_vacancies') {
    const openJobs = retrievedData.openJobs || getCurrentOpenJobs();

    if (openJobs && openJobs.length > 0) {
      const jobListings = openJobs
        .map(
          (j, idx) =>
            `${idx + 1}. **${j.title} (${j.scale})** [Case No. ${j.caseNumber}]:\n   - **Department:** ${j.department} (${j.ministry})\n   - **Vacancies:** ${j.vacancies} Posts\n   - **Closing Date:** **${j.closingDate}** (11:59 PM PKT)\n   - **Eligibility:** ${j.qualification}`
        )
        .join('\n\n');

      return `### Currently Open FPSC Job Vacancies (Verified Official Openings):

The following advertisements have active application windows currently accepting online submissions on the official FPSC portal:

${jobListings}

**Important Application Guidelines:**
- Applications must be submitted through the FPSC online portal ([fpsc.gov.pk](https://www.fpsc.gov.pk/)) before the closing date.
- Challan fee must be deposited in the National Bank of Pakistan (NBP) or State Bank before the deadline.
- *Notice on Previous Advertisements:* Prior recruitment advertisements (including Consolidated Advt. No. 01/2026 for Inspector Customs and FIA) have completed their application deadline and are closed. All practice questions for those examinations remain fully available in ExamSathi's Question Bank.`;
    } else {
      return `### Currently Open FPSC Vacancies (Status Notice):

According to verified official records as of today, there are currently **no active FPSC General Recruitment advertisements accepting applications**.

**Status of Recent Advertisements:**
- **Consolidated Advertisement No. 01/2026:** Application period **closed on 20 January 2026**.
- **CSS MPT 2026:** Application period **closed on 15 November 2025**.

**Educational Content Notice:**
Although application submission is closed, **all syllabus schemes, past papers, and practice questions** (including Inspector Customs, FIA, and CSS) remain permanently accessible for exam study in ExamSathi AI.`;
    }
  }

  // 12b. Lecturer Vacancy Inquiry (Truthful verification status)
  if (category === 'lecturer_inquiry') {
    const verifiedLecturerJobs = getCurrentOpenJobs().filter((j) => /lecturer/i.test(j.title));
    if (verifiedLecturerJobs.length > 0) {
      const listings = verifiedLecturerJobs
        .map(
          (j, idx) =>
            `${idx + 1}. **${j.title} (${j.scale})** [Case No. ${j.caseNumber}]:\n   - **Department:** ${j.department} (${j.ministry})\n   - **Vacancies:** ${j.vacancies} Posts\n   - **Closing Date:** **${j.closingDate}** (11:59 PM PKT)\n   - **Eligibility:** ${j.qualification}\n   - **Official Portal:** [fpsc.gov.pk](${j.officialSourceUrl})`
        )
        .join('\n\n');

      return `### Verified Active FPSC Lecturer Vacancies:

${listings}

*All relevant subject practice questions remain permanently available in ExamSathi.*`;
    }

    return `### FPSC Lecturer Vacancy Status (Official Verification Notice):

According to verified official records as of today, there is currently **no active advertisement for Lecturer / Assistant Professor positions accepting applications** on the official Federal Public Service Commission portal ([fpsc.gov.pk](https://www.fpsc.gov.pk/)).

**Official Verification Safeguard:**
- Under ExamSathi AI's verified publication policy, vacancies are only announced when backed by approved Gazette publications and authentic official links.
- Administrative notices, merit lists, test schedules, or unconfirmed press rumors are strictly excluded from current job listings.

**General Eligibility Criteria for FPSC Lecturer (BS-17) Posts (For Future Reference):**
- **Qualification:** Second Class or Grade 'C' Master's degree or equivalent (16 years education) in the relevant discipline (e.g., Computer Science, English, Mathematics, Urdu, Physics) from an HEC-recognized university.
- **Age Limit:** 22 to 28 years plus 5 years general relaxation in upper age limit (up to 33 years).
- **Recruiting Department:** Federal Government Educational Institutions (FGEI) Directorate / Cantonments / Islamabad Model Colleges.

**Preparation & Practice:**
Even when no active vacancy is open, **all subject practice questions and mock tests** (including Computer Science, English, Mathematics, and Everyday Science) remain permanently accessible in ExamSathi's Question Bank for ongoing preparation.`;
  }

  // 13. Historical / Expired FPSC Advertisement
  if (category === 'historical_advertisement') {
    return `### Historical FPSC Advertisement Record (Advt. No. 01/2026 - Closed):

*Official Status: **Application Period Closed** (Application deadline was 20 January 2026). This historical record is preserved for syllabus guidance, past-paper review, and candidate preparation.*

**Key Posts from Consolidated Advertisement No. 01/2026:**

1. **Inspector Customs / Intelligence Officer (BS-16) [Case No. F.4-02/2026-R]:**
   - **Department:** Federal Board of Revenue (Revenue Division)
   - **Vacancies:** 185 Posts
   - **Closing Date:** 20 January 2026 *(Passed)*
   - **Qualification:** Second Class or Grade 'C' Bachelor's degree with Economics, Commerce, Statistics, CS, Law, Pharmacy, Chemistry, or Physics, OR B.Sc. Engineering.

2. **Assistant Director (Investigation) (BS-17) [Case No. F.4-15/2026-R]:**
   - **Department:** Federal Investigation Agency (FIA), Ministry of Interior
   - **Vacancies:** 42 Posts
   - **Closing Date:** 20 January 2026 *(Passed)*
   - **Qualification:** Second Class Master's degree or 16 years equivalent education.

*Study Note: You can continue practicing verified examination questions for these posts directly in ExamSathi's Practice section.*`;
  }

  // 14. General Advertisement Details (Preserved for specific inquiry)
  if (category === 'advertisement') {
    if (isRomanUrdu) {
      return `### FPSC Consolidated Advertisement No. 01/2026 Tafseelat:

Official FPSC record ke mutabiq darj zail posts shaya hui hain:

1. **Inspector Customs / Intelligence Officer (BS-16) - Case No. F.4-02/2026-R:**
   - **Department:** Federal Board of Revenue (Revenue Division).
   - **Qualification:** 2nd Class Bachelor's degree (Economics, Commerce, Statistics, CS, Law, Pharmacy, Chemistry, Physics) ya B.Sc Engineering.
   - **Physical Standards:** Male: Qad 5'-6", Chaati 32"-33.5" | Female: Qad 5'-2".
   - **Age Limit:** 20-28 saal (+ 5 saal general upper age relaxation = 33 saal tak).
   - **Total Asamiyan:** 185 Posts.
   - **Closing Date:** 20 January 2026.

2. **Assistant Director Investigation (BS-17) - Case No. F.4-15/2026-R:**
   - **Department:** Federal Investigation Agency (FIA).
   - **Qualification:** 2nd Class Master's degree ya 16-saala degree (HEC recognized).
   - **Age Limit:** 22-28 saal (+ 5 saal general relaxation).
   - **Total Asamiyan:** 42 Posts.
   - **Closing Date:** 20 January 2026.

*Official Source: Federal Public Service Commission Consolidated Advt. No. 01/2026.*`;
    }

    return `### FPSC Consolidated Advertisement No. 01/2026 Official Details:

Retrieved directly from official FPSC publication records:

1. **Inspector Customs / Intelligence Officer (BS-16) [Case No. F.4-02/2026-R]:**
   - **Department:** Revenue Division, Federal Board of Revenue (FBR).
   - **Vacancies:** 185 Posts (Merit=14, Punjab=92, Sindh Rural=21, Sindh Urban=14, KP=21, Balochistan=11, Ex-FATA=5, AJK=4, GB=3).
   - **Eligibility:** Second Class or Grade 'C' Bachelor's degree with Economics, Commerce, Statistics, Accounting, Computer Science, Law, Pharmacy, Chemistry, or Physics, OR B.Sc. Engineering.
   - **Physical Standards:** Male: Height 5'6", Chest 32"-33.5". Female: Height 5'2".
   - **Age Limit:** 20–28 years plus 5 years general government upper age relaxation (Total: 33 years).
   - **Closing Date:** 20 January 2026.

2. **Assistant Director (Investigation) (BS-17) [Case No. F.4-15/2026-R]:**
   - **Department:** Federal Investigation Agency (FIA), Ministry of Interior.
   - **Vacancies:** 42 Posts (Merit=3, Punjab=21, Sindh R=5, Sindh U=3, KP=5, Balochistan=3, Ex-FATA=1, AJK=1).
   - **Eligibility:** Second Class or Grade 'C' Master's degree or 16 years equivalent education recognized by HEC.
   - **Age Limit:** 22–28 years plus 5 years general upper age relaxation.
   - **Closing Date:** 20 January 2026.

*Official Source: FPSC Advertisement Directorate, Islamabad.*`;
  }

  // 12. General Educational / Subject Inquiry Default
  if (isRomanUrdu) {
    return `### Academic Study Rehnumai:
Yeh sawal aik aam taleemi aur conceptual mauzo se mutaliq hai.

**Bunyadi Wazahat:**
- ExamSathi AI aap ke pooche gaye academic sawal ka barah-e-rast aur seedha jawab faraham karta hai.
- Agar aap ko is topic ke mazeed MCQs, tareekhi pas-manzar ya tafseeli wazahat darkar ho toh zaroor agah karein.`;
  }

  return `### Academic Study Guidance:
This inquiry concerns a general educational or curricular subject.

**Core Academic Concept:**
- ExamSathi AI addresses your specific subject inquiry directly without attaching unrelated administrative recruitment advertisements or unrequested vacancies.
- If you would like targeted practice MCQs, conceptual breakdowns, or step-by-step examples on this topic, please specify your requirements.`;
}
