# Elaya's hands: the second WhatsApp number

The process behind `docs/architecture/hands-plan.md`, Layer A (migration 0245). It holds ONE
WhatsApp session, the hands number, and does two things:

- **Inbound**: every message from a number on `hands.allowed_contacts` is recorded raw
  (`hands.raw_events`), filed once (`hands.messages`, idempotent on jid + message id), attached
  to the open thread for that contact, and written to the ticket as a `hands_message` event
  (or `payment_request` when the agent asks us to scan a QR). Images and files are copied into
  the private `hands-media` bucket. A message from any other number is recorded raw and dropped.
- **Outbound**: it polls `hands.outbox` every few seconds and sends what Serene queued. Before
  each send it re-checks the allowlist and that the thread is still open; a row that fails
  either is marked `refused`, never sent. A sent row gets its WhatsApp id and a `hands_sent`
  ticket event. Nothing else in Serene can send from this number.

It is a separate process from the Sia watcher in `connector/`. It imports the watcher's pure
modules (config parsing, the Postgres auth store, jid normalisation) by relative path and
keeps its own session in `hands.auth_state`. Stopping one never touches the other.

## Run on a laptop

```bash
cd connector-hands
npm install            # or: ln -s ../connector/node_modules node_modules (same versions)
npm start              # prints a QR; scan it with the HANDS phone, never the watcher phone
```

The phone that scans must be the hands number (the Indulge SIM that Instinct is loaded on).
Once connected the row `hands.connector_status` (id 1) shows `connected` and a heartbeat.

Headless: set `HANDS_PAIR_NUMBER=91XXXXXXXXXX` in `.env.local` and it prints a pairing code
instead of a QR.

Env keys (all in the repo's `.env.local`, read by the watcher's parser):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `HANDS_PAIR_NUMBER`,
`HANDS_MEDIA_BUCKET` (default `hands-media`), `HANDS_OUTBOX_POLL_MS` (default 3000).

## First conversation

1. Apply migration 0245 (`supabase db push`).
2. Add Instinct's number on `/settings/hands` (or one row in `hands.allowed_contacts`):
   `<digits>@s.whatsapp.net`, a label, and the agent vendor it stands for (`vendors.kind = agent`).
3. Open a Talk thread or set the agent as a ticket's vendor and open the ticket thread.
4. Queue a line (the page or Elaya's `send_hands_message`). Within a poll it leaves the phone.

## Docker (Fargate)

Build from the repo root, because of the relative imports:

```bash
docker build -f connector-hands/Dockerfile -t hands-connector .
```

The container is disposable: session in Postgres, files in Storage.

## Laws

- One sender: only the outbox loop calls `sendMessage`.
- Allowlist fail-closed, re-read every minute.
- Raw first, then parse.
- Never the watcher's tables, never the watcher's phone.
