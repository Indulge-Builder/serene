# Voice Dictation

> **Purpose:** speech-to-text for staff, shared by every text surface in Serene. One mic→transcribe→draft
> cluster, one Deepgram call site — reusable substrate for the AI work layer, not a per-page gadget.
> **Audience:** engineers. · **Source-of-truth scope:** voice-dictation architecture + contracts.
> **Status:** shipped 2026-06-13/14. Live on four in-app surfaces + inbound WhatsApp voice notes.
> **Last verified:** 2026-06-15.

## What it is

A user holds the mic, speaks (English or Hinglish), and the transcript lands in the field they were
already typing into — as an **editable draft they then review and send through the existing write
path**. It never auto-sends. Behind it is exactly one speech-to-text vendor call (Deepgram), isolated
in one server-only service so no other module can reach the vendor and no audio is ever stored.

This is deliberate substrate for the vision's AI work layer: a clean, reusable transcription seam that
any future voice surface (Elaya voice turns, voice-first task entry) plugs into without a second integration.

## The pieces

| Layer | File | Role |
| ----- | ---- | ---- |
| Service (server-only) | `src/lib/services/transcription-service.ts` | `transcribeAudio()` — **THE only Deepgram call site** (`import server-only`). Nova-2, `hi-Latn` (Hinglish / Roman-script Hindi). |
| Action | `src/lib/actions/transcription.ts` | `transcribeAudioAction` — the client entry; Zod-validates the blob (`transcription-schema.ts`) then calls the service. |
| Validation | `src/lib/validations/transcription-schema.ts` | `MAX_VOICE_NOTE_BYTES = 3 MB`; rejects empty / oversized audio. |
| Recorder hook | `src/hooks/useAudioRecorder.ts` | **THE** MediaRecorder plumbing — codec negotiation, 2-min auto-stop (`DEFAULT_MAX_RECORDING_MS = 120000`), mic-track release, unmount discard. Never re-implement inline. |
| Component | `src/components/ui/DictationButton.tsx` | **THE** mic→transcribe→`onTranscript(text)` cluster (record/stop/cancel buttons + `m:ss` counter + Transcribing… spinner). `variant="composer"` (32px pill, mounts as a `<MessageBar leadingSlot>`) or `variant="inline"` (28px bordered, form footer). Renders `null` when MediaRecorder is unsupported. |
| WhatsApp inbound | `src/lib/services/elaya-whatsapp.ts` | `transcribeWhatsAppAudio` — Gupshup CDN voice note → transcribe → text, before cap/model/persist. |

## The five surfaces

`DictationButton` is composed once per surface — never a re-inlined mic cluster (R-01):

1. **`ElayaChatShell`** (`variant="composer"`) — dictate an Elaya message.
2. **`ConversationPanel`** (WhatsApp, `variant="composer"`) — dictate a staff reply.
3. **`LeadNotesInput`** (`variant="inline"`) — dictate a lead note.
4. **`CalledModal`** (`variant="inline"`) — dictate the call-outcome note.

Plus the **inbound** path: a staff member sends a **WhatsApp voice note** → `elaya-whatsapp.ts`
transcribes it (input-transform only) before the Elaya turn runs. An empty transcript is a graceful
no-op, never an error.

## Invariants (never weaken)

1. **Audio is NEVER persisted.** It is transcribed in-memory, sent to Deepgram under their
   zero-retention terms, then discarded. No service or action layer logs audio bytes or the transcript.
2. **One vendor call site.** `transcription-service.ts` is the only file that talks to Deepgram, and it
   is `server-only`. Any other module reaching the vendor is a violation (R-01).
3. **Never auto-sends.** `DictationButton` appends the transcript to the consumer's draft as editable
   text only. The consumer's existing write path (`addLeadNote`, `addLeadCallNote`, the WhatsApp send,
   the Elaya send handler) submits it — so a garbled transcript is always reviewable first. This is the
   D-01 carve-out: voice is an input transform, not a new mutation surface.
4. **MIME type travels with the Blob — never hardcoded.** The browser's MediaRecorder picks the codec
   at record time (Safari `audio/mp4`, Chrome `audio/webm;codecs=opus`, Firefox/Gupshup
   `audio/ogg;codecs=opus`); the action passes the actual `type` through to Deepgram.
5. **Recorder cleanup is automatic.** `useAudioRecorder` discards + releases the mic on unmount, so a
   mid-recording modal close is safe.
6. **`onBusyChange(busy)`** fires `true` while recording **or** transcribing — used by the footer
   consumers (`LeadNotesInput`, `CalledModal`) to gate their submit while a take is in flight. Composer
   consumers ignore it (Enter-to-send is already gated by the recorder's `disabled` prop).

## Env

`DEEPGRAM_API_KEY` — server-only, never `NEXT_PUBLIC_` (S-11). See `../operations/environments.md`.

## Related

- Elaya voice input (Phase 4a): `elaya.md`
- WhatsApp staff channel + voice notes: `../pages/whatsapp.md`
- Lead notes / call modal: `../pages/leads.md`
