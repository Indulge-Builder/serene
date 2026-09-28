# Freshdesk contact notes: what was imported, what is left

> **Purpose:** the record of the one-off import of the Notes tab on Freshdesk contacts into the member twin and the member vault, and the place to come back to for what is still parked.
> **Audience:** the founders and whoever picks up the parked contacts; engineers re-running the import.
> **Source-of-truth scope:** this import only. The vault itself is documented in `../modules/members.md`; the Freshdesk mirror (which does not fetch contact notes) in `../integrations/freshdesk.md`.
> **Last verified:** 2026-09-26 against `scripts/members/import-freshdesk-notes.ts`, migration 0236, `src/lib/services/member-observation-reader.ts`, and the changelog entry of 2026-09-24. The counts are from the import run of 2026-09-24 and were not re-measured.

---

## The source

The Notes tab on a Freshdesk contact, exported by hand on 2026-09-24: 2,908 notes on 690
contacts, February 2024 to 22 September 2026, written by 40 staff. The file lives outside git at
`cleint-data/fd-client-notes-2026-09-24.csv` (the folder is git-ignored). The Freshdesk mirror
does not fetch contact notes, so this export is the only copy in Serene.

## How a note was matched to a member

The script links a note to a member only through `member.members.freshdesk_contact_id` equal to
the note's contact id. A note whose contact has no such member is skipped. The 2026-09-24 notes
say the unmatched contacts were also checked by phone, email and name with no match; that check
is not in the script. TODO: verify how it was done.

## What happened to each note

| Lane | Notes | Where it went |
| --- | --- | --- |
| Card, Aadhaar, passport, PAN, licence (by title, or by the number's shape) | 321 | The member vault, encrypted (migration 0236): 124 passports, 72 Aadhaar, 76 cards, 26 PAN, 15 licences, 8 other. Shown on the member page under "Cards & documents"; opened only with a stated reason, on record, for 60 seconds |
| Address (the title says "address") | 376 | One address fact each, keyed by the title (home, office, Mumbai, a family member's name) |
| Everything else about the member | 1,059 | Read by the Observation reader, the same one the member page's box uses: 2,948 facts, 787 relations, and every note kept as a note fact |
| Empty or image-only (a photo of a passport that did not export) | 304 | Skipped. The image is still in Freshdesk |
| Contact matches no member | 848 (369 contacts) | Skipped. See below |

Members touched: 317 of the 321 members the notes matched. Facts by facet: identity 734, address 528, preference
339, interest 357, family 335, contact rule 261, dietary 167, travel 142, occasion 63, budget 22,
plus 1,058 notes. Zero facts carry a card, Aadhaar or PAN number (checked after the run).

Every row the import wrote carries `source = 'freshdesk_note'` (0236 added that value to
`member_facts.source`; the new `member_vault` table allows `manual` and `freshdesk_note`) and the
Freshdesk note id in its evidence or `source_ref`, which is what makes a re-run skip it.

**The re-read.** 257 long notes first came back as notes only: the reader's answer was cut at 900
tokens. The cap was raised to 2,400 (`member-observation-reader.ts`) and the 285 note-only notes
were re-read the same day with `--reread`: 145 gave 532 more facts and 295 relations; 140 still
gave nothing (names, one-liners) and stay as notes. Final: 5,367 rows from the notes (1,058 of
them the notes themselves) on 317 members.

## What is left to do

- **369 contacts (848 notes) match no member.** By their Freshdesk category: 82 Queendom, 52
  Kingdom, 234 none. Most are probably family members, spouses, past members and leads. Two ways
  forward: (a) a founder or bishop names who they are, we add them as members (or set the
  `freshdesk_contact_id` on the right member) and re-run; (b) a household model that can hold a
  spouse's documents under the member. Today the vault is keyed to the member only, with no link
  to a person on the membership, so a spouse's passport has no proper home.
- **304 empty notes** are photos the export did not carry (most "Passport" notes). If those
  matter, they need Freshdesk's API (attachments on contact notes) or a hand download.
- **Card details.** 76 card items are in the vault, some with the CVV, as the founder decided.
  Written member consent for card-on-file is not recorded anywhere in Serene. Card network rules
  forbid a merchant keeping the CVV after a payment; Indulge holds these as the member's agent,
  which the founder judged a different position (changelog 2026-09-24).
- **Live contact notes.** The Freshdesk API could pull contact notes into the mirror. Only worth
  building if the team keeps writing notes in Freshdesk.

## How to re-run

The script imports server code that carries `server-only`, so it needs a tsconfig shim that maps
`server-only` to an empty module (kept outside the repo).

```bash
# dry run: counts and a report, nothing written
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts

# write; a note already imported is skipped
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts --apply

# only notes on file that gave no facts, read again
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts --reread --apply
```

Other flags: `--limit N` (do at most N notes), `--lane reader|address|vault` (one lane only).
The report holds real names, so it is written outside the repo, to
`~/Desktop/serene-backups/fd-notes-import-*.md`.

A fresh export can be dropped in at the same path (the script reads that one file name): the run
is idempotent on the note id, so only new notes are added.
