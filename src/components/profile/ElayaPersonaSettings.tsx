"use client";

// Per-user Elaya persona settings (Jarvis Phase 2) — "how Elaya talks to me".
// STYLE ONLY: these prefs are injected into Elaya's prompt as guidance and can
// never change what the user may see or do (the Golden Rule — permissions are code).
// Unlike ThemeSelector (instant-apply), this batches into one Save (the prefs only
// take effect on the user's next Elaya message, so there's nothing live to preview).

import { useState, useTransition } from "react";
import { updateElayaPersonaAction } from "@/lib/actions/elaya";
import { useToast } from "@/hooks/useToast";
import {
  ELAYA_LANGUAGE_OPTIONS,
  ELAYA_TONE_OPTIONS,
  ELAYA_DEPTH_OPTIONS,
  ELAYA_LENGTH_OPTIONS,
  ELAYA_PERSONA_DEFAULTS,
  ELAYA_PERSONA_NOTE_MAX,
  type ElayaPersonaPrefs,
  type ElayaLanguagePref,
  type ElayaTonePref,
  type ElayaDepthPref,
  type ElayaLengthPref,
} from "@/lib/constants/elaya-persona";

type Props = { initialPersona: ElayaPersonaPrefs };

export function ElayaPersonaSettings({ initialPersona }: Props) {
  const toast = useToast;
  const [isPending, startTransition] = useTransition();

  const [language, setLanguage] = useState<ElayaLanguagePref>(
    initialPersona.language ?? ELAYA_PERSONA_DEFAULTS.language,
  );
  const [tone, setTone] = useState<ElayaTonePref>(
    initialPersona.tone ?? ELAYA_PERSONA_DEFAULTS.tone,
  );
  const [depth, setDepth] = useState<ElayaDepthPref>(
    initialPersona.depth ?? ELAYA_PERSONA_DEFAULTS.depth,
  );
  const [length, setLength] = useState<ElayaLengthPref>(
    initialPersona.length ?? ELAYA_PERSONA_DEFAULTS.length,
  );
  const [note, setNote] = useState<string>(initialPersona.note ?? "");

  function handleSave() {
    startTransition(async () => {
      const res = await updateElayaPersonaAction({ language, tone, depth, length, note });
      if (res.error) {
        toast.danger(res.error);
      } else {
        toast.success("Elaya will remember how you like to talk.");
      }
    });
  }

  return (
    <div>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--theme-text-secondary)",
          margin: "0 0 var(--space-5)",
        }}
      >
        Tune how Elaya speaks to you. These are style preferences only — they don’t
        change what you can see or do. They apply from your next message.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <ChipField
          label="Language"
          options={ELAYA_LANGUAGE_OPTIONS}
          value={language}
          onChange={setLanguage}
          disabled={isPending}
        />
        <ChipField
          label="Tone"
          options={ELAYA_TONE_OPTIONS}
          value={tone}
          onChange={setTone}
          disabled={isPending}
        />
        <ChipField
          label="Detail"
          options={ELAYA_DEPTH_OPTIONS}
          value={depth}
          onChange={setDepth}
          disabled={isPending}
        />
        <ChipField
          label="Reply length"
          options={ELAYA_LENGTH_OPTIONS}
          value={length}
          onChange={setLength}
          disabled={isPending}
        />

        {/* Free-text note */}
        <div>
          <label
            className="label-micro"
            htmlFor="elaya-persona-note"
            style={{ display: "block", marginBottom: "var(--space-2)" }}
          >
            Anything else Elaya should know
          </label>
          <textarea
            id="elaya-persona-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, ELAYA_PERSONA_NOTE_MAX))}
            disabled={isPending}
            rows={3}
            placeholder="e.g. I own the GMR account — flag GMR leads going cold. Call me Sam."
            className="serene-input"
            style={{
              width: "100%",
              resize: "vertical",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--theme-paper-border)",
              background: "var(--theme-paper)",
              color: "var(--theme-text-primary)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              lineHeight: 1.5,
            }}
          />
          <div
            style={{
              marginTop: "var(--space-1)",
              textAlign: "right",
              fontSize: "var(--text-2xs)",
              color: "var(--theme-text-tertiary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {note.length} / {ELAYA_PERSONA_NOTE_MAX}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-5)", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="serene-btn-primary serene-pressable"
          style={{
            padding: "var(--space-2) var(--space-5)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            cursor: isPending ? "wait" : "pointer",
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

// ── A labelled row of single-select chips. Generic over the option id type. ──
function ChipField<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <span className="label-micro" style={{ display: "block", marginBottom: "var(--space-2)" }}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}
      >
        {options.map((opt) => {
          const isActive = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(opt.id)}
              disabled={disabled}
              className="serene-pressable"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${isActive ? "var(--theme-accent)" : "var(--theme-paper-border)"}`,
                background: isActive ? "var(--theme-accent-surface)" : "var(--theme-paper)",
                color: isActive ? "var(--theme-accent)" : "var(--theme-text-secondary)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                fontWeight: isActive ? "var(--weight-medium)" : "var(--weight-normal)",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "border-color var(--duration-fast) var(--ease-in-out), background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
