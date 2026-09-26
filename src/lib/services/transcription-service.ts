// SERVER ONLY — THE Deepgram call site. No other module may call the Deepgram API.
//
// Speech-to-text infrastructure layer (foundation for Elaya's voice channel — not a
// notes-specific gadget). Nova-2 hi-Latn for Hinglish (Roman script Hindi).
//
// Privacy contract (D-01 carve-out, Decision Log 2026-06-12): raw audio cannot be
// pseudonymised, so it goes to Deepgram as-is under their no-training / zero-retention
// API terms. Audio is transcribed in-memory and discarded — never written to disk,
// Storage, or the DB. Never log audio content or transcripts here.

// No `server-only` guard since 2026-09-27: the media reader (0246) calls transcribeAudio from Trigger.dev, where
// that package throws at import. The A-15 rule still holds: never import this from a 'use client' file.

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_MODEL = "nova-2";
const DEEPGRAM_LANGUAGE = "hi-Latn"; // Hinglish (Roman script Hindi)

type DeepgramResponse = {
  results?: {
    channels?: {
      alternatives?: { transcript?: string }[];
    }[];
  };
};

/**
 * Transcribe a single audio recording. Pass the actual recording MIME type —
 * browsers differ (Chrome `audio/webm;codecs=opus`, Safari `audio/mp4`,
 * Firefox `audio/ogg;codecs=opus`); never hardcode it.
 *
 * Throws on missing key, HTTP failure, or unexpected response shape —
 * the action layer catches and maps to user-facing copy (Rule 10).
 */
export async function transcribeAudio(
  audio: ArrayBuffer,
  mimeType: string,
  /**
   * Optional keyword boosts — proper nouns the audio is likely to contain
   * (e.g. the staff roster's first names). Deepgram weights these during
   * decoding, so "Arfam" transcribes as "Arfam" instead of the artifact
   * "Arapham" (real 2026-08 transcript). Fixing the name AT THE SOURCE is
   * layer 1 of the name-resolution defence; the phonetic find_teammate
   * fallback (lib/utils/fuzzy.ts) is layer 2 for whatever still slips through.
   */
  keywords: string[] = [],
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("[transcription-service] DEEPGRAM_API_KEY is not set");
  }

  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: DEEPGRAM_LANGUAGE,
    smart_format: "true",
  });
  for (const word of keywords.slice(0, 100)) {
    const clean = word.trim();
    if (clean.length >= 3) params.append("keywords", `${clean}:2`);
  }

  const res = await fetch(`${DEEPGRAM_API_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType,
    },
    body: audio,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[transcription-service] Deepgram returned ${res.status}: ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as DeepgramResponse;
  const transcript = json.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (typeof transcript !== "string") {
    throw new Error("[transcription-service] unexpected Deepgram response shape");
  }

  return transcript.trim();
}
