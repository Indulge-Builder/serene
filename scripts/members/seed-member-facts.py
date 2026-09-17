#!/usr/bin/env python3
"""
scripts/members/seed-member-facts.py — seed STORE 2 (public.member_facts, migration 0194) from
what Atlas, the onboarding forms, the Freshdesk contacts and the member sheets already know.

Sources → facts (member-ticket-plan.md 5.6), each row carrying source, confidence, evidence,
observed_at, and the member resolved by Atlas member id → phone, or by phone alone:
  cleint-data/atlas-client-data.csv       Atlas members: phone → member; notes → facet note
  cleint-data/altas-cleint-profile.csv    personal / travel / lifestyle / passions (source atlas, 0.9)
  cleint-data/atlas-cleint-sources.csv    the Typeform answers (source typeform, 0.9, raw answer as evidence)
  freshdesk.contacts.custom_fields        the 40 preference fields (source freshdesk_contact, 0.9)
  export-1.csv / export-2.csv             city, company (source import, 0.9)

Idempotent: a fact is skipped when the same (member, facet, key, value, source) already exists.
DRY RUN by default: prints the counts per facet and source. --apply writes in batches.

Usage:
  set -a && source .env.local && set +a
  python3 scripts/members/seed-member-facts.py            # dry run
  python3 scripts/members/seed-member-facts.py --apply
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DATA = "cleint-data"
DIGITS = re.compile(r"\D")


def rest(method, path, body=None, schema=None, prefer=None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if schema:
        headers["Accept-Profile" if method == "GET" else "Content-Profile"] = schema
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{BASE}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def get_all(path, schema=None, page=1000):
    out, off = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        rows = rest("GET", f"{path}{sep}limit={page}&offset={off}", schema=schema) or []
        out.extend(rows)
        if len(rows) < page:
            return out
        off += page


def last10(phone: str | None) -> str | None:
    d = DIGITS.sub("", phone or "")
    return d[-10:] if len(d) >= 10 else None


def load_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def clean(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip().strip('="')
    if not s or s in ("-", "—", "N/A", "n/a", "null", "None", "[]", "{}", "Many"):
        return None
    return s


def as_list(v) -> list[str]:
    """A JSON list, a comma-separated string, or a single value → list of clean strings."""
    if v is None:
        return []
    if isinstance(v, list):
        return [clean(x) for x in v if clean(x)]
    s = clean(v)
    if not s:
        return []
    if s.startswith("["):
        try:
            return [clean(x) for x in json.loads(s) if clean(x)]
        except json.JSONDecodeError:
            pass
    return [p.strip() for p in re.split(r"[,/|;]", s) if p.strip()]


# facet, key, polarity for each known input field name (Atlas / Typeform / Freshdesk contact).
FIELD_MAP: dict[str, tuple[str, str, str]] = {
    # identity
    "date_of_birth": ("identity", "birthday", "neutral"), "birthday": ("identity", "birthday", "neutral"),
    "Date of Birth": ("identity", "birthday", "neutral"),
    "blood_group": ("identity", "blood_group", "neutral"), "Blood Group": ("identity", "blood_group", "neutral"),
    "marital_status": ("identity", "marital_status", "neutral"), "Marital Status": ("identity", "marital_status", "neutral"),
    "wedding_anniversary": ("identity", "anniversary", "neutral"), "anniversary": ("identity", "anniversary", "neutral"),
    "dating_anniversary": ("identity", "dating_anniversary", "neutral"),
    "personality_type": ("identity", "chronotype", "neutral"),
    "primary_city": ("identity", "primary_city", "neutral"), "Primary City": ("identity", "primary_city", "neutral"),
    "company_designation": ("identity", "company_and_designation", "neutral"),
    "company_and_designation": ("identity", "company_and_designation", "neutral"),
    "social_handles": ("identity", "social_handles", "neutral"), "Social": ("identity", "social_handles", "neutral"),
    "instagram": ("identity", "instagram", "neutral"), "linkedin": ("identity", "linkedin", "neutral"),
    "diabetic": ("identity", "diabetic", "neutral"), "Email": ("identity", "email", "neutral"),
    # dietary
    "dietary_preference": ("dietary", "veg_nonveg", "neutral"), "veg_non_veg": ("dietary", "veg_nonveg", "neutral"),
    "diet": ("dietary", "diet", "neutral"), "allergies": ("dietary", "allergies", "dislikes"),
    "favourite_drink": ("dietary", "drink", "likes"), "drink": ("dietary", "drink", "likes"), "Favourite Drink": ("dietary", "drink", "likes"),
    "drink_coffee": ("dietary", "coffee", "likes"), "coffee": ("dietary", "coffee", "likes"),
    "dessert": ("dietary", "dessert", "likes"), "favourite_food": ("dietary", "food", "likes"),
    "food": ("dietary", "food", "likes"), "Favourite Food": ("dietary", "food", "likes"),
    # preference
    "seat_preference": ("preference", "seat", "likes"), "flight_seat": ("preference", "seat", "likes"), "Seat Preference": ("preference", "seat", "likes"),
    "stay_preferences": ("preference", "stays", "likes"), "stays": ("preference", "stays", "likes"),
    "favourite_cuisine": ("preference", "cuisine", "likes"), "cuisine": ("preference", "cuisine", "likes"),
    "go_to_restaurant": ("preference", "restaurant", "likes"), "restaurant": ("preference", "restaurant", "likes"), "Go-To Restaurant": ("preference", "restaurant", "likes"),
    "favourite_brands": ("preference", "brand", "likes"), "favourite_brand": ("preference", "brand", "likes"), "Favourite Brands": ("preference", "brand", "likes"),
    "designer": ("preference", "designer", "likes"),
    "favourite_car": ("preference", "car", "likes"), "car": ("preference", "car", "likes"), "Favourite Car": ("preference", "car", "likes"),
    "car_you_travel_in": ("preference", "car_you_travel_in", "neutral"),
    "favourite_watch": ("preference", "watch", "likes"), "watch": ("preference", "watch", "likes"), "Favourite Watch": ("preference", "watch", "likes"),
    "flowers": ("preference", "flowers", "likes"), "book": ("preference", "book", "likes"),
    "artist": ("preference", "artist", "likes"), "actoractress": ("preference", "actor", "likes"),
    # interest
    "favourite_sports": ("interest", "sport", "likes"), "sport": ("interest", "sport", "likes"), "Favourite Sports": ("interest", "sport", "likes"),
    # travel
    "go_to_country": ("travel", "go_to_country", "likes"), "country": ("travel", "go_to_country", "likes"), "Go-ToCountry": ("travel", "go_to_country", "likes"),
    "travel_frequency": ("travel", "travel_frequency", "neutral"),
    "needs_assistance_with": ("travel", "needs_assistance_with", "neutral"), "need_assistance_with": ("travel", "needs_assistance_with", "neutral"),
    # family
    "pet_breedname": ("family", "pet", "neutral"),
}
SKIP = {"Name", "name", "Phone", "phone", "mobile", "periskope_chat_id", "category", "Kingdom"}


def facts_from_fields(fields: dict, member_id: str, source: str, confidence: float, observed_at: str | None, evidence: dict):
    out = []
    for name, raw in fields.items():
        if name in SKIP or name not in FIELD_MAP:
            continue
        facet, key, polarity = FIELD_MAP[name]
        for val in as_list(raw):
            out.append({
                "member_id": member_id, "facet": facet, "key": key, "value": val, "polarity": polarity,
                "source": source, "confidence": confidence, "evidence": {**evidence, "field": name},
                "observed_at": observed_at or datetime.now(timezone.utc).isoformat(),
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not BASE or not KEY:
        sys.exit("source .env.local first")

    members = get_all("members?select=id,primary_phone,alt_phones,freshdesk_contact_id,full_name")
    by_phone: dict[str, str] = {}
    by_fd: dict[str, str] = {}
    for c in members:
        for p in [c["primary_phone"]] + (c["alt_phones"] or []):
            if last10(p):
                by_phone.setdefault(last10(p), c["id"])
        if c["freshdesk_contact_id"]:
            by_fd[str(c["freshdesk_contact_id"])] = c["id"]
    print(f"members: {len(members)} ({len(by_phone)} phone keys, {len(by_fd)} Freshdesk ids)")

    facts: list[dict] = []

    # 1. Atlas: members.csv gives atlas id → phone; profile.csv hangs off the atlas id.
    atlas_members = load_csv(f"{DATA}/atlas-client-data.csv")
    atlas_to_member: dict[str, str] = {}
    for r in atlas_members:
        cid = by_phone.get(last10(r.get("phone_number")) or "")
        if cid:
            atlas_to_member[r["id"]] = cid
            if clean(r.get("notes")):
                facts.append({"member_id": cid, "facet": "note", "key": "", "value": clean(r["notes"]), "polarity": "neutral",
                              "source": "atlas", "confidence": 1.0, "evidence": {"atlas_member_id": r["id"], "field": "notes"},
                              "observed_at": r.get("updated_at") or datetime.now(timezone.utc).isoformat()})
    print(f"atlas members matched: {len(atlas_to_member)} of {len(atlas_members)}")
    for r in load_csv(f"{DATA}/altas-cleint-profile.csv"):
        cid = atlas_to_member.get(r.get("member_id", ""))
        if not cid:
            continue
        observed = r.get("updated_at") or None
        fields = {k: r.get(k) for k in ("date_of_birth", "blood_group", "marital_status", "wedding_anniversary",
                                        "personality_type", "primary_city", "company_designation", "social_handles")}
        for bag in ("travel", "lifestyle", "passions"):
            try:
                fields.update(json.loads(r.get(bag) or "{}"))
            except json.JSONDecodeError:
                pass
        facts.extend(facts_from_fields(fields, cid, "atlas", 0.9, observed, {"atlas_profile_id": r.get("id")}))

    # 2. Typeform answers (profile_sources), raw answers as evidence.
    n_tf = 0
    for r in load_csv(f"{DATA}/atlas-cleint-sources.csv"):
        cid = atlas_to_member.get(r.get("member_id", ""))
        if not cid or r.get("source_type") != "typeform":
            continue
        try:
            raw = json.loads(r.get("raw_data") or "{}")
        except json.JSONDecodeError:
            continue
        new = facts_from_fields(raw, cid, "typeform", 0.9, r.get("ingested_at") or None,
                                {"source_ref": r.get("source_ref"), "profile_source_id": r.get("id")})
        n_tf += len(new)
        facts.extend(new)
    print(f"typeform facts: {n_tf}")

    # 3. Freshdesk contacts with preference fields (the mirror).
    n_fd = 0
    contacts = get_all("contacts?select=id,member_id,custom_fields,fd_updated_at&member_id=not.is.null", schema="freshdesk")
    for c in contacts:
        cf = c.get("custom_fields") or {}
        new = facts_from_fields(cf, c["member_id"], "freshdesk_contact", 0.9, c.get("fd_updated_at"),
                                {"freshdesk_contact_id": c["id"]})
        n_fd += len(new)
        facts.extend(new)
    print(f"freshdesk contact facts: {n_fd} from {len(contacts)} linked contacts")

    # 4. The sheets: city and company.
    n_sheet = 0
    for fname, phone_col, city_col, company_col in (("export-1.csv", "Phone Number", "Location", "Company (from Zoho)"),
                                                     ("export-2.csv", "Phone", "City", None)):
        for r in load_csv(fname):
            cid = by_phone.get(last10(clean(r.get(phone_col))) or "")
            if not cid:
                continue
            for col_name, key in ((city_col, "primary_city"), (company_col, "company")):
                if col_name and clean(r.get(col_name)):
                    facts.append({"member_id": cid, "facet": "identity", "key": key, "value": clean(r[col_name]), "polarity": "neutral",
                                  "source": "import", "confidence": 0.9, "evidence": {"sheet": fname, "field": col_name},
                                  "observed_at": datetime.now(timezone.utc).isoformat()})
                    n_sheet += 1
    print(f"sheet facts (city/company): {n_sheet}")

    # De-duplicate within this run and against what already exists.
    seen = set()
    deduped = []
    for f in facts:
        k = (f["member_id"], f["facet"], f["key"], f["value"].lower(), f["source"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(f)
    existing = set()
    try:
        for row in get_all("member_facts?select=member_id,facet,key,value,source"):
            existing.add((row["member_id"], row["facet"], row["key"], (row["value"] or "").lower(), row["source"]))
    except Exception as e:  # before migration 0194 the table does not exist
        print(f"  ! member_facts not readable yet ({str(e)[:60]}); nothing is 'already present'")
    todo = [f for f in deduped if (f["member_id"], f["facet"], f["key"], f["value"].lower(), f["source"]) not in existing]

    from collections import Counter
    print(f"facts to write: {len(todo)} (of {len(deduped)} unique; {len(deduped) - len(todo)} already present)")
    print("  by facet :", dict(Counter(f["facet"] for f in todo)))
    print("  by source:", dict(Counter(f["source"] for f in todo)))
    print("  members touched:", len({f["member_id"] for f in todo}))
    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return
    for i in range(0, len(todo), 500):
        rest("POST", "member_facts", todo[i:i + 500], prefer="return=minimal")
    print(f"✓ wrote {len(todo)} facts")


if __name__ == "__main__":
    main()
