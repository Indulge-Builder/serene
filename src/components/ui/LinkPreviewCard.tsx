// LinkPreviewCard — THE link preview inside a chat bubble (2026-10-01), the way WhatsApp shows it:
// the sender's thumbnail, the page title, one or two lines of description, the site. Display-only;
// the data comes from readLinkPreview (lib/utils/link-preview.ts), never from a fetch. Composed by
// SiaMessageBubble and the WhatsApp MessageBubble (which the Hands chat renders through).

import type { LinkPreview } from "@/lib/utils/link-preview";

export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex gap-2.5 items-stretch no-underline mb-1.5"
      style={{
        padding: "var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: "var(--neu-well)",
        color: "inherit",
        minWidth: 0,
      }}
    >
      {preview.thumbnail && (
        // A data: url from the message; nothing for next/image to optimise.
        <img
          src={preview.thumbnail}
          alt=""
          width={56}
          height={56}
          className="shrink-0 object-cover"
          style={{ width: 56, height: 56, borderRadius: "var(--radius-xs)" }}
        />
      )}
      <span className="flex flex-col min-w-0" style={{ gap: 2 }}>
        <span
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--theme-text-primary)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          {preview.title}
        </span>
        {preview.description && (
          <span className="type-caption line-clamp-2" style={{ color: "var(--theme-text-secondary)" }}>
            {preview.description}
          </span>
        )}
        <span className="type-caption truncate" style={{ color: "var(--theme-text-tertiary)" }}>
          {preview.domain}
        </span>
      </span>
    </a>
  );
}
