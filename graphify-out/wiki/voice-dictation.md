# Voice dictation / transcription

> **Purpose:** In-memory speech-to-text via Deepgram (Nova multilingual, Hinglish), fed by the shared
> `useAudioRecorder` hook, transcribed by `transcribeAudioAction`, and handed to four composer surfaces
> as an **editable draft — never auto-sent**. Audio is transcribed in memory and discarded.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Flow

1. **Record** — a surface mounts `<DictationButton>`, which uses `useAudioRecorder`. On a user gesture,
   `start()` requests `getUserMedia({ audio: true })`, negotiates the best codec per browser
   (opus → webm → mp4 → ogg), records to a Blob, and auto-stops at 2 minutes
   (`DEFAULT_MAX_RECORDING_MS = 120_000`). The mic track is released on stop.
2. **Transcribe** — `onComplete({ blob, mimeType, durationMs })` → FormData → `transcribeAudioAction`
   (`lib/actions/transcription.ts`): validates the Blob (≤3 MB, audio/* MIME) → `transcribeAudio(buf, mime)`
   (`transcription-service.ts`) calls Deepgram `/v1/listen` (Nova multilingual). Returns `{ data: { text }, error }`.
3. **Append to draft** — `onTranscript(text)` fires; the consumer appends it to its own composer/form
   state. The user reviews, edits, and submits through that surface's **existing** save path.

---

## The four surfaces (one component, two variants)

| Surface | File | Variant | Submits via |
|---|---|---|---|
| Elaya chat composer | `src/components/elaya/ElayaChatShell.tsx` | `composer` (32px pill in `MessageBar` leadingSlot) | `POST /api/elaya/chat` |
| WhatsApp composer | `src/components/whatsapp/ConversationPanel.tsx` | `composer` | `sendMessage` |
| Lead notes (dossier) | `src/components/leads/LeadNotesInput.tsx` | `inline` (28px bordered, footer) | `addLeadNote` |
| Called modal note | `src/components/leads/CalledModal.tsx` | `inline` (label row) | `addLeadCallNote` |

The inline variants use `onBusyChange(busy)` to gate the form's submit/save while recording or
transcribing; composer variants ignore it (Enter is already gated by the recorder being mid-take).
`onError(message)` lets each surface keep its own error UI (toast vs inline).

There is also a **fifth, server-side** path: WhatsApp **voice notes** for Elaya staff — `elaya-whatsapp.ts`
downloads the Gupshup CDN audio server-to-server and calls `transcribeAudio` directly (same service,
no `DictationButton`).

---

## Invariants / gotchas

- **Never auto-sends.** `DictationButton` only appends to a draft. A garbled transcript can never reach
  save/send unreviewed — the consumer owns the submit button.
- **Audio in-memory only, never stored** (D-01 carve-out). No disk, no Storage, no DB. Never log audio or
  transcripts. Deepgram returns the string; the connection closes immediately.
- **`transcription-service.ts` is THE only Deepgram call site.** Every consumer reuses the one function.
  Never add a second STT path.
- **MIME type travels with the Blob.** Chrome `audio/webm;codecs=opus`, Safari `audio/mp4`, Firefox
  `audio/ogg`. The action passes the exact `audio.type` (fallback `audio/webm`) — never hardcode it.
- **2-minute client cap** keeps uploads under the action body limit; manual stop is always allowed.
- **Renders `null` when unsupported.** No `MediaRecorder`/`getUserMedia` → the button hides itself;
  consumers mount it unconditionally, no feature flag.
- **Gesture-gated mic** — `start()`/`getUserMedia` only from a click handler; never auto-request on mount.

---

## File map

| File | Role |
|---|---|
| `src/lib/services/transcription-service.ts` | THE Deepgram call site (server-only, in-memory) |
| `src/lib/actions/transcription.ts` | `transcribeAudioAction` — Blob validation, error mapping |
| `src/hooks/useAudioRecorder.ts` | MediaRecorder plumbing: codec negotiation, 2-min stop, mic release |
| `src/components/ui/DictationButton.tsx` | The record/stop/cancel cluster + counter + spinner; 2 variants |
| `src/lib/validations/transcription-schema.ts` | `TranscribeAudioSchema` (size/type/instanceof) |
| `src/components/elaya/ElayaChatShell.tsx` | Mounts `DictationButton` (composer) in the chat MessageBar |
| `src/components/whatsapp/ConversationPanel.tsx` | Mounts `DictationButton` (composer) in the WhatsApp MessageBar |
| `src/components/leads/LeadNotesInput.tsx` | Mounts `DictationButton` (inline) in the notes footer |
| `src/components/leads/CalledModal.tsx` | Mounts `DictationButton` (inline) in the note label row |
