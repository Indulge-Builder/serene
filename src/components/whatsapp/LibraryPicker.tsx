"use client";

// The Library button in the WhatsApp composer (0252, plan 8d): the approved files, links and ready
// messages, one click to send on the conversation's own number. The list loads on first open.
// Sending from here is an agent's reply, so on the Indulge number it takes the chat over from the
// concierge, as a typed reply does.

import { useMemo, useState, useTransition } from "react";
import { BookOpen, FileText, Film, Image as ImageIcon, Link2, MessageSquareText, Music } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { SearchBar } from "@/components/ui/SearchBar";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { usePortalAnchor } from "@/hooks/usePortalAnchor";
import { toast } from "@/lib/toast";
import { listLibraryItemsAction, sendLibraryItemAction, type LibraryPickerItem } from "@/lib/actions/public-bot";
import type { LucideIcon } from "lucide-react";

const SHAPE_ICON: Record<LibraryPickerItem["shape"], LucideIcon> = {
  image: ImageIcon,
  video: Film,
  document: FileText,
  audio: Music,
  link: Link2,
  message: MessageSquareText,
};

interface LibraryPickerProps {
  conversationId: string;
  disabled?: boolean;
  /** Fired after a send landed (the parent marks the chat as the team's). */
  onSent?: () => void;
}

export function LibraryPicker({ conversationId, disabled, onSent }: LibraryPickerProps) {
  const anchor = usePortalAnchor({ estimatedWidth: 340, estimatedHeight: 380 });
  const [items, setItems] = useState<LibraryPickerItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();

  function open() {
    anchor.toggle();
    if (items === null) {
      startLoad(async () => {
        const r = await listLibraryItemsAction();
        if (r.error || !r.data) toast.danger(r.error ?? "The library could not be loaded.");
        setItems(r.data ?? []);
      });
    }
  }

  const shown = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (items ?? []).filter((i) => !q || `${i.title} ${i.whenToSend ?? ""}`.toLowerCase().includes(q));
  }, [items, search]);

  function send(item: LibraryPickerItem) {
    setSendingId(item.id);
    startSend(async () => {
      const r = await sendLibraryItemAction({ conversationId, assetId: item.id });
      setSendingId(null);
      if (r.error) {
        toast.danger(r.error);
        return;
      }
      toast.success(`Sent: ${item.title}`);
      anchor.close();
      onSent?.();
    });
  }

  return (
    <>
      <Tooltip label="Send from the library" side="top">
        <Button
          ref={anchor.triggerRef}
          variant="ghost"
          iconOnly
          size="sm"
          type="button"
          onClick={open}
          disabled={disabled}
          aria-label="Send from the library"
          aria-expanded={anchor.open}
          className="serene-pressable serene-touch"
          style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <BookOpen style={{ width: "18px", height: "18px", strokeWidth: 1.5 }} />
        </Button>
      </Tooltip>
      <FloatingPanel {...anchor.panelProps} panelKey="library-picker" style={{ width: "min(340px, calc(100vw - 32px))", padding: "var(--space-3)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search the library" size="sm" />
          {loading || items === null ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-4)" }}>
              <LogoSpinner size="sm" />
            </div>
          ) : shown.length === 0 ? (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)", margin: "var(--space-2) 0" }}>
              {items.length === 0 ? "Nothing approved in the library yet." : "Nothing matches."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", maxHeight: "300px", overflowY: "auto" }}>
              {shown.map((item) => {
                const Icon = SHAPE_ICON[item.shape];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => send(item)}
                    disabled={sending}
                    className="serene-pressable"
                    style={{
                      display: "flex", alignItems: "flex-start", gap: "var(--space-3)", textAlign: "left",
                      padding: "var(--space-2)", borderRadius: "var(--radius-md)", border: "none",
                      background: "transparent", cursor: sending ? "wait" : "pointer", width: "100%",
                    }}
                  >
                    <Icon style={{ width: 16, height: 16, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-primary)" }}>
                        {sendingId === item.id ? "Sending…" : item.title}
                      </span>
                      {item.whenToSend && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{item.whenToSend}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </FloatingPanel>
    </>
  );
}
