# Elaya Evals — the exam

The exam paper for Elaya (master-plan Step 1a). Real staff messages with answer
keys, run against the LIVE app end to end, scored on what actually happened:
the reply, the persisted tool calls with full arguments, and the proposal rows
in `elaya_actions`.

Written in Python on purpose: the harness drives the app from OUTSIDE (HTTP +
database), so the exact same exam tests today's Node backend and tomorrow's
Python backend. It is both the quality harness and the migration referee — the
Python brain port (master-plan Step 3) flips only when it scores equal or
better here.

## How it works

```text
run.py
  1. signs the eval user in (Supabase password grant) and builds the same
     session cookie the browser carries
  2. per case: creates a FRESH conversation via the service role (isolation —
     no history bleed between cases), sends each step to POST /api/elaya/chat,
     parses the SSE stream
  3. verifies against the DATABASE: the assistant row's tool_calls (names +
     full args) and the latest elaya_actions row (proposal lifecycle)
  4. archives the eval conversation (it never becomes the user's real session)
  5. prints the score, writes results/<stamp>.json
```

## Setup (once)

1. `pip install -r requirements.txt` (requests + pyyaml)
2. Create a dedicated eval user in Serene: role **manager**, any Gia domain,
   with a password login. Never use a real person's account (eval runs burn the
   user's 200/day Elaya cap and, with `--allow-writes`, create real tasks).
   The `client-*` cases need a **concierge** identity with a queendom (0201 makes
   queendom + Sia role concierge-only, and the client tools scope rows to the
   reader's queendom): tag `needs-concierge`, run with a second eval login that is
   a concierge manager in Anishqa Queendom, or skip them by default.
3. Create `evals/.env.eval` (gitignored):

   ```text
   EVAL_USER_EMAIL=eval-manager@indulge.global
   EVAL_USER_PASSWORD=...
   EVAL_BASE_URL=http://localhost:3000
   ```

   Supabase URL + keys are read from the repo's `.env.local` automatically.
4. For the `needs-seed` cases: create a test lead named **"Testak Evalson"**
   in the eval user's domain, assigned to the eval user. The lead-write and
   confirmation cases target that name so they can never touch a real client.

## Running

```bash
python3 run.py                            # safe read-only cases
python3 run.py --allow-writes             # + cases that create tasks/notes
python3 run.py --include-tags needs-seed --allow-writes   # + seeded-lead cases
python3 run.py --only confirm             # id substring filter
python3 run.py --base-url https://<staging-url>
```

Output per case: `PASS` / `FAIL` (with the exact failed checks), `SKIP`,
`KNOWN` (a documented gap, tracked separately), or `★ FIXED` (a known-gap case
that started passing — move it to a normal case and celebrate).

## The rules

1. **No AI change ships without a run.** Prompt tweak, tool description edit,
   model row change, the Python port — run the exam before and after. Score up,
   ship. Score down, fix first.
2. **Failures become cases.** Every real-world bug that reaches us gets a
   golden case reproducing it BEFORE it gets fixed, so it can never silently
   return.
3. **Grow the set from real messages.** Pull fresh phrasings from
   `elaya_messages` regularly — the team's actual language (Hinglish, voice
   artifacts, name variants) is the distribution that matters, not tidy
   English test sentences.
4. **Known gaps stay in the file.** A `known_fail` case is a tracked TODO with
   a proof-of-fix built in.

## Writing a case

```yaml
- id: my-case
  source: real | synthetic
  mutates: true            # only if it writes data
  tags: [needs-seed]       # only if it needs the seeded lead / a role
  known_fail: true         # only for documented gaps
  steps:
    - send: "the message"
      expect:
        tools: [tool_that_must_be_called]
        tools_any_of: [a, b]
        tools_none: [wrong_tool]
        tool_count: { create_subtask: 2 }
        tool_args:
          - tool: create_personal_task
            contains: { dueAt: "T16:00" }
        reply_any: ["substring"]
        reply_none: ["what should the title"]
        action_row: { action_type: update_lead_status, status: proposed }
        action_row_not: { status: executed }
```

Multi-turn (confirmation flows): add more `send` steps — the case keeps its
conversation, so proposals resolve exactly like production.

## The founders' set (`golden/founders.yaml`, 2026-09-24)

Twenty-five questions the founders and the tech admin actually asked on WhatsApp and in the app
between June and September 2026, with the expectations a right answer met: which tool it reached,
what it must never say ("send it as its own message", "not in my hands this turn", "none of that
was real"), and what it must mention. Every case carries `tags: [founder]` because most of them need
the analyst's tools (query_database, the live pulse, the deep read), which the eval manager account
cannot reach. Run them with a founder or admin eval login in `.env.eval` and
`python3 run.py --golden golden/founders.yaml --include-tags founder`. Three cases mutate (they create
real tasks); add `--allow-writes` only against a test teammate.
