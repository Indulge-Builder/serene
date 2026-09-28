/**
 * sheet.ts — reading Lilian's Google Sheet (her book, the "Group 1..5" tabs as CSV) and finding
 * each logged item's client group. Shared by the jokers' pilots (capture-pilot, replies-pilot);
 * testing only, the sheet stops once the capture runs.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";

export const IST = 5.5 * 3600_000;
export const LILIAN = "+919028092581";

export const words = (t: string) => [...new Set(t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((w) => w.length >= 3))];
const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** True when two words differ by at most one letter (one edit). */
const within1 = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** RFC 4180-ish: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

export type SheetItem = { client: string; date: number; type: string; label: string; yes: boolean };

/** Every dated item on the Group tabs. A cell holding several items ("Lollapalooza + ferrari") is split. */
export function readSheet(dir: string): { items: SheetItem[]; dropped: number } {
  const items: SheetItem[] = []; let dropped = 0;
  for (let g = 1; g <= 5; g++) {
    const p = join(dir, `group${g}.csv`);
    if (!existsSync(p)) continue;
    const rows = parseCsv(readFileSync(p, "utf8"));
    for (const r of rows.slice(1)) {
      const client = (r[0] ?? "").trim(); if (!client) continue;
      for (let s = 0; s < 6; s++) {
        const [date, type, label, resp] = [r[2 + 4 * s], r[3 + 4 * s], r[4 + 4 * s], r[5 + 4 * s]].map((x) => (x ?? "").trim());
        if (!date && !label) continue;
        const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(date);
        if (!m || !label) { dropped++; continue; }
        const at = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) - IST; // noon IST that day
        for (const part of label.split("+").map((x) => x.trim()).filter(Boolean)) items.push({ client, date: at, type: type || "(blank)", label: part, yes: /^yes/i.test(resp) });
      }
    }
  }
  return { items, dropped };
}

/** Sheet client name → the member's linked group(s). Exact name first, then looser, and only when unique. */
export async function groupsForClients(names: string[]): Promise<Map<string, string[]>> {
  const admin = createAdminClient();
  const members: { id: string; full_name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await memberDb(admin).from("members").select("id, full_name").order("id").range(from, from + 999);
    members.push(...((data ?? []) as { id: string; full_name: string }[]));
    if ((data ?? []).length < 1000) break;
  }
  const { data: gs } = await admin.schema("sia").from("wag_groups").select("group_jid, member_id, subject").not("member_id", "is", null);
  const linked = (gs ?? []) as { group_jid: string; member_id: string; subject: string | null }[];
  const groupsOf = new Map<string, string[]>();
  for (const g of linked) groupsOf.set(g.member_id, [...(groupsOf.get(g.member_id) ?? []), g.group_jid]);
  const out = new Map<string, string[]>();
  const holds = (hay: string, parts: string[]) => { const h = ` ${hay} `; return parts.every((w) => h.includes(` ${w} `)); };
  for (const name of new Set(names)) {
    const n = norm(name);
    const parts = n.split(" ").filter((w) => w.length > 1);
    // 1. The member's name, exactly; 2. a unique member whose name holds every word; 3. a unique
    // linked group whose title holds every word ("<Name>'s Concierge"); 4. the same on first + last word.
    let hit = members.filter((m) => norm(m.full_name) === n);
    if (hit.length !== 1) hit = members.filter((m) => holds(norm(m.full_name), parts));
    if (hit.length === 1 && groupsOf.has(hit[0].id)) { out.set(name, groupsOf.get(hit[0].id)!); continue; }
    let g = linked.filter((x) => holds(norm(x.subject ?? ""), parts));
    if (g.length !== 1 && parts.length > 2) g = linked.filter((x) => holds(norm(x.subject ?? ""), [parts[0], parts[parts.length - 1]]));
    // 5. Spelling differs between the sheet and Serene: the first name exactly plus another word
    // within one letter, in the group title or the linked member's name. Kept only when unique.
    if (g.length !== 1 && parts.length > 1) {
      const nameOfMember = new Map(members.map((m) => [m.id, norm(m.full_name)]));
      g = linked.filter((x) => {
        const hay = `${norm(x.subject ?? "")} ${nameOfMember.get(x.member_id) ?? ""}`.split(" ");
        return hay.includes(parts[0]) && parts.slice(1).some((w) => w.length >= 4 && hay.some((h) => h.length >= 4 && within1(w, h)));
      });
    }
    if (g.length === 1) out.set(name, [g[0].group_jid]);
  }
  return out;
}

/**
 * Each sheet item's best match among the candidates in its client's group(s): sent within 36 hours
 * of the sheet date with at least half the item's words in the text. Unmatched items come back with null.
 */
export function matchItems<T extends { chat_jid: string; at: number; text: string }>(items: SheetItem[], groupsOf: Map<string, string[]>, byChat: Map<string, T[]>, prefer?: (c: T) => boolean): { item: SheetItem; hit: T | null; noGroup: boolean }[] {
  return items.map((it) => {
    const chats = groupsOf.get(it.client) ?? [];
    if (!chats.length) return { item: it, hit: null, noGroup: true };
    const want = words(it.label);
    let best: T | null = null; let score = 0;
    for (const chat of chats) for (const c of byChat.get(chat) ?? []) {
      if (Math.abs(c.at - it.date) > 36 * 3600_000) continue;
      const have = new Set(words(c.text));
      const s = want.length ? want.filter((w) => have.has(w)).length / want.length : 0;
      if (s > score || (s === score && best && prefer && prefer(c) && !prefer(best))) { best = c; score = s; }
    }
    return { item: it, hit: score >= 0.5 ? best : null, noGroup: false };
  });
}
