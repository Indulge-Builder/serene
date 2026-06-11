"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Send } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

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
          .eia-message-bar-input::placeholder {
            color:   var(--theme-text-tertiary);
            opacity: 1;
          }
        `}</style>

        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "var(--space-2)",
            background:   isNested ? "var(--theme-paper-subtle)" : "var(--theme-paper)",
            border:       isNested ? "none" : "1px solid var(--theme-paper-border)",
            borderRadius: isNested ? "var(--radius-md)" : "var(--radius-lg)",
            padding:      isNested
              ? "var(--space-2) var(--space-3)"
              : "var(--space-2) var(--space-3)",
            boxShadow:    isNested ? "none" : "var(--shadow-2)",
            transition:   "border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)",
          }}
          onFocus={(e) => {
            if (isNested) return;
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--theme-accent)";
            (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-accent-ring)";
          }}
          onBlur={(e) => {
            if (isNested) return;
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow   = "var(--shadow-2)";
            }
          }}
        >
          <textarea
            ref={textareaRef}
            className="eia-message-bar-input"
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

          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="eia-pressable eia-icon-lift-hover"
            style={{
              width:          `${SEND_SIZE}px`,
              height:         `${SEND_SIZE}px`,
              borderRadius:   "var(--radius-sm)",
              border:         "none",
              cursor:         canSend ? "pointer" : "not-allowed",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
              background:     canSend ? "var(--theme-accent)" : "var(--theme-paper-border)",
              transition:     "background var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)",
            }}
          >
            {loading ? (
              <Spinner size="sm" />
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
          </button>
        </div>
      </>
    );
  },
);

MessageBar.displayName = "MessageBar";
