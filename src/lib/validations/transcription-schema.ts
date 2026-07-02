import { z } from "zod";

// Hard cap on a voice-note upload. Recordings are capped at ~2 minutes of
// low-bitrate audio client-side (useAudioRecorder); Safari AAC at default
// bitrates can still approach ~2 MB, so the ceiling sits above that but well
// under the 4 MB server-action body limit (next.config.ts).
const MAX_VOICE_NOTE_BYTES = 3 * 1024 * 1024;

// Browsers tag audio-only recordings differently: Chrome `audio/webm;codecs=opus`,
// Safari `audio/mp4`, Firefox `audio/ogg;codecs=opus`. Some engines use the
// `video/*` container type for webm/mp4 even when audio-only.
const ACCEPTED_TYPE_PREFIXES = ["audio/", "video/webm", "video/mp4"];

// Error messages are internal codes — the action maps them to formErrors copy.
// Never let these reach the UI raw.
export const TranscribeAudioSchema = z.object({
  audio: z
    .instanceof(Blob, { message: "audio_required" })
    .refine((b) => b.size > 0, "audio_required")
    .refine((b) => b.size <= MAX_VOICE_NOTE_BYTES, "audio_too_large")
    .refine(
      (b) =>
        b.type === "" ||
        ACCEPTED_TYPE_PREFIXES.some((p) => b.type.startsWith(p)),
      "audio_invalid_type",
    ),
});

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioSchema>;
