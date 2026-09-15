#!/usr/bin/env python3
"""
scripts/freshdesk/load-export.py — load a Freshdesk ACCOUNT EXPORT (the XML archive from
Admin → Account → Export data) into the `freshdesk` mirror schema (migration 0193).

Why: the API allows 50 calls a minute, so pulling 50k tickets and 209k notes through it takes
a day. The export carries the same data (tickets with their `ticket-states` timings, every note
with attachment names, contacts, agents, groups) in 176 XML files, and loads in minutes. After
this, the minute poll (src/trigger/freshdesk-sync.ts) continues from the export's last
`updated-at` — the script writes that watermark into freshdesk.sync_state.

What it writes (idempotent upserts on Freshdesk's own ids, the same shape the API sync writes):
  groups, agents, contacts, tickets (id = display-id, the number the API and the UI use),
  conversations (the notes), and the two sync_state rows (backfill done, poll watermark).
It writes NO ticket_changes: the export has no history, only current state.

Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the env).
Same REST posture as scripts/import-clients-and-map-groups.py (urllib, Content-Profile).

Usage:
  python3 scripts/freshdesk/load-export.py --dir cleint-data/tickets-freshdesk-export           # dry run: parse + counts
  python3 scripts/freshdesk/load-export.py --dir … --apply [--files 3] [--only tickets|contacts|agents|groups]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ACCOUNT_SUFFIX = re.compile(r"_\d{7}$")  # cf_category_of_request_2986625 → cf_category_of_request
STATUS_LABELS = {2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed", 6: "Nudge Client", 7: "Nudge Vendor",
                 8: "Ongoing Delivery", 9: "Invoice Due", 9000: "Assigned to AI Agent"}


def load_env() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (url and key) and os.path.exists(".env.local"):
        for line in open(".env.local"):
            line = line.strip()
            if line.startswith("NEXT_PUBLIC_SUPABASE_URL=") and not url:
                url = line.split("=", 1)[1].strip().strip('"')
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY=") and not key:
                key = line.split("=", 1)[1].strip().strip('"')
    if not (url and key):
        sys.exit("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")
    return url.rstrip("/"), key


BASE, KEY = "", ""


def rest(method: str, path: str, body=None, schema: str | None = "freshdesk", prefer: str | None = None):
    headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if schema:
        headers["Accept-Profile" if method == "GET" else "Content-Profile"] = schema
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}/rest/v1/{path}", data=data, headers=headers, method=method)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if e.code in (502, 503, 504, 429) and attempt < 3:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {path} → {e.code}: {msg}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
                continue
            raise


def upsert(table: str, rows: list[dict], batch: int = 300) -> int:
    n = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        rest("POST", f"{table}?on_conflict=id", chunk, prefer="resolution=merge-duplicates,return=minimal")
        n += len(chunk)
    return n


# ─── helpers ────────────────────────────────────────────────────────────────

def text(e: ET.Element | None, tag: str) -> str | None:
    if e is None:
        return None
    c = e.find(tag)
    if c is None or c.get("nil") == "true":
        return None
    t = (c.text or "").strip()
    return t or None


def integer(e, tag) -> int | None:
    t = text(e, tag)
    try:
        return int(t) if t is not None else None
    except ValueError:
        return None


def boolean(e, tag) -> bool:
    return (text(e, tag) or "").lower() == "true"


def ts(e, tag) -> str | None:
    t = text(e, tag)
    if not t:
        return None
    try:
        return datetime.fromisoformat(t).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


E164 = re.compile(r"^\+?\d{8,15}$")


def e164(phone: str | None) -> str | None:
    """A light normaliser (the TS sync uses libphonenumber): strip, add +91 to bare 10-digit."""
    if not phone:
        return None
    p = re.sub(r"[^\d+]", "", phone)
    if p.startswith("00"):
        p = "+" + p[2:]
    if not p.startswith("+"):
        if len(p) == 10 and p[0] in "6789":
            p = "+91" + p
        elif len(p) == 12 and p.startswith("91"):
            p = "+" + p
        else:
            p = "+" + p
    return p if E164.match(p) else None


def custom_fields(e: ET.Element, strip_cf: bool = False) -> dict:
    out = {}
    cf = e.find("custom_field")
    if cf is None:
        return out
    for c in cf:
        name = ACCOUNT_SUFFIX.sub("", c.tag)
        if strip_cf and name.startswith("cf_"):
            name = name[3:]
        val = (c.text or "").strip()
        if val == "":
            continue
        if val.lower() in ("true", "false"):
            out[name] = val.lower() == "true"
        else:
            out[name] = val
    return out


# ─── client linking (the spine join) ────────────────────────────────────────

def load_client_index() -> tuple[dict[str, str], dict[str, str]]:
    by_contact, by_phone = {}, {}
    rows = rest("GET", "clients?select=id,primary_phone,alt_phones,freshdesk_contact_id&limit=5000", schema="public") or []
    for r in rows:
        if r.get("freshdesk_contact_id"):
            by_contact[str(r["freshdesk_contact_id"]).strip()] = r["id"]
        if r.get("primary_phone"):
            by_phone[r["primary_phone"]] = r["id"]
        for p in r.get("alt_phones") or []:
            by_phone.setdefault(p, r["id"])
    return by_contact, by_phone


# ─── parsers ────────────────────────────────────────────────────────────────

def parse_groups(path: str) -> list[dict]:
    out = []
    for g in ET.parse(path).getroot():
        out.append({
            "id": integer(g, "id"), "name": text(g, "name") or "", "description": text(g, "description"),
            "business_hour_id": integer(g, "business-calendar-id"), "group_type": None,
            "raw": {c.tag: (c.text or "").strip() for c in g if len(c) == 0},
            "fd_created_at": ts(g, "created-at"), "fd_updated_at": ts(g, "updated-at"),
        })
    return [r for r in out if r["id"]]


def parse_agents(path: str) -> list[dict]:
    out = []
    for u in ET.parse(path).getroot():
        name = (text(u, "name") or "").replace("(Deactivated)", "").strip()
        out.append({
            "id": integer(u, "id"), "name": name or f"Agent {integer(u, 'id')}", "email": text(u, "email"),
            "job_title": text(u, "job-title"), "agent_type": "support_agent",
            "active": boolean(u, "active"), "deactivated": boolean(u, "deleted") or "(Deactivated)" in (text(u, "name") or ""),
            "available": False, "last_active_at": None, "profile_id": None,
            "raw": {c.tag: (c.text or "").strip() for c in u if len(c) == 0},
            "fd_created_at": ts(u, "created-at"), "fd_updated_at": ts(u, "updated-at"),
        })
    return [r for r in out if r["id"]]


def parse_contacts(path: str, by_contact, by_phone) -> list[dict]:
    out = []
    for u in ET.parse(path).getroot():
        if boolean(u, "helpdesk-agent"):
            continue
        cid = integer(u, "id")
        if not cid:
            continue
        phone = e164(text(u, "mobile") or text(u, "phone"))
        cf = custom_fields(u, strip_cf=True)
        out.append({
            "id": cid, "name": text(u, "name") or "", "email": text(u, "email"),
            "phone": text(u, "phone"), "mobile": text(u, "mobile"), "phone_e164": phone,
            "active": boolean(u, "active"), "company_id": integer(u, "company-id"),
            "category": cf.get("category") if isinstance(cf.get("category"), str) else None,
            "custom_fields": cf, "tags": [], "description": text(u, "description"),
            "client_id": by_contact.get(str(cid)) or (by_phone.get(phone) if phone else None),
            "raw": {c.tag: (c.text or "").strip() for c in u if len(c) == 0},
            "fd_created_at": ts(u, "created-at"), "fd_updated_at": ts(u, "updated-at"),
        })
    return out


def parse_tickets(path: str, by_contact, by_phone, requester_phones: dict[int, str]) -> tuple[list[dict], list[dict]]:
    tickets, notes = [], []
    for t in ET.parse(path).getroot():
        display_id = integer(t, "display-id")
        if not display_id:
            continue
        cf = custom_fields(t)
        states = t.find("ticket-states")
        status = integer(t, "status") or 2
        requester_id = integer(t, "requester-id") or 0
        phone = requester_phones.get(requester_id)
        client_id = by_contact.get(str(requester_id)) or (by_phone.get(phone) if phone else None)
        tags = []
        tg = t.find("tags")
        if tg is not None:
            for x in tg.iter():
                if x is not tg and (x.text or "").strip() and x.tag in ("name", "tag"):
                    tags.append((x.text or "").strip())
        note_rows = []
        ns = t.find("notes")
        if ns is not None:
            for n in ns:
                nid = integer(n, "id")
                if not nid:
                    continue
                atts = []
                ae = n.find("attachments")
                if ae is not None:
                    for a in ae:
                        atts.append({
                            "id": integer(a, "id"), "name": text(a, "content-file-name"),
                            "content_type": text(a, "content-content-type"), "size": integer(a, "content-file-size"),
                            "attachment_url": text(a, "attachment_url"), "created_at": ts(a, "created-at"),
                        })
                note_rows.append({
                    "id": nid, "ticket_id": display_id, "user_id": integer(n, "user-id"),
                    "incoming": boolean(n, "incoming"), "private": boolean(n, "private"),
                    "source": integer(n, "source"), "category": None,
                    "body_text": text(n, "body"), "body_html": text(n, "body-html"),
                    "from_email": text(n, "support-email"), "to_emails": [], "attachments": atts,
                    "raw": {"export": True, "deleted": boolean(n, "deleted")},
                    "fd_created_at": ts(n, "created-at") or ts(t, "created-at"), "fd_updated_at": ts(n, "updated-at"),
                })
        raw = {c.tag: (c.text or "").strip() for c in t if len(c) == 0 and c.tag not in ("description-html",)}
        raw["export"] = True
        tickets.append({
            "id": display_id,
            "subject": text(t, "subject") or "",
            "description_text": text(t, "description"),
            "status": status, "status_label": text(t, "status-name") or STATUS_LABELS.get(status),
            "priority": integer(t, "priority") or 1, "source": integer(t, "source"),
            "ticket_type": text(t, "ticket-type"),
            "category": cf.get("cf_category_of_request") if isinstance(cf.get("cf_category_of_request"), str) else None,
            "sub_category": cf.get("cf_sub_category") if isinstance(cf.get("cf_sub_category"), str) else None,
            "classification": cf.get("cf_classification") if isinstance(cf.get("cf_classification"), str) else None,
            "tags": tags, "group_id": integer(t, "group-id"), "responder_id": integer(t, "responder-id"),
            "internal_group_id": integer(t, "internal-group-id"), "internal_agent_id": integer(t, "internal-agent-id"),
            "requester_id": requester_id, "company_id": None, "product_id": integer(t, "product-id"),
            "requester_name": text(t, "requester-name"), "requester_phone_e164": phone, "client_id": client_id,
            "due_by": ts(t, "due-by"), "fr_due_by": ts(t, "frDueBy"),
            "is_escalated": boolean(t, "isescalated"), "fr_escalated": boolean(t, "fr-escalated"),
            "spam": boolean(t, "spam"), "deleted": boolean(t, "deleted"),
            "first_responded_at": ts(states, "first-response-time"), "agent_responded_at": ts(states, "agent-responded-at"),
            "requester_responded_at": ts(states, "requester-responded-at"), "status_updated_at": ts(states, "status-updated-at"),
            "reopened_at": None, "pending_since": ts(states, "pending-since"),
            "resolved_at": ts(states, "resolved-at"), "closed_at": ts(states, "closed-at"),
            "custom_fields": cf, "raw": raw,
            "fd_created_at": ts(t, "created-at"), "fd_updated_at": ts(t, "updated-at") or ts(t, "created-at"),
            "conversations_synced_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "conversation_count": len(note_rows),
        })
        notes.extend(note_rows)
    return tickets, notes


# ─── main ───────────────────────────────────────────────────────────────────

def main():
    global BASE, KEY
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--files", type=int, default=0, help="limit ticket files (dry runs)")
    ap.add_argument("--only", choices=["tickets", "contacts", "agents", "groups"], default=None)
    args = ap.parse_args()
    BASE, KEY = load_env()

    d = args.dir.rstrip("/")
    by_contact, by_phone = load_client_index() if args.apply or True else ({}, {})
    print(f"client index: {len(by_contact)} by Freshdesk contact id, {len(by_phone)} by phone")

    # Contacts first (they give the requester phones for ticket linking).
    contacts: list[dict] = []
    if args.only in (None, "contacts", "tickets"):
        for f in sorted(glob.glob(f"{d}/Users*.xml")):
            contacts.extend(parse_contacts(f, by_contact, by_phone))
    requester_phones = {c["id"]: c["phone_e164"] for c in contacts if c["phone_e164"]}
    linked_contacts = sum(1 for c in contacts if c["client_id"])
    print(f"contacts: {len(contacts)} parsed, {len(requester_phones)} with phone, {linked_contacts} linked to a client")

    groups = parse_groups(f"{d}/Groups.xml") if args.only in (None, "groups") and os.path.exists(f"{d}/Groups.xml") else []
    agents = parse_agents(f"{d}/AllAgents0.xml") if args.only in (None, "agents") and os.path.exists(f"{d}/AllAgents0.xml") else []
    print(f"groups: {len(groups)}, agents: {len(agents)}")

    if args.apply:
        if groups:
            print("upsert groups", upsert("groups", groups))
        if agents:
            print("upsert agents", upsert("agents", agents))
        if contacts and args.only in (None, "contacts"):
            print("upsert contacts", upsert("contacts", contacts, 500))

    if args.only not in (None, "tickets"):
        return

    files = sorted(glob.glob(f"{d}/Tickets*.xml"), key=lambda p: int(re.search(r"(\d+)\.xml$", p).group(1)))
    if args.files:
        files = files[: args.files]
    tot_t = tot_n = linked = 0
    max_updated = ""
    t0 = time.time()
    for i, f in enumerate(files, 1):
        tickets, notes = parse_tickets(f, by_contact, by_phone, requester_phones)
        tot_t += len(tickets)
        tot_n += len(notes)
        linked += sum(1 for t in tickets if t["client_id"])
        for t in tickets:
            if t["fd_updated_at"] and t["fd_updated_at"] > max_updated:
                max_updated = t["fd_updated_at"]
        if args.apply:
            upsert("tickets", tickets, 300)
            if notes:
                upsert("conversations", notes, 500)
        print(f"[{i}/{len(files)}] {os.path.basename(f)}: {len(tickets)} tickets, {len(notes)} notes "
              f"({'written' if args.apply else 'parsed'}) · {int(time.time() - t0)}s", flush=True)
    print(f"TOTAL tickets {tot_t} · notes {tot_n} · linked to a client {linked} · latest updated-at {max_updated}")

    if args.apply and not args.files and max_updated:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        rest("POST", "sync_state?on_conflict=key", [
            {"key": "backfill", "value": {"updated_since": "export", "page": 0, "done": True, "tickets_done": tot_t,
                                          "finished_at": now, "source": "account_export"}, "updated_at": now},
            {"key": "poll", "value": {"watermark": max_updated, "last_run_at": None, "last_ok": None, "last_error": None},
             "updated_at": now},
        ], prefer="resolution=merge-duplicates,return=minimal")
        print(f"sync_state: backfill=done, poll watermark={max_updated}")


if __name__ == "__main__":
    main()
