# Voice dictation

> **Purpose:** speech-to-text for the whole app: one mic-to-draft component, one recorder hook, one Deepgram call site, shared by every place a person can speak instead of type, plus the voice notes Elaya receives on WhatsApp.
> **Audience:** engineers. · **Source-of-truth scope:** the dictation pieces and their contracts. What Elaya does with a transcript lives in [elaya.md](elaya.md).
> **Last verified:** 2026-09-26 against `src/lib/services/transcription-service.ts`, `src/lib/actions/transcription.ts`, `src/lib/validations/transcription-schema.ts`, `src/hooks/useAudioRecorder.ts`, `src/components/ui/DictationButton.tsx`, every `<DictationButton>` mount, `src/lib/services/elaya-whatsapp.ts` and `elaya-customer.ts`.

## What it is

A person presses the mic, speaks (English or Hinglish), and the transcript lands in the field they
were typing into as an editable draft. They review it and send it through the field's normal save
path. It never sends on its own. Behind it is exactly one speech-to-text call (Deepgram), in one
server-only service, and no audio is ever stored.

## The pieces

| Layer | File | Role |
| --- | --- | --- |
| Service (server only) | `src/lib/services/transcription-service.ts` | `transcribeAudio(audio, mimeType, keywords?)`: THE only Deepgram call site. Model `nova-2`, language `hi-Latn` (Hinglish in Roman script), `smart_format`. Plain `fetch`, no SDK. `keywords` (up to 100, three letters or more) are boosted during decoding |
| Action | `src/lib/actions/transcription.ts` | `transcribeAudioAction(formData)`: Zod first, then `requireProfile()` (any role), then the service. Returns `{ data: { text }, error }`. Writes nothing |
| Validation | `src/lib/validations/transcription-schema.ts` | non-empty, at most 3 MB (`MAX_VOICE_NOTE_BYTES`), type `audio/*`, `video/webm`, `video/mp4` or empty. Issue codes are mapped to `formErrors` copy |
| Recorder hook | `src/hooks/useAudioRecorder.ts` | THE MediaRecorder plumbing: codec choice, a 2-minute auto-stop (`DEFAULT_MAX_RECORDING_MS`), mic release, discard on unmount. Never re-implemented inline |
| Component | `src/components/ui/DictationButton.tsx` | THE mic cluster: record, stop, cancel, an `m:ss` counter and a "Transcribing…" spinner, then `onTranscript(text)`. `variant="composer"` (32px pill, a `MessageBar` leading slot) or `variant="inline"` (28px, bordered, in a form). `what` sets the label ("Dictate a playbook"). Renders nothing when the browser has no MediaRecorder |

## Where it is mounted

`DictationButton` is composed once per surface, never re-inlined:

| Surface | Variant | What the transcript fills |
| --- | --- | --- |
| `components/elaya/ElayaChatShell.tsx` (the `/elaya` page, the floating button, the dashboard widget) | composer | the message to Elaya |
| `components/whatsapp/ConversationPanel.tsx` (`/whatsapp`) | composer | a staff reply to a lead |
| `components/leads/LeadNotesInput.tsx` | inline | a lead note |
| `components/leads/CalledModal.tsx` | inline | the call-outcome note |
| `components/notes/NoteFormModal.tsx` (`/notes`) | inline | a personal note |
| `components/members/MemberObservationCard.tsx` (member page) | inline | an observation, which the Observation reader turns into facts ([members.md](members.md)) |
| `components/settings/ElayaPlaybooksPanel.tsx` (`/settings/elaya-playbooks`) | inline | "Speak a playbook" notes that Elaya then drafts into a playbook ([elaya.md](elaya.md) section 13) |

The phone screen `/m/elaya` has no mic (the demo's decorative one was removed because it did
nothing).

## Voice that arrives on WhatsApp

Two server-side paths call `transcribeAudio` directly, without the action:

- **Staff messages to Elaya** (`elaya-whatsapp.ts`, `transcribeWhatsAppAudio`): the Gupshup media
  URL is fetched (15-second timeout) and transcribed with the active staff first names as keyword
  boosts, so "Arfam" is heard as Arfam and not "Arapham". This happens before the daily cap, the
  model or anything is saved. The transcript becomes one ordinary message (one slot of the daily
  cap), stored with `meta.voice = true`. An empty transcript gets a "couldn't catch that" reply
  with nothing saved; a download or transcription failure falls to the gate's catch and gets the
generic unavailable line (`REPLY_UNAVAILABLE`). The message is still handled and never becomes a
lead.
  A wrong name that still slips through is caught by `find_teammate`'s sound-alike match, which
  asks before assigning.
- **Prospects replying to customer Elaya** (`elaya-customer.ts`): the voice note is transcribed
  (no boost) and handled as text. See [customer-welcome-blast.md](customer-welcome-blast.md).

## Invariants (never weaken)

1. **Audio is never stored.** It is transcribed in memory, sent to Deepgram under their
   no-training, zero-retention API terms, and discarded. No service or action logs audio bytes or
   transcripts. This is the D-01 carve-out in the Decision Log: raw audio cannot be pseudonymised,
   so it is never kept.
2. **One vendor call site.** Only `transcription-service.ts` talks to Deepgram, and it is
   `server-only`.
3. **Never auto-sends.** The transcript is appended to the consumer's draft; the consumer's own
   save path (which owns sanitising and cache invalidation) submits it. A garbled transcript is
   always reviewable first. On WhatsApp there is no draft, so the transcript is the message; any
   state-changing write it triggers still waits for a typed yes (the Elaya confirmation rule).
4. **The MIME type travels with the recording.** Safari records `audio/mp4`, Chrome
   `audio/webm;codecs=opus`, Firefox and Gupshup `audio/ogg;codecs=opus`; the real type is passed
   to Deepgram, never hardcoded (`audio/webm` only when the browser gives none).
5. **The recorder cleans up after itself.** Closing a modal mid-recording releases the mic.
6. **`onBusyChange(busy)`** is `true` while recording or transcribing. Form consumers use it to
   hold their Save while a take is in flight; composers ignore it.

## Env

`DEEPGRAM_API_KEY`, server only, never `NEXT_PUBLIC_` (S-11). See
[../operations/environments.md](../operations/environments.md).

## Related

- Elaya's voice input and the WhatsApp staff gate: [elaya.md](elaya.md) section 9.
- The `/whatsapp` page: [../pages/whatsapp.md](../pages/whatsapp.md).
- Lead notes and the call modal: [../pages/lead-dossier.md](../pages/lead-dossier.md).
