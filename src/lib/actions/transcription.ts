"use server";

// ─────────────────────────────────────────────
// Action: transcribeAudioAction
// THE client entry point for speech-to-text. Accepts a single audio Blob via
// FormData, transcribes through transcription-service (Deepgram, server-only),
// and returns the transcript text. The audio is processed in-memory and
// discarded — never persisted (D-01 carve-out, Decision Log 2026-06-12).
//
// This action never writes anything: the transcript lands in the caller's
// composer as an editable draft and is saved through the existing write path
// (e.g. addLeadNote), which owns sanitisation and cache invalidation.
// ─────────────────────────────────────────────

import { requireProfile } from "@/lib/actions/_auth";
import { transcribeAudio } from "@/lib/services/transcription-service";
import { TranscribeAudioSchema } from "@/lib/validations/transcription-schema";
import { formErrors } from "@/lib/validations/form-errors";
import type { ActionResult } from "@/lib/types";

const SCHEMA_ERROR_COPY: Record<string, string> = {
  audio_required: formErrors.audioRequired,
  audio_too_large: formErrors.audioTooLarge,
  audio_invalid_type: formErrors.audioInvalidType,
};

export async function transcribeAudioAction(
  formData: FormData,
): Promise<ActionResult<{ text: string }>> {
  const parsed = TranscribeAudioSchema.safeParse({
    audio: formData.get("audio"),
  });
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return {
      data: null,
      error: (code && SCHEMA_ERROR_COPY[code]) || formErrors.generic,
    };
  }

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  const { audio } = parsed.data;

  try {
    // Pass the actual recording MIME type through — Safari records mp4/aac,
    // Chrome webm/opus. `audio/webm` is only the empty-type fallback.
    const text = await transcribeAudio(
      await audio.arrayBuffer(),
      audio.type || "audio/webm",
    );
    return { data: { text }, error: null };
  } catch (e) {
    console.error("[transcription-action] transcribe failed:", e);
    return { data: null, error: formErrors.transcriptionFailed };
  }
}
