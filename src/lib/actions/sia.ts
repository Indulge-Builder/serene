"use server";

import { requireProfile } from "@/lib/actions/_auth";
import {
  getSiaGroupInfo,
  getSiaGroups,
  getSiaHealth,
  getSiaMediaPayload,
  getSiaMessages,
  getSiaWatcherStatus,
  requestSiaSessionRepair,
  requestSiaWatcherRestart,
  searchSiaMessages,
  updateSiaGroupMapping,
  type SiaGroupInfo,
  type SiaGroupKind,
  type SiaGroupRow,
  type SiaHealth,
  type SiaMediaPayload,
  type SiaMessageRow,
  type SiaSearchHit,
  type SiaWatcherState,
} from "@/lib/services/sia-service";
import { canViewSiaGroup, getQueendomGroupJids, getSiaViewerScope, type SiaViewerScope } from "@/lib/services/sia-access";
import { formErrors } from "@/lib/validations/form-errors";
import type { ActionResult } from "@/lib/types";

// Two gates (2026-09-18, plan decision 6). The READS (groups, info, messages, media, search)
// are open to whoever getSiaViewerScope admits: admin/founder see everything, a seated
// concierge teammate sees only the groups of their own queendom, checked per group on the
// server. Everything that CHANGES Sia (the console, restart, repair, mapping) stays
// admin/founder. Identity always comes from the verified profile, never the browser (A-01).
const SIA_ROLES = ["admin", "founder"] as const;

type SiaViewer = { ok: true; scope: SiaViewerScope } | { ok: false; result: { data: null; error: string } };
async function requireSiaViewer(): Promise<SiaViewer> {
  const auth = await requireProfile();
  if (!auth.ok) return { ok: false, result: auth.result };
  const scope = await getSiaViewerScope(auth.profile);
  if (!scope) return { ok: false, result: { data: null, error: formErrors.unauthorized } };
  return { ok: true, scope };
}
const GROUP_KINDS: readonly SiaGroupKind[] = ["member", "vendor", "internal", "unmapped"];

function isGroupJid(v: unknown): v is string {
  return typeof v === "string" && v.endsWith("@g.us");
}

function isIsoTimestamp(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

// ── getSiaGroupsAction — rail refresh + the control modal's mapping list ──
export async function getSiaGroupsAction(): Promise<ActionResult<SiaGroupRow[]>> {
  const auth = await requireSiaViewer();
  if (!auth.ok) return auth.result;
  try {
    const groups = await getSiaGroups();
    if (auth.scope.kind === "all") return { data: groups, error: null };
    const mine = await getQueendomGroupJids(auth.scope.queendomId);
    return { data: groups.filter((g) => mine.has(g.group_jid)), error: null };
  } catch (err) {
    console.error("[sia-action] getSiaGroups failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── getSiaGroupInfoAction — the group profile panel (members, description, owner) ──
export async function getSiaGroupInfoAction(groupJid: string): Promise<ActionResult<SiaGroupInfo>> {
  const auth = await requireSiaViewer();
  if (!auth.ok) return auth.result;
  if (!isGroupJid(groupJid)) return { data: null, error: formErrors.generic };
  if (!(await canViewSiaGroup(auth.scope, groupJid))) return { data: null, error: formErrors.unauthorized };
  try {
    const info = await getSiaGroupInfo(groupJid);
    if (!info) return { data: null, error: formErrors.generic };
    return { data: info, error: null };
  } catch (err) {
    console.error("[sia-action] getSiaGroupInfo failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── getSiaMessagesAction — keyset pager (before) + the 4s live tail (after) ──
export async function getSiaMessagesAction(
  groupJid: string,
  opts?: { before?: string; after?: string; around?: string; radius?: number },
): Promise<ActionResult<{ messages: SiaMessageRow[]; hasMore: boolean }>> {
  const auth = await requireSiaViewer();
  if (!auth.ok) return auth.result;
  if (!isGroupJid(groupJid)) return { data: null, error: formErrors.generic };
  if (!(await canViewSiaGroup(auth.scope, groupJid))) return { data: null, error: formErrors.unauthorized };
  const before = opts?.before;
  const after = opts?.after;
  if (before !== undefined && !isIsoTimestamp(before)) return { data: null, error: formErrors.generic };
  if (after !== undefined && !isIsoTimestamp(after)) return { data: null, error: formErrors.generic };
  const around = opts?.around;
  if (around !== undefined && !isIsoTimestamp(around)) return { data: null, error: formErrors.generic };
  const radius = typeof opts?.radius === "number" && Number.isFinite(opts.radius) ? Math.max(1, Math.min(60, Math.floor(opts.radius))) : undefined;
  try {
    return { data: await getSiaMessages(groupJid, { before, after, around, radius }), error: null };
  } catch (err) {
    console.error("[sia-action] getSiaMessages failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── getSiaMediaAction — one downloaded media file as a data: URL for the viewer ──
export async function getSiaMediaAction(
  chatJid: string,
  waMessageId: string,
  senderJid: string,
): Promise<ActionResult<SiaMediaPayload>> {
  const auth = await requireSiaViewer();
  if (!auth.ok) return auth.result;
  if (!isGroupJid(chatJid)) return { data: null, error: formErrors.generic };
  if (!(await canViewSiaGroup(auth.scope, chatJid))) return { data: null, error: formErrors.unauthorized };
  if (typeof waMessageId !== "string" || waMessageId.length === 0 || waMessageId.length > 256) {
    return { data: null, error: formErrors.generic };
  }
  if (typeof senderJid !== "string" || senderJid.length === 0 || senderJid.length > 256) {
    return { data: null, error: formErrors.generic };
  }
  try {
    const { payload, reason } = await getSiaMediaPayload(chatJid, waMessageId, senderJid);
    if (!payload) {
      const copy =
        reason === "too_large"
          ? "This file is too large to preview here."
          : reason === "not_ready"
            ? "This file hasn't finished downloading yet."
            : "This file isn't available.";
      return { data: null, error: copy };
    }
    return { data: payload, error: null };
  } catch (err) {
    console.error("[sia-action] getSiaMedia failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── searchSiaMessagesAction — FTS over message bodies (optionally one group) ──
export async function searchSiaMessagesAction(
  query: string,
  groupJid?: string,
): Promise<ActionResult<SiaSearchHit[]>> {
  const auth = await requireSiaViewer();
  if (!auth.ok) return auth.result;
  if (typeof query !== "string") return { data: null, error: formErrors.generic };
  if (groupJid !== undefined && !isGroupJid(groupJid)) return { data: null, error: formErrors.generic };
  if (groupJid !== undefined && !(await canViewSiaGroup(auth.scope, groupJid))) return { data: null, error: formErrors.unauthorized };
  try {
    const hits = await searchSiaMessages(query, groupJid);
    // A search across groups is cut down to the viewer's own queendom before it leaves the server.
    if (auth.scope.kind === "all" || groupJid !== undefined) return { data: hits, error: null };
    const mine = await getQueendomGroupJids(auth.scope.queendomId);
    return { data: hits.filter((h) => mine.has(h.group_jid)), error: null };
  } catch (err) {
    console.error("[sia-action] searchSiaMessages failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── getSiaHealthAction — the "is the ear alive" panel ──
export async function getSiaHealthAction(): Promise<ActionResult<SiaHealth>> {
  const auth = await requireProfile(SIA_ROLES);
  if (!auth.ok) return auth.result;
  try {
    return { data: await getSiaHealth(), error: null };
  } catch (err) {
    console.error("[sia-action] getSiaHealth failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── getSiaPairingStatusAction — the console's session panel (5s poll while open).
//    The QR is exposed ONLY while the watcher sits in 'pairing' — scanning it
//    grants the WhatsApp session, so it never leaves this admin/founder gate. ──
export type SiaPairingStatus = {
  state: SiaWatcherState | "unknown";
  beatAt: string | null;
  stateSince: string | null;
  qr: string | null;
  restartPending: boolean;
};

export async function getSiaPairingStatusAction(): Promise<ActionResult<SiaPairingStatus>> {
  const auth = await requireProfile(SIA_ROLES);
  if (!auth.ok) return auth.result;
  try {
    const s = await getSiaWatcherStatus();
    if (!s) {
      return { data: { state: "unknown", beatAt: null, stateSince: null, qr: null, restartPending: false }, error: null };
    }
    const beatFresh = Date.now() - new Date(s.beat_at).getTime() < 3 * 60 * 1000;
    return {
      data: {
        state: beatFresh ? s.state : "unknown",
        beatAt: s.beat_at,
        stateSince: s.state_since,
        qr: s.state === "pairing" && beatFresh ? s.qr : null,
        restartPending:
          !!s.restart_requested_at && new Date(s.restart_requested_at).getTime() > Date.now() - 5 * 60 * 1000,
      },
      error: null,
    };
  } catch (err) {
    console.error("[sia-action] getSiaPairingStatus failed:", err);
    return { data: null, error: formErrors.generic };
  }
}

// ── requestSiaRestartAction — clean restart, same session resumes (safe) ──
export async function requestSiaRestartAction(): Promise<ActionResult<{ requested: true }>> {
  const auth = await requireProfile(SIA_ROLES);
  if (!auth.ok) return auth.result;
  const ok = await requestSiaWatcherRestart();
  if (!ok) return { data: null, error: formErrors.generic };
  return { data: { requested: true }, error: null };
}

// ── requestSiaRepairAction — wipe the WhatsApp session + restart into pairing.
//    The QR then appears in the console within ~1 minute. Session-destructive
//    (never data-destructive); the UI double-confirms before calling. ──
export async function requestSiaRepairAction(): Promise<ActionResult<{ requested: true }>> {
  const auth = await requireProfile(SIA_ROLES);
  if (!auth.ok) return auth.result;
  const ok = await requestSiaSessionRepair();
  if (!ok) return { data: null, error: formErrors.generic };
  return { data: { requested: true }, error: null };
}

// ── updateSiaGroupMappingAction — classify a group + hide/show it ──
export async function updateSiaGroupMappingAction(
  groupJid: string,
  patch: { group_kind?: SiaGroupKind; is_active?: boolean; member_id?: string | null },
): Promise<ActionResult<{ saved: true }>> {
  const auth = await requireProfile(SIA_ROLES);
  if (!auth.ok) return auth.result;
  if (!isGroupJid(groupJid)) return { data: null, error: formErrors.generic };

  const clean: { group_kind?: SiaGroupKind; is_active?: boolean; member_id?: string | null } = {};
  if (patch.member_id !== undefined) {
    if (patch.member_id !== null && !/^[0-9a-f-]{36}$/i.test(patch.member_id)) return { data: null, error: formErrors.generic };
    clean.member_id = patch.member_id;
    clean.group_kind = patch.member_id ? "member" : "unmapped";
  }
  if (patch.group_kind !== undefined) {
    if (!GROUP_KINDS.includes(patch.group_kind)) return { data: null, error: formErrors.generic };
    clean.group_kind = patch.group_kind;
  }
  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== "boolean") return { data: null, error: formErrors.generic };
    clean.is_active = patch.is_active;
  }
  if (Object.keys(clean).length === 0) return { data: null, error: formErrors.generic };

  const ok = await updateSiaGroupMapping(groupJid, clean);
  if (!ok) return { data: null, error: formErrors.generic };
  return { data: { saved: true }, error: null };
}
