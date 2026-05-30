"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/profiles";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/lib/types/database";
import type { ActionResult } from "@/lib/types";

type Props = { user: Profile };

const initialState: ActionResult<Profile> = { data: null, error: null };

export function EditProfileForm({ user }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);

  const succeeded = state.data !== null;

  return (
    <form action={formAction}>
      {/* Hidden user id */}
      <input type="hidden" name="id" value={user.id} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Full name */}
        <Field label="Full Name" htmlFor="edit_full_name" required>
          <input
            id="edit_full_name"
            name="full_name"
            type="text"
            defaultValue={user.full_name}
            required
            style={inputStyle}
          />
        </Field>

        {/* Job title */}
        <Field label="Job Title" htmlFor="edit_job_title">
          <input
            id="edit_job_title"
            name="job_title"
            type="text"
            defaultValue={user.job_title ?? ""}
            placeholder="e.g. Senior Concierge Agent"
            style={inputStyle}
          />
        </Field>

        {/* Phone */}
        <Field label="Phone Number" htmlFor="edit_phone" hint="Stored in E.164 format (India default).">
          <input
            id="edit_phone"
            name="phone"
            type="tel"
            defaultValue={user.phone ?? ""}
            placeholder="+91 98765 43210"
            style={inputStyle}
          />
        </Field>

        {/* Username */}
        <Field label="Username" htmlFor="edit_username" hint="Lowercase letters, numbers, and underscores only.">
          <input
            id="edit_username"
            name="username"
            type="text"
            defaultValue={user.username ?? ""}
            placeholder="e.g. priya_sharma"
            style={inputStyle}
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

        {/* Actions */}
        <div
          style={{
            display:        "flex",
            justifyContent: "flex-end",
            paddingTop:     "var(--space-2)",
          }}
        >
          <Button variant="primary" type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

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
          color:         "var(--theme-text-tertiary)",
          letterSpacing: "var(--tracking-widest)",
          textTransform: "uppercase",
          display:       "flex",
          gap:           "var(--space-1)",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--color-danger)", lineHeight: 1 }}>*</span>
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

const inputStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "var(--space-2) var(--space-3)",
  background:   "var(--theme-paper-subtle)",
  border:       "1px solid var(--theme-paper-border)",
  borderRadius: "var(--radius-sm)",
  fontFamily:   "var(--font-sans)",
  fontSize:     "var(--text-sm)",
  color:        "var(--theme-text-primary)",
  outline:      "none",
  boxSizing:    "border-box",
};
