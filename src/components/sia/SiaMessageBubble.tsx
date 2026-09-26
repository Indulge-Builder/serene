"use client";

// One Sia message — the WhatsApp-Web reading, in Serene's own material. The
// bubble surfaces are the whatsapp/MessageBubble pair (inbound
// --neu-surface-high, outbound --neu-chat-user-bg) with --neu-shadow-chip;
// NO hairline border here (design pass 2026-08-29 — the --neu-edge line read
// harsh on the wallpaper; the chip shadow alone lifts the bubble).
// Display-only (A-06).
//
// Anatomy: day separators (centred chip) → sender clusters (avatar + coloured
// name on the first bubble of a run) → bubble with optional quote strip, media,
// text, footer time/markers → floating reaction chips on the bubble corner.

import { m as motion } from "framer-motion";
import { Ban, Forward, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils/dates";
import { SPRING_CONFIG, FAST_DURATION, EASE_IN_OUT } from "@/lib/constants/motion";
import { renderWaText } from "@/components/ui/WaText";
import { SiaMediaAttachment } from "./SiaMedia";
import { formatSystemText, senderInk, senderLabel, TYPE_PREVIEW } from "./sia-shared";
import type { SiaMessageRow } from "@/lib/services/sia-service";

export function SiaDaySeparator({ ts }: { ts: string }) {
  return (
    <div className="flex justify-center my-4">
      <span
        className="type-caption rounded-full"
        style={{
          padding: "3px 12px",
          background: "var(--neu-surface-high)",
          border: "1px solid var(--neu-edge)",
          boxShadow: "var(--neu-shadow-chip)",
          color: "var(--theme-text-secondary)",
          fontWeight: "var(--weight-medium)",
        }}
      >
        {formatDate(ts, "EEEE, d MMM yyyy")}
      </span>
    </div>
  );
}

function SystemRow({ m }: { m: SiaMessageRow }) {
  return (
    <div className="flex justify-center my-2">
      <span
        className="type-caption rounded-full text-center"
        style={{
          padding: "2px 12px",
          maxWidth: "80%",
          background: "var(--neu-well)",
          color: "var(--theme-text-tertiary)",
          fontStyle: m.type === "undecrypted" ? "italic" : undefined,
        }}
      >
        {m.type === "undecrypted"
          ? "Waiting for this message — it couldn't be decoded yet"
          : formatSystemText(m.text)}
      </span>
    </div>
  );
}

function QuoteStrip({
  m,
  onJumpToQuoted,
}: {
  m: SiaMessageRow;
  onJumpToQuoted?: (waMessageId: string) => void;
}) {
  if (!m.quoted && !m.quoted_wa_message_id) return null;
  const q = m.quoted;
  const label = q?.sender_name ?? "Original message";
  const preview =
    q?.text?.trim() ||
    (q ? (TYPE_PREVIEW[q.type]?.label ?? q.type) : "Not captured");
  const jumpable = !!m.quoted_wa_message_id && !!onJumpToQuoted;
  return (
    <Tooltip label="Go to the original message" side="top" wrap="block" disabled={!jumpable}>
    <button
      type="button"
      disabled={!jumpable}
      onClick={() => jumpable && onJumpToQuoted!(m.quoted_wa_message_id!)}
      className="block w-full text-left rounded-(--radius-xs) px-2.5 py-1.5 mb-1.5 border-0"
      style={{ background: "var(--neu-well)", cursor: jumpable ? "pointer" : "default" }}
    >
      <div
        className="type-caption truncate"
        style={{ color: senderInk(label), fontWeight: "var(--weight-medium)" }}
      >
        {label}
      </div>
      <div className="type-caption truncate" style={{ color: "var(--theme-text-tertiary)" }}>
        {preview}
      </div>
      {jumpable && <span className="sr-only">Go to the original message</span>}
    </button>
    </Tooltip>
  );
}

function ReactionChips({ m, fromMe }: { m: SiaMessageRow; fromMe: boolean }) {
  if (m.reactions.length === 0) return null;
  return (
    <div
      className="absolute flex gap-1"
      style={{ bottom: "-10px", [fromMe ? "right" : "left"]: "10px" } as React.CSSProperties}
    >
      {m.reactions.slice(0, 4).map((r) => (
        <motion.span
          key={r.emoji}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING_CONFIG}
          className="rounded-full inline-flex items-center gap-0.5"
          style={{
            padding: "1px 6px",
            fontSize: "11px",
            lineHeight: "16px",
            background: "var(--neu-surface-high)",
            border: "1px solid var(--neu-edge)",
            boxShadow: "var(--neu-shadow-chip)",
          }}
        >
          {r.emoji}
          {r.count > 1 && (
            <span
              className="tabular-nums"
              style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--theme-text-tertiary)" }}
            >
              {r.count}
            </span>
          )}
        </motion.span>
      ))}
    </div>
  );
}

export function SiaMessageBubble({
  m,
  prev,
  chatJid,
  entrance = false,
  flash = false,
  onJumpToQuoted,
}: {
  m: SiaMessageRow;
  prev?: SiaMessageRow;
  chatJid: string;
  /** true only for messages appended live after mount — history renders static. */
  entrance?: boolean;
  /** brief accent ring after a reply-strip jump lands here */
  flash?: boolean;
  onJumpToQuoted?: (waMessageId: string) => void;
}) {
  if (m.type === "system" || m.type === "undecrypted") return <SystemRow m={m} />;

  const fromMe = m.from_me;
  const label = senderLabel(m);
  const clusterStart =
    !prev ||
    prev.type === "system" ||
    prev.sender_jid !== m.sender_jid ||
    prev.from_me !== m.from_me ||
    new Date(m.wa_timestamp).getTime() - new Date(prev.wa_timestamp).getTime() > 5 * 60 * 1000;

  const isBareSticker = m.type === "sticker" && m.media?.download_status === "done" && !m.is_revoked;
  const hasReactions = m.reactions.length > 0;

  return (
    <motion.div
      initial={entrance ? { opacity: 0, y: 14, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_CONFIG, opacity: { duration: FAST_DURATION, ease: EASE_IN_OUT } }}
      className="flex gap-2"
      style={{
        justifyContent: fromMe ? "flex-end" : "flex-start",
        // Cluster rhythm: related messages read as a run, but each bubble still
        // breathes (was 10/2 — too dense, design pass 2026-08-29).
        marginTop: clusterStart ? "14px" : "6px",
        marginBottom: hasReactions ? "12px" : 0,
      }}
    >
      {/* Avatar rail (inbound only; blank spacer keeps cluster alignment) */}
      {!fromMe && (
        <div className="w-7 shrink-0 self-end">
          {clusterStart && <Avatar name={label} size="xs" style={{ width: 28, height: 28 }} />}
        </div>
      )}

      {isBareSticker ? (
        /* Stickers render bare — no bubble chrome, WhatsApp-style */
        <div className="relative" style={{ maxWidth: "72%" }}>
          {clusterStart && !fromMe && (
            <div
              className="type-caption mb-0.5"
              style={{ color: senderInk(label), fontWeight: "var(--weight-medium)" }}
            >
              {label}
            </div>
          )}
          <SiaMediaAttachment chatJid={chatJid} waMessageId={m.wa_message_id} senderJid={m.sender_jid} media={m.media!} />
          <div
            className="tabular-nums mt-0.5"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--theme-text-tertiary)",
              textAlign: fromMe ? "right" : "left",
            }}
          >
            {formatDate(m.wa_timestamp, "h:mm a")}
          </div>
          <ReactionChips m={m} fromMe={fromMe} />
        </div>
      ) : (
        <div
          className="relative"
          style={{
            maxWidth: "72%",
            // One bubble spec across Sia, WhatsApp and Elaya (mobile audit
            // 2026-09-26): 20/6 radius, space-3/space-4 padding.
            padding: "var(--space-3) var(--space-4)",
            borderRadius: fromMe ? "20px 20px 6px 20px" : clusterStart ? "6px 20px 20px 20px" : "20px",
            background: fromMe ? "var(--neu-chat-user-bg)" : "var(--neu-surface-high)",
            // No hairline — the chip shadow alone lifts the bubble off the
            // wallpaper (the --neu-edge border read harsh; design pass 2026-08-29).
            boxShadow: flash
              ? "var(--neu-shadow-chip), 0 0 0 2px var(--theme-accent)"
              : "var(--neu-shadow-chip)",
            transition: "box-shadow 600ms var(--ease-in-out)",
          }}
        >
          {/* Sender name — first bubble of an inbound cluster */}
          {clusterStart && !fromMe && (
            <div
              className="type-caption mb-0.5"
              style={{ color: senderInk(label), fontWeight: "var(--weight-medium)" }}
            >
              {label}
            </div>
          )}

          {m.is_forwarded && !m.is_revoked && (
            <div
              className="type-caption inline-flex items-center gap-1 mb-0.5"
              style={{ color: "var(--theme-text-tertiary)", fontStyle: "italic" }}
            >
              <Forward className="w-3 h-3" strokeWidth={1.5} /> Forwarded
            </div>
          )}

          {m.is_revoked ? (
            <div
              className="inline-flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "var(--text-sm)",
                color: "var(--theme-text-tertiary)",
              }}
            >
              <Ban className="w-3.5 h-3.5" strokeWidth={1.5} />
              This message was deleted
            </div>
          ) : (
            <>
              <QuoteStrip m={m} onJumpToQuoted={onJumpToQuoted} />

              {m.media && (
                <div className={m.text ? "mb-1.5" : ""}>
                  <SiaMediaAttachment
                    chatJid={chatJid}
                    waMessageId={m.wa_message_id}
                    senderJid={m.sender_jid}
                    media={m.media}
                  />
                </div>
              )}

              {!m.media && m.type !== "text" && !m.text && (
                <span
                  className="type-caption rounded-(--radius-xs) inline-block px-2 py-0.5"
                  style={{ background: "var(--neu-well)", color: "var(--theme-text-secondary)" }}
                >
                  {TYPE_PREVIEW[m.type]?.label ?? m.type}
                </span>
              )}

              {m.text && (
                <p
                  className="m-0"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    color: "var(--theme-text-primary)",
                    lineHeight: "var(--leading-relaxed)",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {renderWaText(m.text)}
                </p>
              )}
            </>
          )}

          {/* Footer: markers + time */}
          <div className="flex items-center justify-end gap-1.5" style={{ marginTop: "2px" }}>
            {m.edit_of_wa_message_id && (
              <span
                className="type-caption inline-flex items-center gap-0.5"
                style={{ color: "var(--theme-text-tertiary)", fontSize: "10px" }}
              >
                <Pencil className="w-2.5 h-2.5" strokeWidth={1.5} /> edited
              </span>
            )}
            <span
              className="tabular-nums"
              style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--theme-text-tertiary)" }}
            >
              {formatDate(m.wa_timestamp, "h:mm a")}
            </span>
          </div>

          <ReactionChips m={m} fromMe={fromMe} />
        </div>
      )}
    </motion.div>
  );
}
