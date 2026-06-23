"use client";

import { Check, CheckCheck, X, FileText, ImageIcon, Video, Mic } from "lucide-react";
import { m as motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelativeTime } from "@/lib/utils/dates";
import { EASE_OUT_EXPO } from "@/lib/constants/motion";
import type { WhatsAppMessage } from "@/lib/types/whatsapp";

interface MessageBubbleProps {
  message: WhatsAppMessage;
  isOptimistic?: boolean;
  /** Animate arrival — pass true only for messages appended after mount;
   *  the initial thread renders static (design-dna §6.4 elayaMessageArrive). */
  entrance?: boolean;
}

function DeliveryIcon({ status }: { status: WhatsAppMessage["status"] }) {
  if (!status) return null;
  if (status === "failed") {
    return (
      <X
        style={{
          width:       "11px",
          height:      "11px",
          strokeWidth: 2,
          color:       "var(--color-danger-text)",
        }}
      />
    );
  }
  if (status === "read") {
    return (
      <CheckCheck
        style={{
          width:       "13px",
          height:      "13px",
          strokeWidth: 2,
          color:       "var(--theme-accent)",
        }}
      />
    );
  }
  if (status === "delivered") {
    return (
      <CheckCheck
        style={{
          width:       "13px",
          height:      "13px",
          strokeWidth: 2,
          color:       "var(--theme-text-tertiary)",
        }}
      />
    );
  }
  return (
    <Check
      style={{
        width:       "13px",
        height:      "13px",
        strokeWidth: 2,
        color:       "var(--theme-text-tertiary)",
      }}
    />
  );
}

function MediaPlaceholder({ message }: { message: WhatsAppMessage }) {
  const icons: Record<string, React.ElementType> = {
    image:    ImageIcon,
    video:    Video,
    document: FileText,
    audio:    Mic,
  };
  const Icon = icons[message.message_type] ?? FileText;
  const labels: Record<string, string> = {
    image:    "Image",
    video:    "Video",
    document: "Document",
    audio:    "Audio",
  };
  const label = labels[message.message_type] ?? "Media";
  // Media messages may carry a caption — stored in content (insertInboundMessage
  // writes the WhatsApp caption there). Show it under the media chip.
  const caption = (message.content ?? "").trim();
  const url     = message.media_url;

  // Inline preview for image/video when a url is present; everything else (and a
  // url-less media row) falls back to the labelled chip below.
  const inlinePreview =
    url && message.message_type === "image" ? (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption || "Image"}
          loading="lazy"
          style={{
            display:      "block",
            maxWidth:     "240px",
            maxHeight:    "240px",
            width:        "auto",
            height:       "auto",
            borderRadius: "var(--radius-sm)",
            objectFit:    "cover",
          }}
        />
      </a>
    ) : url && message.message_type === "video" ? (
      <video
        src={url}
        controls
        preload="metadata"
        style={{
          display:      "block",
          maxWidth:     "240px",
          maxHeight:    "240px",
          borderRadius: "var(--radius-sm)",
        }}
      />
    ) : null;

  if (inlinePreview) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {inlinePreview}
        {caption && (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-primary)",
              margin:     0,
              lineHeight: "var(--leading-relaxed)",
              wordBreak:  "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        gap:            "var(--space-2)",
      }}
    >
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "var(--space-2)",
          padding:      "var(--space-3)",
          background:   "var(--theme-paper-border)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <Icon
          style={{
            width:       "18px",
            height:      "18px",
            strokeWidth: 1.5,
            flexShrink:  0,
            color:       "var(--theme-text-secondary)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-secondary)",
          }}
        >
          {label}
        </span>
        {message.media_url && (
          <a
            href={message.media_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-xs)",
              color:          "var(--theme-accent)",
              textDecoration: "none",
              marginLeft:     "auto",
            }}
          >
            View
          </a>
        )}
      </div>
      {caption && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-sm)",
            color:      "var(--theme-text-primary)",
            margin:     0,
            lineHeight: "var(--leading-relaxed)",
            wordBreak:  "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

export function MessageBubble({ message, isOptimistic = false, entrance = false }: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const isMedia    = ["image", "video", "document", "audio"].includes(message.message_type);
  const senderName = message.sender_name ?? (isOutbound ? "You" : "Lead");
  // A text message with no body is an un-renderable type (sticker, location,
  // reaction, or a payload shape we didn't parse) that was stored as text with
  // an empty content. Show a muted placeholder rather than a blank bubble.
  const hasText        = (message.content ?? "").trim().length > 0;
  const isUnsupported  = !isMedia && !hasText;

  return (
    <motion.div
      initial={entrance ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: isOptimistic ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     isOutbound ? "flex-end" : "flex-start",
      }}
    >
      {/* Inbound sender row: avatar + name */}
      {!isOutbound && (
        <div
          style={{
            display:     "flex",
            alignItems:  "center",
            gap:         "var(--space-2)",
            marginBottom: "var(--space-1)",
          }}
        >
          <Avatar
            src={message.sender_avatar_url ?? null}
            name={senderName}
            size="xs"
          />
          <span
            style={{
              fontFamily:  "var(--font-sans)",
              fontSize:    "var(--text-xs)",
              fontWeight:  "var(--weight-medium)",
              color:       "var(--theme-text-secondary)",
            }}
          >
            {senderName}
          </span>
        </div>
      )}

      {/* Bot label for outbound bot messages */}
      {message.is_bot && isOutbound && (
        <span
          style={{
            fontFamily:   "var(--font-sans)",
            fontSize:     "var(--text-2xs)",
            color:        "var(--theme-accent)",
            fontWeight:   "var(--weight-medium)",
            marginBottom: "var(--space-1)",
            paddingRight: "var(--space-1)",
          }}
        >
          Elaya
        </span>
      )}

      {/* Bubble */}
      <div
        style={{
          maxWidth:     "72%",
          padding:      "var(--space-3) var(--space-4)",
          borderRadius: isOutbound
            ? "var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)"
            : "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)",
          background:   isOutbound
            ? "var(--theme-accent-surface)"
            : "var(--theme-paper)",
          border:       isOutbound
            ? "1px solid color-mix(in srgb, var(--theme-accent) 25%, transparent)"
            : "1px solid var(--theme-paper-border)",
          boxShadow:    "var(--shadow-1)",
        }}
      >
        {isMedia ? (
          <MediaPlaceholder message={message} />
        ) : isUnsupported ? (
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-tertiary)",
              margin:     0,
              lineHeight: "var(--leading-relaxed)",
            }}
          >
            Unsupported message
          </p>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-primary)",
              margin:     0,
              lineHeight: "var(--leading-relaxed)",
              wordBreak:  "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {message.content ?? ""}
          </p>
        )}

        {/* Footer: timestamp + delivery status */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "flex-end",
            gap:            "var(--space-1)",
            marginTop:      "var(--space-1)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   "10px",
              color:      "var(--theme-text-tertiary)",
            }}
          >
            {formatRelativeTime(message.created_at)}
          </span>
          {isOutbound && <DeliveryIcon status={message.status} />}
        </div>
      </div>
    </motion.div>
  );
}

MessageBubble.displayName = "MessageBubble";
