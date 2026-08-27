import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini/client";

/**
 * Multimodal audio-in/text-out call, isolated from extraction (never shares
 * a call with extractClaims — separate concerns, separate requests).
 * Transcription is native to the model per MISSION §3 — no separate STT
 * service. Code-switching (English/Tamil/Hindi mid-sentence) is expected to
 * work because it's a native Gemini capability, not something we implement.
 *
 * Throws on failure — the caller (respond/route.ts) maps this to
 * upstream_unavailable (502); there is no fail-closed substitute for
 * transcription (unlike the moderator), the client must retry or fall back
 * to typing.
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  const ai = getGeminiClient(); // throws "not_configured"-shaped error if unset

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Transcribe this audio verbatim. Output only the transcription, no commentary, no timestamps, no speaker labels.",
          },
          {
            inlineData: {
              data: audioBase64,
              mimeType,
            },
          },
        ],
      },
    ],
  });

  const text = response.text;
  if (!text || !text.trim()) {
    throw new Error("Empty transcription result");
  }

  return text.trim();
}
