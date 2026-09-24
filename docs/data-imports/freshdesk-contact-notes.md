# Freshdesk contact notes: what was imported, what is left

The Notes tab on a Freshdesk contact, exported by hand on 2026-09-24 (2,908 notes on 690
contacts, February 2024 to 22 September 2026, written by 40 staff). The file lives OUTSIDE git at
`cleint-data/fd-client-notes-2026-09-24.csv` (the folder is git-ignored). This page is the place to
come back to. Counts are from the import run of 2026-09-24.

## What happened to each note

| Lane | Notes | Where it went |
| --- | --- | --- |
| Card, Aadhaar, passport, PAN, licence (by title or by the number's shape) | 321 | The member vault, encrypted (migration 0236). Shown on the member page under "Cards & documents"; opened only with a stated reason, on record |
| Address (title says "address") | 376 | One address fact each, keyed by the title (home, office, Mumbai, a family member's name) |
| Everything else about the member | 1,059 | Read by the Observation reader, the same one the member page's box uses: 2,948 facts, 787 relations, and every note kept in the Notes list |
| Empty or image-only (a photo of a passport that did not export) | 304 | Skipped. The image is still in Freshdesk |
| Contact matches no member in Serene | 848 (369 contacts) | Skipped. See below |

Members touched: 317 of the 321 linked. Facts by facet: identity 734, address 528, preference
339, interest 357, family 335, contact rule 261, dietary 167, travel 142, occasion 63, budget 22,
plus 1,058 notes. Zero facts carry a card, Aadhaar or PAN number (checked after the run).

## What is left to do

- **369 contacts (848 notes) match no member** by Freshdesk id, phone, email or name. By their
  Freshdesk category: 82 Queendom, 52 Kingdom, 234 none. Most are probably family members,
  spouses, past members and leads. Two ways forward: (a) a founder or bishop names who they are
  and we add them as members or as people on a member, then re-run; (b) a "household" model that
  can hold a spouse's documents under the member. Nothing in Serene can hold them today.
- **304 empty notes** are photos that the export did not carry (most "Passport" notes). If those
  matter, they need Freshdesk's API (attachments on contact notes) or a hand download.
- **257 long notes read as note-only on the first pass** (bios and long preference lists; the
  reader's answer was cut at 900 tokens). The cap was raised and those notes re-read the same day;
  see the changelog entry for the numbers.
- **Card details.** 76 card items are in the vault, some with the CVV, as the founder decided.
  Written member consent for card-on-file is not on record anywhere in Serene.
- **The Freshdesk API** could pull contact notes live (the mirror does not fetch them today). Only
  worth building if the team keeps writing notes in Freshdesk after the move.

## How to re-run

```
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts            # dry run, report outside the repo
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts --apply    # writes; a note already imported is skipped
npx tsx --tsconfig <server-only shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts --reread --apply   # only notes on file with no facts from them
```

A fresh export from Freshdesk can be dropped in at the same path: the run is idempotent on the
note id, so only new notes are added.
