"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m as motion } from "framer-motion";
import { Phone } from "lucide-react";
import { CALL_OUTCOME_LABELS } from "@/lib/constants/call-outcomes";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
} from "@/lib/constants/lead-statuses";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { WIDGET_HEIGHT_BY_SIZE } from "@/lib/constants/dashboard-widgets";
import { EASE_OUT_EXPO, BASE_DURATION } from "@/lib/constants/motion";
import { formatRelativeTime } from "@/lib/utils/dates";
import { getAgentRecentActivityAction } from "@/lib/actions/dashboard";
import { useWidgetData } from "@/hooks/useWidgetData";
import type { DashboardRecentLead } from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import type { CallOutcome, LeadStatus } from "@/lib/types/database";

type RecentLeadScope = "mine" | "team";

// ── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const colors = LEAD_STATUS_COLORS[status as LeadStatus];
  const label = LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 8px",
        fontSize: "var(--text-2xs)",
        fontWeight: "var(--weight-medium)",
        lineHeight: 1.5,
        borderRadius: "var(--radius-full)",
        color: colors?.text ?? "var(--theme-text-secondary)",
        background: colors?.light ?? "var(--theme-paper-subtle)",
        border: `1px solid ${colors?.border ?? "var(--theme-paper-border)"}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// ── One lead card — the lead's latest touch, three lines ─────────────────────
function LeadActivityCard({
  lead,
  showActor,
}: {
  lead: DashboardRecentLead;
  // Manager/founder see "by <agent>"; an agent's own feed doesn't need it.
  showActor: boolean;
}) {
  const leadName = lead.lead_name?.trim() || "Lead";
  const noteBody = lead.note_body?.trim() || null;
  const outcome = lead.last_call_outcome as CallOutcome | null;
  const outcomeLabel = outcome
    ? (CALL_OUTCOME_LABELS[outcome] ?? outcome)
    : null;
  const domainLabel = lead.lead_domain
    ? (DOMAIN_LABELS[lead.lead_domain as keyof typeof DOMAIN_LABELS] ??
      lead.lead_domain)
    : null;

  const cardInner = (
    <>
      {/* Line 1 — name · by <agent> · time (one line) */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-2)",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--theme-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {leadName}
        </span>

        {showActor && lead.assignee_name && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--theme-text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <span style={{ color: "var(--theme-text-tertiary)" }}>by </span>
            <span style={{ fontWeight: "var(--weight-medium)" }}>
              {lead.assignee_name}
            </span>
          </span>
        )}

        {/* spacer pushes the time to the far right */}
        <span style={{ flex: 1 }} />

        {lead.last_activity_at && (
          <span
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--theme-text-tertiary)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatRelativeTime(lead.last_activity_at)}
          </span>
        )}
      </div>

      {/* Line 2 — status + latest call outcome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <StatusChip status={lead.status} />
        {outcomeLabel && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "var(--text-xs)",
              color: "var(--theme-text-secondary)",
            }}
          >
            <Phone
              size={11}
              strokeWidth={1.5}
              style={{ color: "var(--color-info-text)" }}
            />
            {outcomeLabel}
          </span>
        )}
        {domainLabel && (
          <span
            style={{
              marginLeft: "auto",
              padding: "0 6px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-2xs)",
              background: "var(--theme-paper)",
              border: "1px solid var(--theme-paper-border)",
              color: "var(--theme-text-tertiary)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {domainLabel}
          </span>
        )}
      </div>

      {/* Line 3 — latest note. Sans + secondary (the canonical note-body
          treatment in LeadNotesSection) — serif-italic + tertiary read as
          washed-out body copy on the paper-subtle card. */}
      {noteBody && (
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-sans)",
            color: "var(--theme-text-secondary)",
            lineHeight: "var(--leading-normal)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {noteBody}
        </p>
      )}
    </>
  );

  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
    padding: "var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--theme-paper-subtle)",
    border: "1px solid var(--theme-paper-border)",
    textDecoration: "none",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
    >
      {lead.lead_slug ? (
        <Link
          href={`/leads/${lead.lead_slug}`}
          className="serene-activity-card"
          style={cardStyle}
        >
          {cardInner}
        </Link>
      ) : (
        <div style={cardStyle}>{cardInner}</div>
      )}
    </motion.div>
  );
}

// ── Mine / Team scope switch — bespoke curved toggle, themed ─────────────────
// A small two-segment pill: paper-subtle track, an accent-filled thumb that
// slides under the active label (transform/opacity only — Never-Do list).
function ScopeSwitch({
  scope,
  onChange,
  disabled,
}: {
  scope: RecentLeadScope;
  onChange: (next: RecentLeadScope) => void;
  disabled?: boolean;
}) {
  const options: { value: RecentLeadScope; label: string }[] = [
    { value: "mine", label: "Mine" },
    { value: "team", label: "Team" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Activity scope"
      style={{
        position: "relative",
        display: "inline-flex",
        padding: "2px",
        borderRadius: "var(--radius-full)",
        background: "var(--theme-paper-subtle)",
        border: "1px solid var(--theme-paper-border)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* sliding thumb */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: scope === "mine" ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: 2,
          width: "calc(50% - 2px)",
          borderRadius: "var(--radius-full)",
          background: "var(--theme-accent)",
          boxShadow: "var(--shadow-1)",
        }}
      />
      {options.map((opt) => {
        const active = scope === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            style={{
              position: "relative",
              zIndex: 1,
              minWidth: 44,
              padding: "3px 10px",
              border: "none",
              background: "transparent",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-2xs)",
              fontWeight: "var(--weight-medium)",
              letterSpacing: "0.02em",
              cursor: disabled ? "not-allowed" : "pointer",
              color: active
                ? "var(--theme-accent-fg)"
                : "var(--theme-text-secondary)",
              transition: "color var(--duration-fast) var(--ease-in-out)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function AgentActivityWidget({
  userId,
  role,
  initialData,
  size = "lg",
  scopeDomain,
}: WidgetProps) {
  // Manager/founder can flip Mine / Team; agents always see their own leads.
  const canToggle =
    role === "manager" || role === "admin" || role === "founder";
  const [scope, setScope] = useState<RecentLeadScope>("team");

  const seed = (initialData?.agent_activity ?? null) as
    | DashboardRecentLead[]
    | null;
  const { data, loaded, apply } = useWidgetData<DashboardRecentLead[]>({
    seed,
    fetcher: async () => {
      const result = await getAgentRecentActivityAction(
        userId,
        scopeDomain ?? undefined,
        scope,
      );
      return { data: result.data ?? null };
    },
    deps: [userId],
  });

  // A global domain pick round-trips the page and re-seeds `agent_activity` for
  // the new scope; useWidgetData ignores seed-prop changes (seed-once), so
  // re-apply the fresh scoped seed when the selector changes. Keyed on
  // scopeDomain only so it never fights a Mine/Team refetch.
  const firstSeedSync = useRef(true);
  useEffect(() => {
    if (firstSeedSync.current) {
      firstSeedSync.current = false;
      return; // initial seed already applied by useWidgetData
    }
    if (seed) apply(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeDomain]);

  // Mine/Team flip → fetch the scoped feed and apply it. (The seed always lands
  // as 'team' from the RSC; flipping to 'mine' is a client fetch.)
  const [scopeLoading, setScopeLoading] = useState(false);
  const firstScopeSync = useRef(true);
  useEffect(() => {
    if (firstScopeSync.current) {
      firstScopeSync.current = false;
      return; // seed is the initial 'team' view — no fetch needed
    }
    let cancelled = false;
    setScopeLoading(true);
    getAgentRecentActivityAction(userId, scopeDomain ?? undefined, scope)
      .then((result) => {
        if (!cancelled && result.data) apply(result.data);
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const leads = data ?? [];
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // Run the marquee only when ONE copy of the list actually overflows the
  // viewport — otherwise there's nothing to scroll and a loop would be pointless
  // motion. Measured (not a card-count guess) so it's correct at any widget size
  // and any note length. The shift = one copy's height + the inter-copy gap; the
  // keyframe translates by exactly that so copy B lands where copy A started
  // (seamless wrap). ResizeObserver re-checks on resize / content change.
  const GAP_PX = 8; // --space-2, the gap between cards and between the two copies
  const [marquee, setMarquee] = useState(false);
  const [shiftPx, setShiftPx] = useState(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = measureRef.current;
    if (!viewport || !content) {
      setMarquee(false);
      return;
    }
    // Reduced-motion users get a static, natively-scrollable list — never the
    // drift (which is pure decoration). Gating it here (not just in CSS) also
    // keeps the viewport on overflow:auto for them so they can scroll the list.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const check = () => {
      const copyHeight = content.scrollHeight; // one copy (the measured wrapper)
      setMarquee(!reduced && copyHeight > viewport.clientHeight + 8);
      setShiftPx(copyHeight + GAP_PX);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(viewport);
    ro.observe(content);
    return () => ro.disconnect();
  }, [leads, size]);

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        height: WIDGET_HEIGHT_BY_SIZE[size],
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontSize: "var(--text-md)",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            color: "var(--theme-text-primary)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {!loaded ? (
            "Loading…"
          ) : (
            <>
              Recent Leads<span className="page-title-dot">.</span>
            </>
          )}
        </p>

        {canToggle ? (
          <ScopeSwitch
            scope={scope}
            onChange={setScope}
            disabled={scopeLoading}
          />
        ) : (
          <span
            title="Always shows live data — not affected by date filter"
            style={{
              fontSize: "var(--text-2xs)",
              fontWeight: "var(--weight-medium)",
              color: "var(--color-success-text)",
              background: "var(--color-success-light)",
              border: "1px solid var(--color-success-text)",
              borderRadius: "var(--radius-full)",
              padding: "1px 6px",
              letterSpacing: "0.03em",
              flexShrink: 0,
            }}
          >
            Live
          </span>
        )}
      </div>

      {/* Feed — gentle CSS-transform marquee (off main thread; never touches
          scrollTop, so it can't fight a manual scroll). Hover pauses it. The
          viewport stays natively scrollable underneath. */}
      <div
        className="serene-activity-viewport"
        style={{
          position: "relative",
          flex: 1,
          minHeight: "160px",
        }}
      >
        <div
          ref={viewportRef}
          style={{
            position: "absolute",
            inset: 0,
            // While the marquee drifts it IS the scroll mechanism — hide native
            // overflow so the duplicated copy can't be manually scrolled into
            // view (hover pauses the drift to read). When not drifting (few
            // cards, or reduced-motion), fall back to native scroll.
            overflowY: marquee ? "hidden" : "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            scrollbarWidth: "none",
            padding: "var(--space-1) 0",
          }}
        >
          {loaded && leads.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "var(--text-sm)",
                color: "var(--theme-text-tertiary)",
                textAlign: "center",
                padding: "var(--space-6) 0",
                margin: 0,
              }}
            >
              {scope === "mine"
                ? "No leads worked yet."
                : "Nothing logged yet."}
            </p>
          ) : (
            // The animated track. When `marquee` is on, the keyframe translates
            // it up by exactly one copy's height + the inter-copy gap
            // (--marquee-shift, measured), so copy B lands where copy A started —
            // a seamless loop. The list renders once in the measured copy
            // (measureRef → one-copy height for the overflow test + shift), and a
            // second aria-hidden copy ONLY while the marquee runs.
            <div
              className={marquee ? "serene-activity-marquee" : undefined}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                // Constant visual speed: ~5.2s per card for ONE copy — a slow,
                // eye-pleasing drift (halved from the first 2.6s pass).
                ["--marquee-duration" as string]: `${Math.max(leads.length, 1) * 8}s`,
                // Exact one-copy-plus-gap distance for the seamless wrap.
                ["--marquee-shift" as string]: shiftPx ? `${shiftPx}px` : "50%",
              }}
            >
              <div
                ref={measureRef}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {leads.map((lead) => (
                  <LeadActivityCard
                    key={lead.lead_id}
                    lead={lead}
                    showActor={canToggle}
                  />
                ))}
              </div>
              {marquee && (
                <div
                  aria-hidden
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  {leads.map((lead) => (
                    <LeadActivityCard
                      key={`dup-${lead.lead_id}`}
                      lead={lead}
                      showActor={canToggle}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fade masks — top and bottom, fixed over the scrolling viewport */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: `linear-gradient(to bottom,
            var(--theme-paper) 0%,
            transparent 10%,
            transparent 90%,
            var(--theme-paper) 100%
          )`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
