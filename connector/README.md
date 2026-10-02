# Sia Connector — the WhatsApp watcher

The Baileys ear for Sia (master-plan Step 4a / plan-whatsapp W3). It links to a
dedicated WhatsApp number, sits silently in client/vendor groups, and writes every
event into the `wag_` tables (migration 0169).

**READ-ONLY BY LAW.** This process never sends a WhatsApp message. There is no
`sendMessage` call anywhere in `src/`, and there must never be one (plan-whatsapp
§6.1). A silent member is what keeps the number un-flagged.

## Architecture (the thin-handler discipline)

```
socket event  →  in-memory queue  →  return          (milliseconds, always)
drain loop    →  raw insert (wag_raw_events)  →  normalize  →  wag_ rows
media worker  →  download + DECRYPT  →  local store   (concurrency 2, retry→dead_letter)
```

The socket handler does two things only: enqueue and return. All heavy work
(raw insert, normalize, media download) runs off the stream. This is why a
200MB video can never back up the event stream and drop messages.

## Contracts

- **Raw first.** Every event lands in `wag_raw_events` before parsing. A normalizer
  bug is fixed by replaying from raw — nothing is ever lost.
- **Idempotent.** Messages upsert on WhatsApp's identity triple `(chat_jid,
  wa_message_id, sender_jid)` + `wa_timestamp` — dual watchers, redeliveries, and
  replays all land exactly once.
- **Facts never mutate.** Edits become new rows chained via `edit_of_wa_message_id`;
  delete-for-everyone flips `is_revoked`; reactions are current-state.
- **Direct service-role writes.** No webhook hop (plan-whatsapp §10.2).

## Run (pilot — one number, local machine)

```bash
cd connector
npm install
npm start          # prints a QR — scan it with the WATCHER phone
                   # (WhatsApp → Settings → Linked Devices → Link a Device)
```

Reads Supabase creds from `../.env.local`. Session credentials persist to
`connector/auth/` (gitignored) — a restart never needs a re-scan. Media downloads
to `connector/media/` for the pilot; the S3 swap lands with Sia W1.

**The watcher phone must come online at least every ~14 days** or WhatsApp
unlinks the device (Baileys/WhatsApp Web behaviour). Keep the SIM in a charged,
Wi-Fi-connected phone.

## What it captures

Messages (text/media/voice/location/contact/poll/system), edits, deletes,
reactions, read receipts, group metadata, membership changes, and recent history
on join. Media rows are queued and downloaded; failures retry inside the expiry
window then mark `dead_letter` (the orphaned-media list).

## Deploy (later — Sia W1)

Moves to its own ECS Fargate container (separate from the Python backend, so a
backend deploy never drops the WhatsApp connection). Media store swaps local → S3.
Dual watchers (two numbers) land with the same move. Until then: one number, run
locally, prove the pilot.

## Env

| Var | From | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `../.env.local` | database |
| `SUPABASE_SERVICE_ROLE_KEY` | `../.env.local` | direct writes |
| `WAG_AUTH_DIR` | optional | session store (default `connector/auth`) |
| `WAG_MEDIA_DIR` | optional | media store (default `connector/media`) |

## The history harvester (`src/harvest.ts`)

A separate laptop program, never the watcher. It links to one staff phone for one sitting, takes
the history WhatsApp hands a new linked device, keeps linked member groups only, skips what the
archive holds, then unlinks and deletes its login. Plan and laws:
`docs/architecture/sia-resilience-plan.md` section 8b.

```bash
npm run harvest -- --label bench --selftest --max-groups 3   # no phone, no writes
npm run harvest -- --label advita                            # dry run: links, counts, writes nothing
npm run harvest -- --label advita --apply                    # files the history
npm run harvest -- --label advita --apply --deep             # and walks further back
```

Keep the phone unlocked and on Wi-Fi while it runs. Never run it against the watcher's number.
