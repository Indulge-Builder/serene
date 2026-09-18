#!/usr/bin/env python3
"""Member identity-spine import + WhatsApp-group mapping (migration 0181, 2026-09-04).

Reads the two member exports plus the tiered mapping-review CSV (all git-ignored
PII, kept local) and:

  1. builds ONE member record per human — phones parsed STRICTLY (unparseable
     stays NULL; every source row survives untouched in import_raw),
  2. upserts them into public.members (idempotent on primary_phone),
  3. writes the AUTO-tier group mappings: sia.wag_groups.member_id +
     group_kind='member', the matched sia.wag_contacts row gets member_id +
     participant_role='member', and the member flips identity_status='verified',
  4. syncs staff: sia.wag_contacts.staff_profile_id by phone against profiles
     (plan-whatsapp §8 — role LABELS are left alone, the link is the signal).

DRY-RUN by default — prints what it would do. Pass --apply to write.
SUGGEST/AMBIGUOUS tiers are never written; they stay for the manual pass.

Usage:
  set -a && source .env.local && set +a
  python3 scripts/import-members-and-map-groups.py            # dry run
  python3 scripts/import-members-and-map-groups.py --apply
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request

BASE = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# The files keep the names the founder exported them under ("Client"), whatever the code calls the entity.
SUB_CSV = "Subscription Manager Client Export.csv"
APP_CSV = "app-client-export.csv"
# The 2026-09-15 sheets (the founder's member list of record; member-ticket-plan.md 5.6/5.9):
# export-1.csv = the subscription sheet (queendom, tier, dates, amount, status);
# export-2.csv = the app member list (Zoho / Freshdesk / WhatsApp ids, app member id, tier, city).
SHEET_SUB_CSV = "export-1.csv"
SHEET_APP_CSV = "export-2.csv"
REVIEW_CSV = "mapping-review.csv"


def rest(method: str, path: str, body=None, schema: str | None = None, prefer: str | None = None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if schema:
        headers["Accept-Profile" if method == "GET" else "Content-Profile"] = schema
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{BASE}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None, headers=headers,
    )
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def get_all(path: str, schema: str | None = None, page: int = 1000):
    rows, start = [], 0
    while True:
        headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
                   "Range-Unit": "items", "Range": f"{start}-{start + page - 1}"}
        if schema:
            headers["Accept-Profile"] = schema
        req = urllib.request.Request(f"{BASE}/rest/v1/{path}", headers=headers)
        chunk = json.load(urllib.request.urlopen(req))
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        start += page


DIGITS = re.compile(r"\D")

# Bare international numbers in the subscription export (HNI base — UAE, US, HK,
# UK, France, Nepal…). A number longer than 10 digits starting with one of these
# becomes +<digits>; anything that still doesn't fit stays NULL (raw preserved).
KNOWN_CCS = ("971", "977", "852", "44", "33", "65", "61", "49", "81", "86", "60",
             "66", "94", "41", "39", "34", "31", "7", "1")


def parse_phone(raw: str) -> tuple[str | None, list[str]]:
    """Strict phone parse → (primary E.164, alt list). Unparseable → (None, [])."""
    if not raw:
        return None, []
    raw = raw.split("#")[0]  # app export marks deleted accounts '+91…#deleted#<ts>'
    if raw.strip().startswith("+"):  # already E.164 with country code
        d = DIGITS.sub("", raw)
        if not 8 <= len(d) <= 15:
            return None, []
        # Plausibility veto for +91 specifically (rules we know): 10 digits after
        # the cc, starting 6-9. The app export glues a spurious +91 onto some
        # foreign numbers — those are malformed, and the merge below recovers the
        # true number from the other export when it exists.
        if d.startswith("91") and (len(d) != 12 or d[2] not in "6789"):
            return None, []
        return "+" + d, []
    d = DIGITS.sub("", raw)
    if len(d) == 20:  # two bare 10-digit numbers concatenated
        return "+91" + d[:10], ["+91" + d[10:]]
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) == 13 and d.startswith("091"):
        d = d[3:]
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    if len(d) == 10:
        # Indian mobiles start 6-9. A bare 10-digit number outside that range is
        # a foreign number stored without its country code — stamping +91 on it
        # would be a lie; it stays NULL (raw preserved) unless the app export's
        # explicit +cc variant merges in below.
        return ("+91" + d, []) if d[0] in "6789" else (None, [])
    if 11 <= len(d) <= 15 and d.startswith(KNOWN_CCS):
        return "+" + d, []
    return None, []


def parse_amount(raw: str):
    raw = (raw or "").strip()
    if not raw or raw == "-":
        return None
    d = DIGITS.sub("", raw)
    return int(d) if d else None


def parse_date(raw: str):
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", (raw or "").strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def col(row: dict, *names: str) -> str:
    """First non-empty value among alias column names (the sheets rename columns freely)."""
    for n in names:
        v = row.get(n)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def parse_any_date(raw: str):
    """dd/mm/yyyy (the sheets) or yyyy-mm-dd (the app list) → ISO date, else None."""
    raw = (raw or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    return m.group(0) if m else None


def tier_slug(label: str):
    key = (label or "").strip().lower().replace(" ", "_")
    return key if key in {"premium", "celebrity", "genie", "standard", "monthly_trial"} else None


def queendom_slug(label: str):
    """'Sanika Queendom' / 'Sanika' → sanika; unknown → None (never guess a queendom)."""
    key = (label or "").strip().lower().split()[0] if (label or "").strip() else ""
    return key if key in {"anishqa", "ananyshree", "sanika"} else None


def parse_ext_id(raw: str):
    """Freshdesk/Zoho ids are long digit strings. The sub export sometimes holds
    the literal 'Yes' in the FD column (used as a boolean) — anything non-numeric
    is NOT an id and must never be stored as one (it would poison future joins)."""
    raw = (raw or "").strip()
    return raw if raw.isdigit() and len(raw) >= 5 else None


def load_csv(path: str):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def build_member_records():
    """Merge both exports into one record per phone (phone-less rows keyed by name+fd)."""
    records: dict[str, dict] = {}

    def key_for(phone: str | None, name: str, fd: str) -> str:
        return phone or f"nophone:{name}|{fd}"

    for row in load_csv(SUB_CSV):
        phone, alts = parse_phone(row.get("Phone Number", ""))
        name = (row.get("Member Name") or "").strip()
        fd = parse_ext_id(row.get("Freshdesk Contact ID", "")) or ""
        k = key_for(phone, name, fd)
        rec = records.get(k)
        if rec is None:
            rec = records[k] = {
                "full_name": name, "primary_phone": phone, "alt_phones": list(alts),
                "freshdesk_contact_id": fd or None, "zoho_customer_id": None,
                "wa_invite_link": None, "membership_type": None, "membership_status": None,
                "membership_amount_inr": None, "membership_start": None, "membership_end": None,
                "queendom_slug": None, "tier": None, "app_member_id": None, "city": None, "company": None,
                "sources": [], "import_raw": {},
            }
        rec["import_raw"].setdefault("subscription_export", []).append(row)
        if "subscription_export" not in rec["sources"]:
            rec["sources"].append("subscription_export")
        status = (row.get("Status") or "").strip()
        # Membership summary: an Active row always beats an Expired one; first otherwise.
        if rec["membership_status"] != "Active" or status == "Active":
            rec.update({
                "membership_type": (row.get("Membership Type") or "").strip() or None,
                "membership_status": status or None,
                "membership_amount_inr": parse_amount(row.get("Amount (INR)", "")),
                "membership_start": parse_date(row.get("Start Date", "")),
                "membership_end": parse_date(row.get("End Date", "")),
            })

    for row in load_csv(APP_CSV):
        phone, _ = parse_phone(row.get("Phone", ""))
        name = (row.get("Name") or "").strip()
        fd = parse_ext_id(row.get("Freshdesk Contact ID", "")) or ""
        k = key_for(phone, name, fd)
        rec = records.get(k)
        if rec is None:
            rec = records[k] = {
                "full_name": name, "primary_phone": phone, "alt_phones": [],
                "freshdesk_contact_id": None, "zoho_customer_id": None,
                "wa_invite_link": None, "membership_type": None, "membership_status": None,
                "membership_amount_inr": None, "membership_start": None, "membership_end": None,
                "queendom_slug": None, "tier": None, "app_member_id": None, "city": None, "company": None,
                "sources": [], "import_raw": {},
            }
        rec["import_raw"].setdefault("app_export", []).append(row)
        if "app_export" not in rec["sources"]:
            rec["sources"].append("app_export")
        if not rec["freshdesk_contact_id"]:
            rec["freshdesk_contact_id"] = fd or None
        if not rec["zoho_customer_id"]:
            rec["zoho_customer_id"] = parse_ext_id(row.get("Zoho Customer ID", ""))
        if not rec["wa_invite_link"]:
            rec["wa_invite_link"] = (row.get("WhatsApp Group Link") or "").strip() or None

    # The 2026-09-15 sheets — THE member list of record. Same key rule, same strictness.
    if os.path.exists(SHEET_SUB_CSV):
        for row in load_csv(SHEET_SUB_CSV):
            phone, alts = parse_phone(col(row, "Phone Number", "Phone"))
            name = col(row, "Member Name", "Name")
            k = key_for(phone, name, "")
            rec = records.get(k)
            if rec is None:
                rec = records[k] = {
                    "full_name": name, "primary_phone": phone, "alt_phones": list(alts),
                    "freshdesk_contact_id": None, "zoho_customer_id": None,
                    "wa_invite_link": None, "membership_type": None, "membership_status": None,
                    "membership_amount_inr": None, "membership_start": None, "membership_end": None,
                    "queendom_slug": None, "tier": None, "app_member_id": None, "city": None, "company": None,
                    "sources": [], "import_raw": {},
                }
            rec["import_raw"].setdefault("sheet_subscription", []).append(row)
            if "sheet_subscription" not in rec["sources"]:
                rec["sources"].append("sheet_subscription")
            status = col(row, "Status")
            if rec["membership_status"] != "Active" or status == "Active":
                rec.update({
                    "membership_type": col(row, "Membership Type") or rec["membership_type"],
                    "membership_status": status or rec["membership_status"],
                    "membership_amount_inr": parse_amount(col(row, "Amount (INR)")) or rec["membership_amount_inr"],
                    "membership_start": parse_any_date(col(row, "Start Date")) or rec["membership_start"],
                    "membership_end": parse_any_date(col(row, "End Date")) or rec["membership_end"],
                })
                rec["tier"] = tier_slug(col(row, "Membership Type")) or rec["tier"]
                rec["queendom_slug"] = queendom_slug(col(row, "Group", "Queendom")) or rec["queendom_slug"]
            rec["city"] = rec["city"] or col(row, "Location", "City") or None
            rec["company"] = rec["company"] or col(row, "Company (from Zoho)", "Company") or None

    if os.path.exists(SHEET_APP_CSV):
        for row in load_csv(SHEET_APP_CSV):
            phone, _ = parse_phone(col(row, "Phone", "Phone Number").strip('="'))
            name = col(row, "Name", "Member Name")
            fd = parse_ext_id(col(row, "Freshdesk contact id", "Freshdesk Contact ID").strip('="')) or ""
            k = key_for(phone, name, fd)
            rec = records.get(k)
            if rec is None:
                rec = records[k] = {
                    "full_name": name, "primary_phone": phone, "alt_phones": [],
                    "freshdesk_contact_id": None, "zoho_customer_id": None,
                    "wa_invite_link": None, "membership_type": None, "membership_status": None,
                    "membership_amount_inr": None, "membership_start": None, "membership_end": None,
                    "queendom_slug": None, "tier": None, "app_member_id": None, "city": None, "company": None,
                    "sources": [], "import_raw": {},
                }
            rec["import_raw"].setdefault("sheet_app", []).append(row)
            if "sheet_app" not in rec["sources"]:
                rec["sources"].append("sheet_app")
            rec["freshdesk_contact_id"] = rec["freshdesk_contact_id"] or (fd or None)
            rec["zoho_customer_id"] = rec["zoho_customer_id"] or parse_ext_id(col(row, "Zoho customer id", "Zoho Customer ID").strip('="'))
            rec["wa_invite_link"] = rec["wa_invite_link"] or (col(row, "WhatsApp group link", "WhatsApp Group Link") or None)
            rec["app_member_id"] = rec["app_member_id"] or (col(row, "Member id") or None)
            rec["tier"] = rec["tier"] or tier_slug(col(row, "Plan") if col(row, "Plan") in ("Premium", "Celebrity", "Genie", "Standard") else "")
            rec["membership_end"] = rec["membership_end"] or parse_any_date(col(row, "Expires (IST)"))
            rec["membership_start"] = rec["membership_start"] or parse_any_date(col(row, "Current term started (IST)", "Joined (IST)"))
            rec["city"] = rec["city"] or col(row, "City") or None

    # Merge same-person country-code variants: two records that agree on the last
    # ten digits AND share a name token are one human whose number was written
    # with and without its country code. The '+'-explicit (app export) number is
    # authoritative; the other becomes an alt. Distinct-name collisions (truly
    # different people behind a shared suffix) stay separate rows.
    STOP = {"concierge", "private", "indulge", "group", "the", "and", "mr", "mrs", "dr"}

    def name_tokens(s: str) -> set[str]:
        return {t for t in re.sub(r"[^A-Za-z ]+", " ", s or "").lower().split()
                if len(t) >= 3 and t not in STOP}

    by_last10: dict[str, list[dict]] = {}
    for rec in records.values():
        if rec["primary_phone"]:
            by_last10.setdefault(rec["primary_phone"][-10:], []).append(rec)
    merged_away: set[int] = set()
    for recs_same in by_last10.values():
        if len(recs_same) < 2:
            continue
        keeper = next((r for r in recs_same if "app_export" in r["sources"]), recs_same[0])
        for other in recs_same:
            if other is keeper or not (name_tokens(keeper["full_name"]) & name_tokens(other["full_name"])):
                continue
            keeper["alt_phones"] = sorted(set(keeper["alt_phones"] + [other["primary_phone"]] + other["alt_phones"]))
            for src, rows_ in other["import_raw"].items():
                keeper["import_raw"].setdefault(src, []).extend(rows_)
            for s in other["sources"]:
                if s not in keeper["sources"]:
                    keeper["sources"].append(s)
            for field in ("freshdesk_contact_id", "zoho_customer_id", "wa_invite_link",
                          "membership_type", "membership_status", "membership_amount_inr",
                          "membership_start", "membership_end", "queendom_slug", "tier",
                          "app_member_id", "city", "company"):
                if not keeper[field]:
                    keeper[field] = other[field]
            merged_away.add(id(other))

    kept = [r for r in records.values() if id(r) not in merged_away]

    # One human, two rows, one Freshdesk id: phoned records sharing a VALID fd id
    # and an equal name-token set are the same person with a second number.
    by_fd: dict[str, list[dict]] = {}
    for rec in kept:
        if rec["primary_phone"] and rec["freshdesk_contact_id"]:
            by_fd.setdefault(rec["freshdesk_contact_id"], []).append(rec)
    fd_merged: set[int] = set()
    for recs_same in by_fd.values():
        if len(recs_same) < 2:
            continue
        keeper = recs_same[0]
        for other in recs_same[1:]:
            if name_tokens(keeper["full_name"]) != name_tokens(other["full_name"]):
                continue
            keeper["alt_phones"] = sorted(set(keeper["alt_phones"] + [other["primary_phone"]] + other["alt_phones"]))
            for src, rows_ in other["import_raw"].items():
                keeper["import_raw"].setdefault(src, []).extend(rows_)
            for s2 in other["sources"]:
                if s2 not in keeper["sources"]:
                    keeper["sources"].append(s2)
            for field in ("zoho_customer_id", "wa_invite_link", "membership_type",
                          "membership_status", "membership_amount_inr",
                          "membership_start", "membership_end", "queendom_slug", "tier",
                          "app_member_id", "city", "company"):
                if not keeper[field]:
                    keeper[field] = other[field]
            fd_merged.add(id(other))
    kept = [r for r in kept if id(r) not in fd_merged]

    # Fold phone-less shells (e.g. the app row whose +91-typo phone was vetoed)
    # into their phoned twin — by Freshdesk id, else by EXACT name-token-set
    # match, and only when exactly one candidate exists. Anything ambiguous
    # stays its own unverified row rather than guessing.
    phoned = [r for r in kept if r["primary_phone"]]
    folded: set[int] = set()
    for shell in kept:
        if shell["primary_phone"]:
            continue
        fd = shell["freshdesk_contact_id"]
        cands = [r for r in phoned if fd and r["freshdesk_contact_id"] == fd]
        if not cands:
            st = name_tokens(shell["full_name"])
            cands = [r for r in phoned if st and name_tokens(r["full_name"]) == st]
        if len(cands) != 1:
            continue
        keeper = cands[0]
        for src, rows_ in shell["import_raw"].items():
            keeper["import_raw"].setdefault(src, []).extend(rows_)
        for s in shell["sources"]:
            if s not in keeper["sources"]:
                keeper["sources"].append(s)
        for field in ("freshdesk_contact_id", "zoho_customer_id", "wa_invite_link",
                      "membership_type", "membership_status", "membership_amount_inr",
                      "membership_start", "membership_end", "queendom_slug", "tier",
                      "app_member_id", "city", "company"):
            if not keeper[field]:
                keeper[field] = shell[field]
        folded.add(id(shell))

    return [r for r in kept if id(r) not in folded]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write to the database (default: dry run)")
    ap.add_argument("--review", default=REVIEW_CSV,
                    help="review CSV to apply (default: mapping-review.csv; a by-name batch carries member_id + member_jid)")
    ap.add_argument("--skip-import", action="store_true", help="skip the member upsert phase (mapping only)")
    args = ap.parse_args()
    if not BASE or not KEY:
        print("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — source .env.local")
        return 1

    records = build_member_records()
    # queendom_slug → sia.queendoms.id (0194). Unknown slugs stay NULL (admin/founder-only rows).
    try:
        qd = {q["slug"]: q["id"] for q in (rest("GET", "queendoms?select=id,slug", schema="sia") or [])}
    except Exception as e:  # before migration 0194 is applied the table does not exist yet
        print(f"  ! sia.queendoms not readable ({str(e)[:80]}); queendom_id stays NULL this run")
        qd = {}
    for r in records:
        r["queendom_id"] = qd.get(r.pop("queendom_slug") or "", None)
        # city / company are FACTS (member-ticket-plan 5.2), seeded by scripts/members/seed-member-facts.py
        # from the same sheets; they ride along in import_raw only.
        r.pop("city", None)
        r.pop("company", None)
    with_phone = [r for r in records if r["primary_phone"]]
    print(f"queendoms: " + ", ".join(f"{k}={sum(1 for r in records if r['queendom_id'] == v)}" for k, v in qd.items())
          + f", unassigned={sum(1 for r in records if not r['queendom_id'])}")
    print(f"member records: {len(records)} ({len(with_phone)} with a parsed phone, "
          f"{len(records) - len(with_phone)} phone-less)")

    auto = [r for r in load_csv(args.review) if r["tier"] == "AUTO"]
    print(f"AUTO mappings to write: {len(auto)}")

    profiles = get_all("profiles?select=id,phone&is_active=eq.true&phone=not.is.null")
    staff_by_last10 = {DIGITS.sub("", p["phone"])[-10:]: p["id"] for p in profiles}
    contacts = get_all("wag_contacts?select=jid,lid,phone,staff_profile_id,member_id", schema="sia")
    by_last10: dict[str, list[dict]] = {}
    for c in contacts:
        if c["phone"]:
            by_last10.setdefault(DIGITS.sub("", c["phone"])[-10:], []).append(c)

    staff_links = [(c, staff_by_last10[l10]) for l10, cs in by_last10.items()
                   if l10 in staff_by_last10 for c in cs if not c["staff_profile_id"]]
    print(f"staff contacts to link: {len(staff_links)}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0

    # 1. Upsert members (idempotent on primary_phone; phone-less: match by name+fd first).
    for r in ([] if args.skip_import else with_phone):
        rest("POST", "members?on_conflict=primary_phone", [r],
             schema="member", prefer="resolution=merge-duplicates,return=minimal")
    for r in ([] if args.skip_import else records):
        if r["primary_phone"]:
            continue
        fd = r["freshdesk_contact_id"]
        q = f"members?full_name=eq.{urllib.parse.quote(r['full_name'])}" + (
            f"&freshdesk_contact_id=eq.{urllib.parse.quote(fd)}" if fd else "&primary_phone=is.null")
        if not rest("GET", q + "&select=id"):
            rest("POST", "members", [r], schema="member", prefer="return=minimal")
    print("- member import skipped (--skip-import)" if args.skip_import else f"✓ members upserted ({len(records)})")

    # 2. AUTO mappings. Already-mapped groups are skipped up front so re-runs
    # only touch what is missing.
    already = {g["group_jid"] for g in get_all(
        "wag_groups?select=group_jid&member_id=not.is.null", schema="sia")}

    def tokset(s: str) -> frozenset:
        return frozenset(t for t in re.sub(r"[^A-Za-z ]+", " ", s or "").lower().split()
                         if len(t) >= 3 and t not in {"concierge", "private", "indulge",
                                                      "group", "the", "and", "mr", "mrs", "dr"})

    mapped = skipped = 0
    for row in auto:
        if row["group_jid"] in already:
            mapped += 1
            continue
        # A by-name batch row (subject + member display-name + unique member, human-approved)
        # carries the member id and the echoing member directly — no phone lookup.
        if row.get("member_id"):
            cid = row["member_id"]
            rest("PATCH", f"wag_groups?group_jid=eq.{urllib.parse.quote(row['group_jid'])}",
                 {"member_id": cid, "group_kind": "member"}, schema="sia", prefer="return=minimal")
            if row.get("member_jid"):
                target = f"lid=eq.{urllib.parse.quote(row['member_jid'])}" if row["member_jid"].endswith("@lid") \
                    else f"jid=eq.{urllib.parse.quote(row['member_jid'])}"
                rest("PATCH", f"wag_contacts?{target}",
                     {"member_id": cid, "participant_role": "member"}, schema="sia", prefer="return=minimal")
            rest("PATCH", f"members?id=eq.{cid}", {"identity_status": "verified"}, schema="member", prefer="return=minimal")
            mapped += 1
            continue
        phone10 = row["member_phone"][-10:]
        cl = rest("GET", f"members?primary_phone=like.*{phone10}&select=id", schema="member")
        if len(cl) != 1:
            # Recovery for export-mangled numbers: the group member's phone comes
            # from the WhatsApp JID itself (the highest-trust source). Adopt it
            # onto the phone-less member whose name-token set EXACTLY matches the
            # review row — deterministic, or nothing.
            wa_phone = next((c["phone"] for c in by_last10.get(phone10, []) if c["phone"]), None)
            noph = rest("GET", "members?primary_phone=is.null&select=id,full_name", schema="member")
            cands = [c for c in noph if tokset(c["full_name"]) == tokset(row["member_name"])]
            if wa_phone and len(cands) == 1:
                e164 = "+" + DIGITS.sub("", wa_phone)
                rest("PATCH", f"members?id=eq.{cands[0]['id']}", {"primary_phone": e164},
                     schema="member", prefer="return=minimal")
                print(f"  ~ recovered {row['member_name']!r}: adopted WhatsApp-verified {e164[:6]}…")
                cl = [{"id": cands[0]["id"]}]
            else:
                print(f"  ! skip {row['group_jid']}: member lookup returned {len(cl)} rows")
                skipped += 1
                continue
        cid = cl[0]["id"]
        rest("PATCH", f"wag_groups?group_jid=eq.{urllib.parse.quote(row['group_jid'])}",
             {"member_id": cid, "group_kind": "member"}, schema="sia", prefer="return=minimal")
        for c in by_last10.get(phone10, []):
            rest("PATCH", f"wag_contacts?jid=eq.{urllib.parse.quote(c['jid'])}",
                 {"member_id": cid, "participant_role": "member"}, schema="sia",
                 prefer="return=minimal")
        rest("PATCH", f"members?id=eq.{cid}", {"identity_status": "verified"},
             schema="member", prefer="return=minimal")
        mapped += 1
    print(f"✓ groups mapped: {mapped} (skipped {skipped})")

    # 3. Staff sync (link only — participant_role labels are a human vocabulary call).
    for c, pid in staff_links:
        rest("PATCH", f"wag_contacts?jid=eq.{urllib.parse.quote(c['jid'])}",
             {"staff_profile_id": pid}, schema="sia", prefer="return=minimal")
    print(f"✓ staff contacts linked: {len(staff_links)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
