"use client";

import { Button } from '@/components/ui/Button';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Send } from "lucide-react";
import { SeedMandala } from "./SeedMandala";

const SEND_SIZE    = 32;
const LINE_HEIGHT  = 20;
const TEXT_PAD_Y   = (SEND_SIZE - LINE_HEIGHT) / 2;
const ICON_SIZE    = 16;

export interface MessageBarProps {
  value:        string;
  onChange:     (value: string) => void;
  onSend:       () => void;
  placeholder?: string;
  disabled?:    boolean;
  loading?:     boolean;
  maxLength?:   number;
  maxHeight?:   number;
  onKeyDown?:   (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** `default` — standalone composer (WhatsApp page). `nested` — inset inside a card. */
  variant?:     "default" | "nested";
  /** Optional control rendered before the textarea (e.g. a dictation mic). Additive — consumers that omit it are unchanged. */
  leadingSlot?: React.ReactNode;
}

export const MessageBar = forwardRef<HTMLTextAreaElement, MessageBarProps>(
  function MessageBar(
    {
      value,
      onChange,
      onSend,
      placeholder = "Type a message…",
      disabled = false,
      loading = false,
      maxLength,
      maxHeight = 96,
      onKeyDown,
      variant = "default",
      leadingSlot,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

    const canSend = value.trim().length > 0 && !disabled && !loading;
    const isNested = variant === "nested";

    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [value, maxHeight]);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const next = e.target.value;
      if (maxLength !== undefined && next.length > maxLength) return;
      onChange(next);
    }

    return (
      <>
        <style>{`
          .serene-message-bar-input::placeholder {
            color:   var(--theme-text-tertiary);
            opacity: 1;
          }
        `}</style>

        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "var(--space-2)",
            // Inputs FLOAT (soft-UI rule 3): gradient sheen + paired input
            // shadow — never a sunken paper-subtle well.
            background:   "var(--neu-input-bg)",
            border:       "1px solid var(--neu-input-edge)",
            borderRadius: isNested ? "var(--radius-md)" : "var(--radius-lg)",
            padding:      isNested
              ? "var(--space-2) var(--space-3)"
              : "var(--space-2) var(--space-3)",
            boxShadow:    "var(--neu-shadow-input)",
            transition:   "border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)",
          }}
          onFocus={(e) => {
            if (isNested) return;
            // The field focus frame (serene-neumorphic-tokens.css, .neu-input).
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--neu-focus-edge)";
            (e.currentTarget as HTMLDivElement).style.boxShadow   = "0 0 0 1px var(--neu-focus-edge), var(--neu-shadow-input)";
          }}
          onBlur={(e) => {
            if (isNested) return;
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--neu-shadow-input)";
            }
          }}
        >
          {leadingSlot}

          <textarea
            ref={textareaRef}
            className="serene-message-bar-input"
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            aria-label={placeholder}
            style={{
              flex:         1,
              border:       "none",
              outline:      "none",
              background:   "transparent",
              resize:       "none",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--theme-text-primary)",
              lineHeight:   `${LINE_HEIGHT}px`,
              minHeight:    `${LINE_HEIGHT}px`,
              maxHeight:    `${maxHeight}px`,
              overflowY:    "auto",
              caretColor:   "var(--theme-accent)",
              padding:      `${TEXT_PAD_Y}px 0`,
              margin:       0,
              boxSizing:    "border-box",
            }}
          />

          <Button
            variant="primary" iconOnly
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="serene-pressable serene-icon-lift-hover"
            style={{
              width:          `${SEND_SIZE}px`,
              height:         `${SEND_SIZE}px`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
          >
            {loading ? (
              <SeedMandala
                size={16}
                variant="currentColor"
                spin={3.5}
                style={{ color: canSend ? "var(--theme-accent-fg)" : "var(--theme-text-tertiary)" }}
              />
            ) : (
              <Send
                style={{
                  width:       `${ICON_SIZE}px`,
                  height:      `${ICON_SIZE}px`,
                  strokeWidth: 1.5,
                  color:       canSend ? "var(--theme-accent-fg)" : "var(--theme-text-tertiary)",
                }}
              />
            )}
          </Button>
        </div>
      </>
    );
  },
);

MessageBar.displayName = "MessageBar";
