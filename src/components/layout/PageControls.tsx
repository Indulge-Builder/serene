"use client";

/**
 * PageControls — the global controls cluster that lives ON the page title row
 * (right-aligned, beside the page's own action button), so it reads as part of
 * the page — no separate bar, no strip, no divider (TOP_BAR_ENABLED).
 *
 * Hosts the admin/founder domain selector + the notification bell. Pages render
 * it in their `flex items-center justify-between` title row; it sits at the far
 * right next to the page CTA. The domain selector stays visible at every
 * breakpoint — it used to hide below md, but the dashboard has no per-page filter
 * bar to fall back to, so hiding it stranded admin/founder with the date filter
 * but no domain scope. DomainSelector composes <FilterDropdown menuPortal>, so
 * its menu body-portals out and never clips on a narrow viewport.
 *
 * SINGLE BELL MOUNT — one `NotificationBell` per page render. `useNotifications`
 * keys its Realtime channel by userId only (no mount suffix), so this must be
 * the only bell mounted: the Sidebar footer bell is gated off when
 * TOP_BAR_ENABLED. The seed streams from the page's `notificationsPromise`
 * (started un-awaited, same contract as the old Sidebar/TopBar bell).
 */

import { Suspense, use } from "react";
import { Bell } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { DomainSelector } from "@/components/layout/DomainSelector";
import type { Notification } from "@/lib/types/database";

// ─── Notification bell seed (streamed) ────────────────────
// getNotifications never rejects (returns [] on error), so use() cannot throw.
// The bell sits on the paper title row, so it uses the `topbar` (paper-text)
// variant at every breakpoint.
function SeededNotificationBell({
  userId,
  promise,
}: {
  userId: string;
  promise: Promise<Notification[]>;
}) {
  const initialData = use(promise);
  return (
    <NotificationBell userId={userId} initialData={initialData} variant="topbar" />
  );
}

// Same-size stand-in while the seed streams — no layout shift. Paper-text colour.
function BellFallback() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        color: "var(--theme-text-secondary)",
        flexShrink: 0,
      }}
    >
      <Bell style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
    </div>
  );
}

// ─── PageControls ─────────────────────────────────────────

type PageControlsProps = {
  userId: string;
  isPrivileged: boolean; // admin || founder → the domain selector renders
  notificationsPromise: Promise<Notification[]>;
};

export function PageControls({
  userId,
  isPrivileged,
  notificationsPromise,
}: PageControlsProps) {
  return (
    <div className="serene-page-controls">
      {isPrivileged && (
        <span className="serene-page-controls-selector">
          <DomainSelector />
        </span>
      )}

      <Suspense fallback={<BellFallback />}>
        <SeededNotificationBell userId={userId} promise={notificationsPromise} />
      </Suspense>
    </div>
  );
}
