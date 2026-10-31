/**
 * Server-Side Environment Loader for ExamSathi AI
 * Securely loads GEMINI_API_KEY and other server-only secrets from .env.local and .env
 *
 * CRITICAL SECURITY RULES:
 * - This file is SERVER-SIDE ONLY.
 * - Never expose GEMINI_API_KEY to Vite's frontend bundler or React components.
 * - Never use the VITE_ prefix for secret API keys.
 * - Never log or print the raw API key in logs, terminal outputs, or API responses.
 */

import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

/**
 * Safely parse a .env formatted string into key-value pairs
 * Handles quotes, comments (#), and trims carriage returns.
 */
function parseEnvContent(content) {
  const result = {};
  if (!content || typeof content !== 'string') return result;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    // Remove inline comments if not inside quotes
    if (!val.startsWith('"') && !val.startsWith("'")) {
      const commentIdx = val.indexOf(' #');
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trim();
      }
    }

    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }

    if (key) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Load environment variables from .env.local (preferred) and .env (fallback).
 * Does not overwrite environment variables that are already set in process.env.
 */
export function loadServerEnv(rootDir = process.cwd()) {
  if (envLoaded) return;

  const envFiles = ['.env.local', '.env'];
  for (const filename of envFiles) {
    const fullPath = path.resolve(rootDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = parseEnvContent(content);
        for (const [key, value] of Object.entries(parsed)) {
          // Do not overwrite existing process.env variables
          if (!process.env[key] && value) {
            process.env[key] = value;
          }
        }
      } catch (err) {
        console.warn(`[ExamSathi Env] Could not read ${filename}:`, err?.message || err);
      }
    }
  }

  envLoaded = true;
}

/**
 * Retrieve the configured Gemini API key from process.env.
 * Checks GEMINI_API_KEY and GOOGLE_GENAI_API_KEY.
 * Ignores empty or obvious placeholder values.
 */
export function getGeminiApiKey() {
  // Ensure env is loaded
  if (!envLoaded) {
    loadServerEnv();
  }

  const rawKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '').trim();

  // Reject placeholder values
  const placeholders = [
    'your_gemini_api_key_here',
    'your-gemini-api-key',
    'your_api_key_here',
    'todo',
    'replace_me',
  ];

  if (!rawKey || placeholders.includes(rawKey.toLowerCase())) {
    return '';
  }

  return rawKey;
}

/**
 * Get safe, unprivileged configuration status for diagnostics.
 * NEVER returns the raw API key.
 */
export function getGeminiConfigStatus() {
  const key = getGeminiApiKey();
  const isConfigured = Boolean(key && key.length > 5);

  let source = 'none';
  if (process.env.GEMINI_API_KEY) {
    source = 'GEMINI_API_KEY';
  } else if (process.env.GOOGLE_GENAI_API_KEY) {
    source = 'GOOGLE_GENAI_API_KEY';
  }

  return {
    configured: isConfigured,
    source: isConfigured ? source : 'none',
    masked: isConfigured
      ? `${key.slice(0, 4)}...${key.slice(-4)}`
      : null,
  };
}

/**
 * Retrieve the configured GroqCloud API key from process.env.
 * Checks GROQ_API_KEY (and GROK_API_KEY for spelling tolerance).
 * Ignores empty or obvious placeholder values.
 */
export function getGroqApiKey() {
  if (!envLoaded) {
    loadServerEnv();
  }

  const rawKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || '').trim();

  const placeholders = [
    'your_groq_api_key_here',
    'your-groq-api-key',
    'your_api_key_here',
    'gsk_your_key_here',
    'todo',
    'replace_me',
  ];

  if (!rawKey || placeholders.includes(rawKey.toLowerCase())) {
    return '';
  }

  return rawKey;
}

/**
 * Get safe, unprivileged configuration status for GroqCloud diagnostics.
 * NEVER returns the raw API key.
 */
export function getGroqConfigStatus() {
  const key = getGroqApiKey();
  const isConfigured = Boolean(key && key.length > 8);

  let source = 'none';
  if (process.env.GROQ_API_KEY) {
    source = 'GROQ_API_KEY';
  } else if (process.env.GROK_API_KEY) {
    source = 'GROK_API_KEY';
  }

  return {
    configured: isConfigured,
    source: isConfigured ? source : 'none',
    model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
    masked: isConfigured
      ? `${key.slice(0, 6)}...${key.slice(-4)}`
      : null,
  };
}

