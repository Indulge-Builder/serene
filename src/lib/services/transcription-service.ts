// SERVER ONLY — THE Deepgram call site. No other module may call the Deepgram API.
//
// Speech-to-text infrastructure layer (foundation for Lia's voice channel — not a
// notes-specific gadget). Nova-2 hi-Latn for Hinglish (Roman script Hindi).
//
// Privacy contract (D-01 carve-out, Decision Log 2026-06-12): raw audio cannot be
// pseudonymised, so it goes to Deepgram as-is under their no-training / zero-retention
// API terms. Audio is transcribed in-memory and discarded — never written to disk,
// Storage, or the DB. Never log audio content or transcripts here.

import "server-only";

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
