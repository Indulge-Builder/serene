// sia-staff-link.ts — THE link between a Serene account and the WhatsApp contact behind it.
//
// The rule the founder set (2026-09-22): every employee gets a company phone and an email; the
// phone joins the WhatsApp groups, the email signs up on Serene. So the phone is the key: a
// `sia.wag_contacts` row whose phone equals an active profile's phone IS that person, and gets
// `staff_profile_id` + the position from the profile (`sia_role`, or `founder`). WhatsApp hides
// the phone behind a privacy id (`@lid`) inside groups; the connector records the pairing on the
// phone row (`lid`), so a hidden-id row is linked through its pair. Runs every 15 minutes
// (src/trigger/sia-staff-link.ts) and on demand from the user page. Admin client: the contacts
// schema has no user policies. No `server-only` chain (Trigger.dev runs it).

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeToE164 } from "@/lib/utils/phone";
import { mapRows } from "@/lib/utils/rows";

type Contact = { jid: string; lid: string | null; phone: string | null; push_name: string | null; participant_role: string; staff_profile_id: string | null };
type Person = { id: string; full_name: string; phone: string | null; role: string; sia_role: string | null; is_active: boolean };

const POSITION_ROLES = new Set(["genie", "bishop", "queen", "joker"]);

/** The participant role a linked profile implies; null = leave the row's role alone. */
function roleFor(p: Person): string | null {
  if (p.sia_role && POSITION_ROLES.has(p.sia_role)) return p.sia_role;
  if (p.role === "founder") return "founder";
  return null;
}

/** The comparable form of a phone; a value the normaliser rejects simply never matches. */
function key(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try { return normalizeToE164(phone); } catch { return null; }
}

export type StaffLinkResult = { profilesWithPhone: number; linked: number; relinked: number; viaHiddenId: number; unlinked: number };

/** Link every contact whose phone matches an active profile; clear links whose profile is gone or inactive. */
export async function linkStaffContactsByPhone(): Promise<StaffLinkResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sia = admin.schema("sia") as unknown as { from: (t: string) => any };

  const { data: people } = await admin.from("profiles").select("id, full_name, phone, role, sia_role, is_active");
  const byPhone = new Map<string, Person>();
  const byId = new Map<string, Person>();
  for (const p of mapRows<Person, Person>(people, (x) => x)) {
    byId.set(p.id, p);
    const k = key(p.phone);
    if (k && p.is_active) byPhone.set(k, p);
  }

  // Every contact with a phone (paged past PostgREST's 1,000-row response cap).
  const withPhone: Contact[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sia.from("wag_contacts").select("jid, lid, phone, push_name, participant_role, staff_profile_id").not("phone", "is", null).range(from, from + 999);
    const rows = mapRows<Contact, Contact>(data, (x) => x);
    withPhone.push(...rows);
    if (rows.length < 1000) break;
  }

  const result: StaffLinkResult = { profilesWithPhone: byPhone.size, linked: 0, relinked: 0, viaHiddenId: 0, unlinked: 0 };
  const linkedLids = new Map<string, { profileId: string; role: string | null }>();

  for (const c of withPhone) {
    const p = byPhone.get(key(c.phone) ?? "");
    if (p) {
      const role = roleFor(p);
      if (c.lid) linkedLids.set(c.lid, { profileId: p.id, role });
      const patch: Record<string, unknown> = {};
      if (c.staff_profile_id !== p.id) patch.staff_profile_id = p.id;
      if (role && c.participant_role !== role) patch.participant_role = role;
      if (Object.keys(patch).length) {
        await sia.from("wag_contacts").update(patch).eq("jid", c.jid);
        if (c.staff_profile_id) result.relinked += 1; else result.linked += 1;
      }
    } else if (c.staff_profile_id && !byId.get(c.staff_profile_id)?.is_active) {
      // The account is gone or deactivated: the phone may be handed to the next hire.
      await sia.from("wag_contacts").update({ staff_profile_id: null }).eq("jid", c.jid);
      result.unlinked += 1;
    }
  }

  // Hidden-id rows (@lid) carry no phone; the phone row's `lid` says who they are.
  if (linkedLids.size) {
    const lids = [...linkedLids.keys()];
    for (let i = 0; i < lids.length; i += 150) {
      const slice = lids.slice(i, i + 150);
      const { data } = await sia.from("wag_contacts").select("jid, participant_role, staff_profile_id").in("jid", slice);
      for (const c of mapRows<Contact, Contact>(data, (x) => x)) {
        const want = linkedLids.get(c.jid)!;
        const patch: Record<string, unknown> = {};
        if (c.staff_profile_id !== want.profileId) patch.staff_profile_id = want.profileId;
        if (want.role && c.participant_role !== want.role) patch.participant_role = want.role;
        if (Object.keys(patch).length) {
          await sia.from("wag_contacts").update(patch).eq("jid", c.jid);
          result.viaHiddenId += 1;
        }
      }
    }
  }
  return result;
}

export type StaffWhatsAppLink = { jid: string; hidden_id: boolean; whatsapp_name: string | null; role: string; groups: number; last_seen_at: string };

/** The WhatsApp contacts linked to one Serene account, for the user page's WhatsApp card. */
export async function getStaffWhatsAppLinks(profileId: string): Promise<StaffWhatsAppLink[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sia = createAdminClient().schema("sia") as unknown as { from: (t: string) => any };
  const { data } = await sia.from("wag_contacts").select("jid, push_name, participant_role, last_seen_at").eq("staff_profile_id", profileId).order("last_seen_at", { ascending: false });
  const rows = mapRows<{ jid: string; push_name: string | null; participant_role: string; last_seen_at: string }, { jid: string; push_name: string | null; participant_role: string; last_seen_at: string }>(data, (x) => x);
  const out: StaffWhatsAppLink[] = [];
  for (const r of rows) {
    const { count } = await sia.from("wag_group_members").select("group_jid", { count: "exact", head: true }).eq("member_jid", r.jid);
    out.push({ jid: r.jid, hidden_id: r.jid.endsWith("@lid"), whatsapp_name: r.push_name, role: r.participant_role, groups: Number(count ?? 0), last_seen_at: r.last_seen_at });
  }
  return out;
}
