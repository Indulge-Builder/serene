#!/usr/bin/env python3
"""Tag the concierge roster in sia.wag_contacts (participant_role: queen / bishop / genie).

The founder's roster (2026-09-16) has names, not numbers. Staff WhatsApp display names
follow the "Name at Indulge" convention, so each roster name is matched to its contact
rows by display name; one human often has several rows (work + personal numbers), and
all of them get the role. Rules, in order:
  1. an explicit override (the founder's answers for the ambiguous names),
  2. the FULL roster name inside the display name,
  3. the FIRST name + the word "indulge" in the display name.
A first name that matches several DIFFERENT people (or nobody) is reported and skipped —
never guessed. Only the roster is tagged; everyone else keeps their current role.

DRY-RUN by default. `--apply` writes.
  set -a && source .env.local && set +a
  python3 scripts/sia-tag-staff-roster.py          # report
  python3 scripts/sia-tag-staff-roster.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

BASE = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

ROSTER: dict[str, dict[str, list[str]]] = {
    "anishqa": {
        "queen": ["Anishqa Bhagia"],
        "bishop": ["Sagar Ali", "Iqbal Ali"],
        "genie": ["Rutika Kale", "Ekta Nihalani", "Dhanush K", "Eeti Srinivsulu", "Ria Pujhari",
                  "Charlotte Dias", "Rupali Chodankar", "Pranav Gadekar", "Isha Shinde"],
    },
    "sanika": {
        "queen": ["Sanika"],
        "bishop": ["Aditya Sonde"],
        "genie": ["Kshathriya C C A", "Shanaya Javeri", "Depender Kaur", "Gunjan Sodha",
                  "Hrishikesh Badgujar", "Shalak Katkar", "Nandini Darbhamulla",
                  "Mustafa Kothari", "Mustafa Hussain"],
    },
    "ananyshree": {
        "queen": ["Ananyshree Munshi"],
        "bishop": ["Bhavarth Pandey", "Shaurya Verma"],
        "genie": ["Ajith Sajan", "Palak Kataria", "Aachal Parate", "Marlene Fernandes",
                  "Sakshi Bhutkar", "Athul Jose", "Rishabh Antil", "Khushi Shah"],
    },
}

# The founder's answers (2026-09-17) for the names the convention could not settle.
# value = the exact display names that ARE this person (case-insensitive); [] = skip.
OVERRIDES: dict[str, list[str]] = {
    "Aditya Sonde": ["Aditya at Indulge", "Aditya Indulge Personal"],   # NOT Aditya Inamdar
    "Mustafa Hussain": ["Mustafa at Indulge"],
    "Mustafa Kothari": [],                                             # number not in the archive yet
    "Kshathriya C C A": ["Kshatriya"],                                 # spelled Kshatriya on WhatsApp
}


def norm(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z ]", " ", s.lower()).split()


def get_all(path: str, page: int = 1000):
    rows, start = [], 0
    while True:
        h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "sia",
             "Range-Unit": "items", "Range": f"{start}-{start + page - 1}"}
        chunk = json.load(urllib.request.urlopen(urllib.request.Request(f"{BASE}/rest/v1/{path}", headers=h), timeout=120))
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        start += page


def patch(jid: str, body: dict) -> None:
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Profile": "sia",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    req = urllib.request.Request(f"{BASE}/rest/v1/wag_contacts?jid=eq.{urllib.parse.quote(jid)}",
                                 method="PATCH", data=json.dumps(body).encode(), headers=h)
    urllib.request.urlopen(req, timeout=60).read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not BASE or not KEY:
        print("✗ source .env.local first"); return 1

    contacts = get_all("wag_contacts?select=jid,push_name,participant_role&push_name=not.is.null")
    plan: list[tuple[str, str, str, list[dict]]] = []   # (queendom, role, name, rows)
    skipped: list[tuple[str, str]] = []

    for queendom, roles in ROSTER.items():
        for role, names in roles.items():
            for name in names:
                toks = norm(name)
                if name in OVERRIDES:
                    wanted = {n.lower() for n in OVERRIDES[name]}
                    rows = [c for c in contacts if (c["push_name"] or "").strip().lower() in wanted
                            or (wanted and any(norm(c["push_name"])[:1] == norm(w)[:1] and w.lower() == "kshatriya" for w in wanted)
                                and "kshatriya" in norm(c["push_name"]))]
                    if not wanted:
                        skipped.append((name, "no number in the archive yet")); continue
                else:
                    full = [c for c in contacts if set(toks) <= set(norm(c["push_name"]))]
                    conv = [c for c in contacts if toks[0] in norm(c["push_name"]) and "indulge" in norm(c["push_name"])]
                    rows = full or conv
                    # a first-name convention match must not span two different surnames
                    surnames = {tuple(t for t in norm(c["push_name"]) if t not in {toks[0], "at", "indulge", "global", "personal", "house", "for", "trainee"}) for c in rows}
                    if not full and len({s for s in surnames if s}) > 1:
                        skipped.append((name, f"several different people share the first name: {[c['push_name'] for c in rows][:4]}")); continue
                if not rows:
                    skipped.append((name, "not found by display name")); continue
                plan.append((queendom, role, name, rows))

    print(f"roster people: {sum(len(n) for r in ROSTER.values() for n in r.values())} | tagging: {len(plan)} | skipped: {len(skipped)}")
    for q, role, name, rows in plan:
        already = all(c["participant_role"] == role for c in rows)
        print(f"  {q:11} {role:6} {name:22} ← {len(rows)} row(s): {[c['push_name'] for c in rows][:3]}{' (already)' if already else ''}")
    for name, why in skipped:
        print(f"  SKIP {name}: {why}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply."); return 0
    n = 0
    for _, role, _, rows in plan:
        for c in rows:
            if c["participant_role"] != role:
                patch(c["jid"], {"participant_role": role}); n += 1
    print(f"✓ tagged {n} contact rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
