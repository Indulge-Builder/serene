"use client";

import { useActionState } from "react";
import { ChevronDown } from "lucide-react";
import { updateUserAuthorization } from "@/lib/actions/profiles";
import { USER_ROLES, ROLE_LABELS } from "@/lib/constants/roles";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import type { Profile } from "@/lib/types/database";
import type { ActionResult } from "@/lib/types";

type Props = { user: Profile };

const initialState: ActionResult<Profile> = { data: null, error: null };

export function EditAuthorizationForm({ user }: Props) {
  const [state, formAction, isPending] = useActionState(updateUserAuthorization, initialState);

  const succeeded = state.data !== null;

  return (
    <form action={formAction} style={{ padding: "var(--space-6) var(--space-8)" }}>
      <input type="hidden" name="id" value={user.id} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Role + Domain */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label
              htmlFor="edit_role"
              style={labelStyle}
            >
              Role <span style={{ color: "var(--color-danger)", lineHeight: 1 }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <select
                id="edit_role"
                name="role"
                defaultValue={user.role}
                required
                style={selectStyle}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <ChevronDown style={chevronStyle} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label
              htmlFor="edit_domain"
              style={labelStyle}
            >
              Domain <span style={{ color: "var(--color-danger)", lineHeight: 1 }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <select
                id="edit_domain"
                name="domain"
                defaultValue={user.domain}
                required
                style={selectStyle}
              >
                {APP_DOMAINS.map((d) => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </select>
              <ChevronDown style={chevronStyle} />
            </div>
          </div>
        </div>

        {/* Warning note */}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--color-warning-text)",
            background: "var(--color-warning-light)",
            border:     "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)",
            borderRadius: "var(--radius-sm)",
            padding:    "var(--space-3) var(--space-4)",
            margin:     0,
          }}
        >
          Changing role or domain immediately affects what this person can see and do. All changes are audited.
        </p>

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
            Authorization updated.
          </div>
        )}

        {/* Actions */}
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
              padding:      "var(--space-2) var(--space-6)",
              background:   isPending ? "var(--theme-accent-muted)" : "var(--theme-accent)",
              color:        "var(--theme-accent-fg)",
              border:       "none",
              borderRadius: "var(--radius-sm)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              fontWeight:   "var(--weight-semibold)",
              cursor:       isPending ? "not-allowed" : "pointer",
              transition:   "var(--transition-interactive)",
            }}
          >
            {isPending ? "Saving…" : "Update Authorization"}
          </button>
        </div>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily:    "var(--font-sans)",
  fontSize:      "var(--text-2xs)",
  fontWeight:    "var(--weight-semibold)",
  color:         "var(--theme-text-tertiary)",
  letterSpacing: "var(--tracking-widest)",
  textTransform: "uppercase",
  display:       "flex",
  gap:           "var(--space-1)",
};

const selectStyle: React.CSSProperties = {
  width:            "100%",
  padding:          "var(--space-2) var(--space-3)",
  paddingRight:     "var(--space-8)",
  background:       "var(--theme-paper-subtle)",
  border:           "1px solid var(--theme-paper-border)",
  borderRadius:     "var(--radius-sm)",
  fontFamily:       "var(--font-sans)",
  fontSize:         "var(--text-sm)",
  color:            "var(--theme-text-primary)",
  cursor:           "pointer",
  outline:          "none",
  appearance:       "none",
  WebkitAppearance: "none",
  boxSizing:        "border-box",
};

const chevronStyle: React.CSSProperties = {
  position:      "absolute",
  right:         "var(--space-3)",
  top:           "50%",
  transform:     "translateY(-50%)",
  width:         "12px",
  height:        "12px",
  strokeWidth:   1.5,
  color:         "var(--theme-text-tertiary)",
  pointerEvents: "none",
};
