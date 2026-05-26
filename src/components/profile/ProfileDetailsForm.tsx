"use client";

import { useActionState } from "react";
import { updateProfile }  from "@/lib/actions/profiles";
import type { Profile }   from "@/lib/types/database";
import type { ActionResult } from "@/lib/types";

type Props = { profile: Profile };

const initialState: ActionResult<Profile> = { data: null, error: null };

export function ProfileDetailsForm({ profile }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);

  const succeeded = state.data !== null;

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={profile.id} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

        {/* Name + Phone — two columns on wider layouts */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 "var(--space-4)",
          }}
        >
          <Field label="Full Name" htmlFor="pf_full_name" required>
            <input
              id="pf_full_name"
              name="full_name"
              type="text"
              defaultValue={profile.full_name}
              required
              autoComplete="name"
              style={inputStyle}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>

          <Field
            label="Phone Number"
            htmlFor="pf_phone"
            hint="Stored as E.164 — India default."
          >
            <input
              id="pf_phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              style={inputStyle}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>
        </div>

        {/* Job title + Username — two columns */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 "var(--space-4)",
          }}
        >
          <Field label="Job Title" htmlFor="pf_job_title">
            <input
              id="pf_job_title"
              name="job_title"
              type="text"
              defaultValue={profile.job_title ?? ""}
              placeholder="e.g. Senior Concierge Agent"
              style={inputStyle}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>

          <Field
            label="Username"
            htmlFor="pf_username"
            hint="Lowercase, numbers, underscores only."
          >
            <input
              id="pf_username"
              name="username"
              type="text"
              defaultValue={profile.username ?? ""}
              placeholder="e.g. priya_sharma"
              autoComplete="username"
              style={inputStyle}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>
        </div>

        {/* Email — read-only */}
        <Field
          label="Email Address"
          htmlFor="pf_email"
          hint="Email changes require contacting your administrator."
        >
          <input
            id="pf_email"
            type="email"
            value={profile.email}
            readOnly
            aria-readonly="true"
            style={{
              ...inputStyle,
              color:      "var(--theme-text-tertiary)",
              cursor:     "default",
              userSelect: "all",
            }}
          />
        </Field>

        {/* Feedback */}
        {state.error && (
          <div
            role="alert"
            style={{
              padding:      "var(--space-3) var(--space-4)",
              background:   "var(--color-danger-light)",
              border:       "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)",
              borderRadius: "var(--radius-sm)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--color-danger-text)",
            }}
          >
            {state.error}
          </div>
        )}
        {succeeded && (
          <div
            role="status"
            style={{
              padding:      "var(--space-3) var(--space-4)",
              background:   "var(--color-success-light)",
              border:       "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
              borderRadius: "var(--radius-sm)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              color:        "var(--color-success-text)",
            }}
          >
            Profile updated successfully.
          </div>
        )}

        {/* Submit */}
        <div
          style={{
            display:        "flex",
            justifyContent: "flex-end",
            paddingTop:     "var(--space-3)",
            borderTop:      "1px solid var(--theme-paper-border)",
          }}
        >
          <button
            type="submit"
            disabled={isPending}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          "var(--space-2)",
              padding:      "var(--space-2) var(--space-6)",
              background:   isPending ? "var(--theme-accent-muted)" : "var(--theme-accent)",
              color:        "var(--theme-accent-fg)",
              border:       "none",
              borderRadius: "var(--radius-sm)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              fontWeight:   "var(--weight-semibold)",
              letterSpacing:"var(--tracking-wide)",
              cursor:       isPending ? "not-allowed" : "pointer",
              transition:   "var(--transition-interactive)",
              boxShadow:    isPending ? "none" : "var(--shadow-accent-glow)",
            }}
          >
            {isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Field wrapper ────────────────────────────────────────

type FieldProps = {
  label:    string;
  htmlFor:  string;
  required?: boolean;
  hint?:    string;
  children: React.ReactNode;
};

function Field({ label, htmlFor, required, hint, children }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      "var(--text-2xs)",
          fontWeight:    "var(--weight-semibold)",
          letterSpacing: "var(--tracking-widest)",
          textTransform: "uppercase",
          color:         "var(--theme-text-tertiary)",
          display:       "flex",
          gap:           "var(--space-1)",
          alignItems:    "center",
        }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--color-danger)", lineHeight: 1 }}>
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            margin:     0,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        "100%",
  height:       "36px",
  padding:      "0 var(--space-3)",
  background:   "var(--theme-paper-subtle)",
  border:       "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-sm)",
  fontFamily:   "var(--font-sans)",
  fontSize:     "var(--text-sm)",
  color:        "var(--theme-text-primary)",
  outline:      "none",
  boxSizing:    "border-box",
  transition:   "border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)",
};

function focusStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--theme-accent)";
  e.currentTarget.style.boxShadow   = "var(--shadow-focus)";
  e.currentTarget.style.background  = "var(--theme-paper)";
}

function blurStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--theme-paper-border)";
  e.currentTarget.style.boxShadow   = "none";
  e.currentTarget.style.background  = "var(--theme-paper-subtle)";
}
