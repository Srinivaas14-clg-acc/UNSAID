import { GoogleGenAI } from "@google/genai";

/**
 * Server-only Gemini client, lazily constructed.
 * Mirrors src/lib/supabase/server.ts's lazy-init-with-clear-error pattern:
 * never throw at module load time, only when a caller actually needs the
 * client and the API key is missing. This keeps `npm run dev` booting even
 * before GEMINI_API_KEY is supplied.
 */

// Single source of truth for the model id — one-line fix if unsupported for
// function-calling or audio input once real calls are tested.
//
// Was gemini-3.7-flash (newest at build time), but live testing found it
// returning 503 UNAVAILABLE ("high demand") taking 2+ minutes to fail —
// consistent with a just-released model still under capacity pressure.
// gemini-2.5-flash is deprecated for new API keys (Google's own 404 message
// points to gemini-3.6-flash as the replacement). gemini-3.6-flash verified
// live: ~2.5s round trip, supports generateContent/structured output.
export const GEMINI_MODEL = "gemini-3.6-flash";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_client) return _client;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Set it in .env.local. See .env.example for where to get one."
    );
  }

  _client = new GoogleGenAI({ apiKey });

  return _client;
}
