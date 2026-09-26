# Elaya's eyes: reading images, files, voice and video

Written 2026-09-26. Status: **PLAN, nothing built.** Decisions the founder must make are marked
**DECIDE**.

## 1. The problem in one paragraph

Elaya reads text only. When a member sends a photo of a bill, a screenshot of a booking, a PDF
itinerary or a voice note, Serene stores the file safely but no model ever looks at it. The member
profiler, the ticket intake, the ticket draft, the member 360 and the briefing all see either the
caption or nothing. Today that is a large blind spot, measured on production on 2026-09-26:

| Where | What is sitting unread |
| --- | --- |
| Sia member groups (`sia.wag_media`) | 28,038 images, 43% with no caption at all; 1,557 videos; 3,402 documents; 974 voice and audio notes (575 with no text near them) |
| Freshdesk mirror (`freshdesk.conversations.attachments`) | 59,095 notes carry a file; 26,713 notes are a file and nothing else |
| Lead WhatsApp (`public.whatsapp_messages`) | images and voice notes from prospects, caption only |
| Elaya herself | a staff member who sends her an image on WhatsApp gets "I can only read text" |

The only place Serene reads a file today is the vendor extractor, which hands Freshdesk bills to the
model as file parts. That proves the provider layer can carry images and PDFs. Nothing else uses it.

## 2. The shape, in one sentence

**Understand every file once, at the moment it lands, into plain text and a few structured fields.
After that, every reader stays a text reader.**

This is how the leading products do it (Intercom Fin, Notion AI, Slack AI, Glean): a file is read
by a small vision model at ingestion, the result is stored beside the message, and search, summaries
and chat all read the stored text. Nobody sends 28,000 images into a chat prompt. It is cheaper,
faster, and every reader gets the same reading.

So Elaya does not become a vision model. She gets a **library of readings**, and a way to ask for
a fresh reading when a file has not been read yet.

## 3. One table: `media_readings`

One row per file, whatever source it came from. Migration (next free number).

```text
public.media_readings
  id               uuid PK
  source           text   sia_media | freshdesk_attachment | lead_whatsapp | hands_media | elaya_turn
  source_ref       text   the source row's id (wag_media.id, "conv:<id>:<n>", whatsapp_messages.id, ...)
  bucket, path     text   where the bytes are (never a public url)
  mime             text
  kind             text   image | pdf | document | audio | video
  status           text   queued | reading | done | failed | skipped | dead
  attempts         int    stops at 3; a dead row is never re-billed and stays queryable
  class            text   what the file IS (section 5)
  sensitive        bool   card / ID / passport / bank statement (section 6)
  summary          text   ONE line, what a teammate would say ("Bill from Taj, ₹18,400, 14 Sep")
  description      text   a short paragraph
  extracted_text   text   the words in the file (OCR / transcript); NULL when sensitive
  fields           jsonb  amount_inr, currency, date, merchant, booking_ref, from, to, people_count ...
  language         text
  confidence       numeric 0..1
  model, prompt_version, input_tokens, output_tokens, cost_usd, duration_ms
  read_at          timestamptz
  UNIQUE (source, source_ref)
```

RLS on. Admin and founder may read (a small "Readings" health panel on /settings). Service role
writes. A re-read with a newer prompt version updates the row in place; the ledger of runs is
`sia.extraction_runs` (kind `media_reading`), which the profiler already writes.

The vendor extractor already reads Freshdesk bills. It should read from this table first and write
its own reading here when it pays for one, so a bill is never read twice. That is one change in
`vendor-extract.ts`, not a second table.

## 4. The reader cascade: cheap first, escalate only when it earns it

All calls go through the Elaya provider (`lib/elaya/provider.ts`, the file part it already has),
the registry tiers, and `maskPii`. No new SDK, no new vendor account for step one.

| Kind | Step 1 (always) | Step 2 (only if step 1 says so) | Cost per file |
| --- | --- | --- | --- |
| Image | Resize to 1,568 px on the long side, ONE routing-tier call (Haiku 4.5): class, sensitive, summary, description, text, fields, confidence, plain-text fields | Reasoning tier (Sonnet 5) when class is bill / form / document AND confidence < 0.6, or the image is a dense screenshot | ~$0.004 (₹0.35); escalations ~$0.03 |
| PDF | Native PDF file part to the routing tier, first 20 pages; a text-layer PDF is also extracted locally first (free) and the model gets both | Reasoning tier for a contract or a multi-page itinerary when asked by a tool, never in the sweep | ~$0.01 to $0.05 |
| Word / Excel / other | Local text extraction only (the `xlsx` dependency is already here; `mammoth` for docx); no model call | none | ~$0 |
| Voice / audio | Deepgram nova-2 hi-Latn through `transcribeAudio()` (already THE call site); the transcript is the reading | none | $0.0043 a minute |
| Video | Audio track → Deepgram; up to 6 frames (one every N seconds, ffmpeg on Trigger.dev) → ONE routing-tier call with the frames and the transcript | A Gemini video adapter as a sibling adapter later, if frames prove too blind. Provider-neutral contract already allows it | ~$0.02 to $0.04 |

The escalation rule is data, not code: `elaya_settings.media_reading_escalate` names the classes
and the confidence floor, so the founder can tighten or loosen it without a deploy.

Every reading returns **plain-text fields, never JSON** (the plain-text rule the lesson writer and
the assessment already follow). The parser honours only the fields it knows.

## 5. What a file IS: the class list

The single most useful thing the reader produces is the class. It drives the fields, the
escalation, the privacy rule and the fold. `constants/media.ts`, mirrored by a SQL CHECK.

```text
bill_receipt      amount, merchant, date, items      → a vendor job's money, the ledger
booking_confirm   ref, from, to, dates, names count  → a ticket's outcome proof
ticket_pass       boarding pass, event ticket        → coming-up dates (member_coming_up)
itinerary         multi-leg plan                     → coming-up dates
menu_catalog      a restaurant menu, a brochure      → preferences
product_photo     a thing to buy                     → the request itself
place_photo       a venue, a room, a view            → the request or feedback
person_photo      people, a family photo             → describe, never identify
screenshot_chat   a WhatsApp / email screenshot      → the words inside it are the request
screenshot_app    an app or website screen           → the words inside it
form_document     a filled form, a letter            → the words inside it
id_document       Aadhaar, PAN, passport, licence    → SENSITIVE
payment_card      credit / debit card                → SENSITIVE
bank_statement    statement, cheque                  → SENSITIVE
qr_payment        a UPI QR                           → amount, payee (the hands' PAY step)
sticker_meme      chatter                            → skipped after step 1, costs nothing more
other
```

## 6. Privacy law for eyes

The most important section. Photos are where cards and IDs live.

- **Sensitive classes are described, never transcribed.** `id_document`, `payment_card`,
  `bank_statement`: the reading is "a payment card, front side" and nothing else. `extracted_text`
  is NULL, `fields` is empty. The prompt says so in the first line, and the parser nulls the text
  again if the model disobeys. A second, cheaper check runs on every extracted text: a 12 to 19 digit
  run, a PAN shape, an Aadhaar shape, a CVV next to a date → the reading is downgraded to sensitive.
- **A sensitive file raises a vault suggestion**, not a fact: a card on the member's page saying
  "the member shared what looks like a payment card in the group on 14 Sep; put it in the vault and
  ask them to delete the message". Nothing is copied into the vault by a machine (vault law).
- **People are described, never identified.** No "this is Mr X". Faces are "two adults and a
  child at a beach".
- **Names never reach the model.** The reader runs inside the same vault as the profiler
  (`openVault()` code names for a linked group) and `maskPii` for phones and emails, both on the
  caption it is given and on the text it returns before that text is folded into any prompt.
- **The reading lives with the file's access rules.** A Sia reading is visible to whoever may see
  that group (`getSiaViewerScope`); a Freshdesk reading to whoever may see that ticket; a
  lead-WhatsApp reading to whoever may see the lead. The reading is a column on the conversation
  the person is already allowed to read, never a new door.
- **The `elaya_read` view exposes summary, class and fields; never extracted text, never anything
  from a sensitive row.**

## 7. Where the readings are folded (one helper, every reader)

`media-readings-service.ts` exports `attachReadings(messages)`: given message rows that may carry
media, it returns them with a `reading` and a `reading_line` such as
`[image: bill from Taj Lands End, ₹18,400, 14 Sep]` or `[voice note: "can you book two seats for
Friday, the usual place"]`. One function, called by:

| Reader | Today | After |
| --- | --- | --- |
| Member profiler | text only, media messages invisible | the reading line stands in for the file; a bill becomes a fact, a boarding pass becomes a coming-up |
| Ticket intake sweep | `not text is null` drops every captionless image | media messages are included with their reading; a photo of a product IS a request |
| Ticket draft | text only | the reading, so the brief has the amount, the ref, the dates |
| Member 360 / `get_member_messages` | `type` field only | the reading line |
| Sia page | the image | the image, and under it one quiet line "Serene read: …" |
| Ticket timeline / Freshdesk dossier | attachment chips | the chip plus the summary as its label |
| Briefing and alerts | text only | the reading line in the window's record |
| Deep read / `query_database` | nothing | `elaya_read.media_readings` (summary, class, fields, message id) |
| Vendor extractor | reads bills itself | reads the table first, writes its reading back |

Because the fold is one helper, a message with no reading yet renders as `[image, not read yet]`,
so a model is never misled into thinking there was nothing there.

## 8. Live eyes: when someone shows Elaya something now

Three doors, one reader:

1. **WhatsApp to Elaya.** A staff image or PDF arrives → `getMediaDownloadUrl` (exists) → the
   file is read on the spot (source `elaya_turn`) → the turn continues as text: the user's caption
   plus the reading line, and the answer is written as before. The "I can only read text" reply
   goes away. Voice notes already work this way through Deepgram; images and files join them.
2. **In-app attach.** A paperclip on the Elaya composer (the `DictationButton` posture: one
   component, `MessageBar leadingSlot`). The file is uploaded to a private `elaya-turns` bucket,
   read, and folded into the turn the same way.
3. **A tool: `look_at_file(message_id)`.** When Elaya is asked about an image that has not been
   read yet (the sweep is behind, or the file is old), the tool reads it now, stores the reading,
   and returns it. The same tool answers "what did the member send on the 14th" for any file.

Both brains get the same fold; the Python brain's turn builder mirrors the Node one line for line,
as persona hints do today.

## 9. The sweep and the money

- **`media-reader` task on Trigger.dev, every 5 minutes**, gated by
  `elaya_settings.media_reading_enabled` (ships OFF). It claims queued rows keyset-paged, reads
  `MEDIA_READ_PARALLEL` at a time behind the deep read's rate gate (moved to
  `lib/elaya/rate-gate.ts` so both use one; never a second copy), saves each reading as it lands,
  counts a failed attempt, and stops at 3 (dead, never re-billed, still listed).
- **Enqueueing needs no triggers.** The sweep scans each source for stored files with no reading
  (anti-join, keyset on created_at) newest first. A file becomes readable the moment
  `download_status = done` or `storage_path` is set.
- **Priority:** live traffic first (files from the last 24 hours, Active members' groups, open
  tickets), then the backlog oldest-last. The backlog runs only inside a **daily budget**,
  `elaya_settings.media_reading_daily_cap_usd` (proposed $15). At the cap the sweep stops and the
  live lane keeps a reserve of 20%. Every reading's cost is on its row; the settings panel shows
  today's spend and the backlog left.
- **Kill switch:** the enabled row. **Cost ledger:** `sia.extraction_runs`.

### What the whole backlog costs, once

| Source | Files | Estimate |
| --- | --- | --- |
| Sia images | 28,038 | ~$110 with 10% escalations |
| Sia videos | 1,557 | ~$45 |
| Sia documents (mostly PDFs) | 3,402 | ~$60 |
| Sia voice and audio | 974 | ~$5 |
| Freshdesk files with a stored copy | up to 59,095 notes; bills already read by the vendor extractor | **DECIDE** whether to read history or only new files; full history ~$200 |
| **Total, everything** | | **about $420 (₹35,000) once; then roughly $1 to $2 a day** |

At the proposed cap the Sia backlog clears in about two weeks without touching the live lane.

## 10. Quality: how we know the eyes are good

- `scripts/media/read-bench.ts`: 60 real files picked by hand across the classes (bills, boarding
  passes, chat screenshots, menus, a card, an ID, memes), read with the current prompt, the report
  written OUTSIDE the repo (the profiler bench posture). The founder marks each reading right,
  partly right, wrong. A prompt change reruns the same 60 for about ₹25.
- `prompt_version` on every row. A better prompt can re-read the rows that matter (bills first).
- The lesson loop later: when a genie corrects a ticket brief whose amount came from a reading, the
  draft review already records it; the lesson writer can name what the eyes get wrong.

## 11. Build order

| Step | What | Size |
| --- | --- | --- |
| 0 | Migration: `media_readings`, the settings rows, the `elaya-turns` bucket, the `elaya_read` view; `constants/media.ts`; `media-readings-service.ts` with `attachReadings` | half a day |
| 1 | The image reader (routing tier, resize, plain-text fields, the sensitive rule and the digit check) + the sweep for `sia.wag_media` + the fold in profiler, intake, draft, member 360, Sia page line | 1.5 days |
| 2 | PDFs and office files; Freshdesk attachments as a source; the vendor extractor reads the table first | 1 day |
| 3 | Voice, audio and video (ffmpeg extension on Trigger.dev; frames + transcript) | 1 day |
| 4 | Live eyes: WhatsApp images to Elaya, the in-app paperclip, `look_at_file`; both brains | 1 day |
| 5 | Backlog under the daily cap; the settings panel with spend and backlog; the bench and the first founder review | half a day |

Step 1 alone removes the worst of it: the 28,000 Sia images become part of what the profiler and
the intake see, and a member's photo of a product is finally a request.

## 12. DECIDE

1. **Daily cap** for the backlog (proposed $15, about ₹1,250) and whether to run the backlog at all
   before the live lane has run for a week.
2. **Freshdesk history:** read every stored file (about $200) or only new files from now on, with
   bills already covered by the vendor extractor.
3. **Sensitive files:** description only (proposed), or also a last-four for cards to match the
   vault's `lastFourOf`. Proposal is no digits at all from a photo.
4. **Video:** frames plus transcript (proposed, cheap, reuses everything) or a Gemini adapter from
   day one (better on motion, a new vendor and a new key).
5. **Lead WhatsApp media** (prospects): read it too, or Sia and Freshdesk only for now.
