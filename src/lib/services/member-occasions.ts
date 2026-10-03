// member-occasions.ts — THE occasions read's sessionless core (2026-10-03; born in elaya-data.ts on
// 2026-10-02 and moved here because the teammate sweep runs from Trigger.dev, where the data seam's
// `server-only` chain cannot be imported). Whose birthday, anniversary, renewal, trip or noted
// occasion falls in a window, for a scope that is ALREADY decided (every queendom, or one): the date
// facts (read by utils/occasion-dates.ts), the anticipations and the membership end, plus how many
// members have NO date on record. Two callers: elaya-data.findMemberOccasionsFor (the tool, from the
// principal's seat) and elaya-teammate.ts (the weekly digest, one queendom at a time). Never called
// with a model-supplied scope. No `server-only`.

import { createAdminClient } from '@/lib/supabase/admin';
import { memberDb } from '@/lib/supabase/schemas';
import { mapRows } from '@/lib/utils/rows';
import { parseOccasionDate, nextOccurrence, daysUntil } from '@/lib/utils/occasion-dates';
import { IST_OFFSET_MS } from '@/lib/utils/ist';

const clip = (v: string | null | undefined, n = 200) => (v && v.length > n ? v.slice(0, n) + '…' : (v ?? null));
const MEMBER_LIST_SCAN = 600;

export type MemberOccasionKind = 'birthday' | 'anniversary' | 'dating_anniversary' | 'renewal' | 'trip' | 'occasion' | 'follow_up' | 'pattern' | 'silence';
const OCCASION_KINDS: readonly MemberOccasionKind[] = ['birthday', 'anniversary', 'dating_anniversary', 'renewal', 'trip', 'occasion', 'follow_up', 'pattern', 'silence'];
const OCCASION_DATE_KEYS: Record<string, MemberOccasionKind> = { birthday: 'birthday', anniversary: 'anniversary', dating_anniversary: 'dating_anniversary' };
const OCCASION_DEFAULT_DAYS = 30;
const OCCASION_MAX_DAYS = 366;
const OCCASION_MAX_ROWS = 100;

export type MemberOccasionsOptions = { kinds?: readonly string[] | null; from?: string | null; to?: string | null; queendom?: string | null; status?: string | null; limit?: number };

/** id → name of every queendom (a dozen rows; read once per call). */
export async function queendomNames(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await createAdminClient().schema('sia').from('queendoms').select('id, name');
  mapRows<{ id: string; name: string }, void>(data, (q) => { out.set(q.id, q.name); });
  return out;
}

export type OccasionScope = { scopeAll: boolean; head: boolean; queendomId: string | null };

/**
 * THE sessionless core of the occasions read: the scope is already decided (every queendom, or one).
 * Two callers: the tool above (the principal's seat) and the teammate sweep's weekly digest
 * (elaya-teammate.ts, one queendom at a time). Never called with a model-supplied scope.
 */
export async function findMemberOccasionsInScope(scope: OccasionScope, opts: MemberOccasionsOptions = {}, names?: Map<string, string>) {
  const admin = createAdminClient();
  const { scopeAll, head } = scope;
  const wantQueendom = scopeAll ? scope.queendomId : null;
  const queendom_id = scope.queendomId;
  const qNames = names ?? (await queendomNames());

  // The window, on the IST calendar: today by default, 30 days ahead, never more than a year.
  const todayIst = new Date(Date.now() + IST_OFFSET_MS);
  const today = new Date(Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), todayIst.getUTCDate()));
  const from = opts.from && !Number.isNaN(Date.parse(opts.from)) ? new Date(`${opts.from.slice(0, 10)}T00:00:00Z`) : today;
  let to = opts.to && !Number.isNaN(Date.parse(opts.to)) ? new Date(`${opts.to.slice(0, 10)}T00:00:00Z`) : new Date(from.getTime() + OCCASION_DEFAULT_DAYS * 86_400_000);
  if (to.getTime() < from.getTime()) to = from;
  if (to.getTime() - from.getTime() > OCCASION_MAX_DAYS * 86_400_000) to = new Date(from.getTime() + OCCASION_MAX_DAYS * 86_400_000);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const kinds = new Set<MemberOccasionKind>((opts.kinds ?? []).filter((k): k is MemberOccasionKind => (OCCASION_KINDS as readonly string[]).includes(k)));
  if (kinds.size === 0) for (const k of OCCASION_KINDS) kinds.add(k);
  const status = (opts.status?.trim() || 'Active');

  let q = memberDb(admin).from('members').select('id, full_name, queendom_id, tier, membership_status, membership_end').order('full_name').limit(MEMBER_LIST_SCAN);
  if (head) q = q.not('queendom_id', 'is', null);
  if (!scopeAll) q = q.eq('queendom_id', queendom_id as string);
  else if (wantQueendom) q = q.eq('queendom_id', wantQueendom);
  if (status.toLowerCase() !== 'any') q = q.ilike('membership_status', status);
  const { data: memberRows, error: memberErr } = await q;
  if (memberErr) return { ok: false as const, error: 'the member list could not be read just now' };
  type M = { id: string; full_name: string; queendom_id: string | null; tier: string | null; membership_status: string | null; membership_end: string | null };
  const members = mapRows<M, M>(memberRows, (r) => r);
  const byId = new Map(members.map((m) => [m.id, m]));
  const ids = members.map((m) => m.id);

  type Row = { member_id: string; member: string; queendom: string | null; tier: string | null; kind: MemberOccasionKind; date: string; days_away: number; detail: string | null; source: 'fact' | 'anticipation' | 'membership'; suggested_action?: string | null; status?: string };
  const rows: Row[] = [];
  const withDate = { birthday: new Set<string>(), anniversary: new Set<string>() };

  // 1. The date facts, parsed by the one reader.
  const wantFacts = [...kinds].some((k) => k === 'birthday' || k === 'anniversary' || k === 'dating_anniversary' || k === 'occasion');
  if (wantFacts) {
    for (let i = 0; i < ids.length; i += 150) {
      const { data: facts } = await memberDb(admin).from('member_facts')
        .select('member_id, facet, key, value, value_json, confidence')
        .in('member_id', ids.slice(i, i + 150)).is('superseded_by', null)
        .or(`key.in.(${Object.keys(OCCASION_DATE_KEYS).join(',')}),facet.eq.occasion`)
        .order('confidence', { ascending: false });
      mapRows<{ member_id: string; facet: string; key: string; value: string | null; value_json: unknown; confidence: number | string | null }, void>(facts, (f) => {
        const m = byId.get(f.member_id);
        if (!m) return;
        const kind: MemberOccasionKind = OCCASION_DATE_KEYS[f.key] ?? 'occasion';
        const md = parseOccasionDate(f.value, f.value_json);
        if (!md) return;
        if (kind === 'birthday') withDate.birthday.add(m.id);
        if (kind === 'anniversary') withDate.anniversary.add(m.id);
        if (!kinds.has(kind)) return;
        const date = nextOccurrence(md, from, to);
        if (!date) return;
        if (rows.some((r) => r.member_id === m.id && r.kind === kind && r.date === date)) return;
        const years = md.year ? Number(date.slice(0, 4)) - md.year : null;
        rows.push({
          member_id: m.id, member: m.full_name, queendom: m.queendom_id ? (qNames.get(m.queendom_id) ?? null) : null, tier: m.tier, kind, date,
          days_away: daysUntil(date, from), source: 'fact',
          detail: kind === 'occasion' ? clip(`${f.key ? f.key + ': ' : ''}${f.value ?? ''}`, 120) : years && years > 0 && years < 120 ? `turns ${years}` : null,
        });
      });
    }
  }

  // 2. What the profiler and the team already filed as coming up.
  const anticipationKinds = [...kinds].filter((k) => k === 'occasion' || k === 'renewal' || k === 'trip' || k === 'follow_up' || k === 'pattern' || k === 'silence');
  if (anticipationKinds.length) {
    for (let i = 0; i < ids.length; i += 150) {
      const { data: ants } = await memberDb(admin).from('member_anticipations')
        .select('member_id, kind, title, due_at, suggested_action, status')
        .in('member_id', ids.slice(i, i + 150)).in('status', ['pending', 'surfaced']).in('kind', anticipationKinds)
        .gte('due_at', from.toISOString()).lt('due_at', new Date(to.getTime() + 86_400_000).toISOString());
      mapRows<{ member_id: string; kind: string; title: string; due_at: string; suggested_action: string | null; status: string }, void>(ants, (a) => {
        const m = byId.get(a.member_id);
        if (!m) return;
        const date = new Date(Date.parse(a.due_at) + IST_OFFSET_MS).toISOString().slice(0, 10);
        rows.push({
          member_id: m.id, member: m.full_name, queendom: m.queendom_id ? (qNames.get(m.queendom_id) ?? null) : null, tier: m.tier,
          kind: a.kind as MemberOccasionKind, date, days_away: daysUntil(date, from), detail: clip(a.title, 120), source: 'anticipation',
          suggested_action: a.suggested_action ? clip(a.suggested_action, 160) : null, status: a.status,
        });
      });
    }
  }

  // 3. Memberships ending in the window (a renewal the anticipations may not carry yet).
  if (kinds.has('renewal')) {
    for (const m of members) {
      if (!m.membership_end) continue;
      const date = m.membership_end.slice(0, 10);
      if (date < fromIso || date > toIso) continue;
      if (rows.some((r) => r.member_id === m.id && r.kind === 'renewal' && Math.abs(daysUntil(r.date, from) - daysUntil(date, from)) <= 3)) continue;
      rows.push({ member_id: m.id, member: m.full_name, queendom: m.queendom_id ? (qNames.get(m.queendom_id) ?? null) : null, tier: m.tier, kind: 'renewal', date, days_away: daysUntil(date, from), detail: `membership ends ${date}`, source: 'membership' });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.member.localeCompare(b.member));
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), OCCASION_MAX_ROWS);
  return {
    ok: true as const,
    window: { from: fromIso, to: toIso, days: Math.round((to.getTime() - from.getTime()) / 86_400_000) },
    scope: scopeAll ? (wantQueendom ? qNames.get(wantQueendom) : 'all queendoms') : (qNames.get(queendom_id as string) ?? 'your queendom'),
    status,
    kinds: [...kinds],
    members_in_scope: members.length,
    missing: {
      birthday_on_record: withDate.birthday.size,
      birthday_missing: wantFacts && kinds.has('birthday') ? members.length - withDate.birthday.size : null,
      anniversary_on_record: withDate.anniversary.size,
    },
    occasions: rows.slice(0, limit),
    total: rows.length,
    note:
      (rows.length > limit ? `Showing ${limit} of ${rows.length}. ` : '') +
      'A date comes from a saved fact (source fact), from what the profiler or the team filed as coming up (anticipation), or from the membership end (membership). ' +
      'A member with no birthday on record is counted in missing, not silently absent: say so when the question is "who has a birthday", never claim nobody does.',
  };
}
