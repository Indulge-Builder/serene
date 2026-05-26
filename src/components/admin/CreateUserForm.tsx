"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createUser, inviteUser } from "@/lib/actions/profiles";
import { USER_ROLES, ROLE_LABELS } from "@/lib/constants/roles";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult<{ id: string }> = { data: null, error: null };

export function CreateUserForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "invite">("password");

  const [createState, createAction, createPending] = useActionState(createUser,  initialState);
  const [inviteState, inviteAction, invitePending] = useActionState(inviteUser, initialState);

  const state   = mode === "password" ? createState : inviteState;
  const isPending = mode === "password" ? createPending : invitePending;

  useEffect(() => {
    if (createState.data || inviteState.data) {
      router.push("/admin/users");
    }
  }, [createState.data, inviteState.data, router]);

  return (
    <div>
      {/* Mode switcher */}
      <div
        style={{
          display:      "flex",
          gap:          "2px",
          padding:      "var(--space-5) var(--space-8) 0",
        }}
      >
        {(["password", "invite"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              padding:      "var(--space-2) var(--space-4)",
              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              border:       "1px solid var(--theme-paper-border)",
              borderBottom: mode === m ? "1px solid var(--theme-paper)" : "1px solid var(--theme-paper-border)",
              background:   mode === m ? "var(--theme-paper)" : "var(--theme-paper-subtle)",
              fontFamily:   "var(--font-sans)",
              fontSize:     "var(--text-sm)",
              fontWeight:   mode === m ? "var(--weight-semibold)" : "var(--weight-normal)",
              color:        mode === m ? "var(--theme-text-primary)" : "var(--theme-text-secondary)",
              cursor:       "pointer",
              marginBottom: mode === m ? "-1px" : "0",
              position:     "relative",
              zIndex:       mode === m ? "var(--z-raised)" : "var(--z-base)",
              transition:   "var(--transition-interactive)",
            }}
          >
            {m === "password" ? "Set password" : "Send invite link"}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form action={createAction} style={formStyle}>
          <PasswordFields />
          <FormFooter state={state} isPending={isPending} />
        </form>
      ) : (
        <form action={inviteAction} style={formStyle}>
          <InviteFields />
          <div
            style={{
              padding:      "var(--space-3) var(--space-4)",
              background:   "var(--color-info-light)",
              border:       "1px solid color-mix(in srgb, var(--color-info) 25%, transparent)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-xs)",
                color:      "var(--color-info-text)",
                margin:     0,
              }}
            >
              A magic link will be sent to their email. They can set their own password when they sign in for the first time.
            </p>
          </div>
          <FormFooter
            state={state}
            isPending={isPending}
            submitLabel="Send Invite"
            pendingLabel="Sending…"
          />
        </form>
      )}
    </div>
  );
}

// ─── Shared field sets ─────────────────────────────────────

function CommonFields() {
  return (
    <>
      <Field label="Full Name" htmlFor="full_name" required>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder="e.g. Priya Sharma"
          style={inputStyle}
        />
      </Field>

      <Field label="Email Address" htmlFor="email" required>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="priya@indulgeglobal.com"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
        <Field label="Role" htmlFor="role" required>
          <div style={{ position: "relative" }}>
            <select id="role" name="role" required style={selectStyle} defaultValue="agent">
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <ChevronDown style={chevronStyle} />
          </div>
        </Field>

        <Field label="Domain" htmlFor="domain" required>
          <div style={{ position: "relative" }}>
            <select id="domain" name="domain" required style={selectStyle} defaultValue="concierge">
              {APP_DOMAINS.map((d) => (
                <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
              ))}
            </select>
            <ChevronDown style={chevronStyle} />
          </div>
        </Field>
      </div>

      <Field label="Job Title" htmlFor="job_title">
        <input
          id="job_title"
          name="job_title"
          type="text"
          placeholder="e.g. Senior Concierge Agent"
          style={inputStyle}
        />
      </Field>
    </>
  );
}

function PasswordFields() {
  return (
    <>
      <CommonFields />
      <Field
        label="Temporary Password"
        htmlFor="password"
        required
        hint="Minimum 8 characters. User can change after login."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          style={inputStyle}
        />
      </Field>
      <Field
        label="Phone Number"
        htmlFor="phone"
        hint="Stored in E.164 format (India default)."
      >
        <input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+91 98765 43210"
          style={inputStyle}
        />
      </Field>
    </>
  );
}

function InviteFields() {
  return <CommonFields />;
}

// ─── Footer with error/submit ──────────────────────────────

type FooterProps = {
  state:        ActionResult<{ id: string }>;
  isPending:    boolean;
  submitLabel?: string;
  pendingLabel?: string;
};

function FormFooter({
  state,
  isPending,
  submitLabel  = "Create Member",
  pendingLabel = "Creating…",
}: FooterProps) {
  return (
    <>
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
      <div
        style={{
          display:        "flex",
          justifyContent: "flex-end",
          gap:            "var(--space-3)",
          paddingTop:     "var(--space-3)",
          borderTop:      "1px solid var(--theme-paper-border)",
        }}
      >
        <a
          href="/admin/users"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            padding:        "var(--space-2) var(--space-5)",
            background:     "var(--theme-paper-subtle)",
            border:         "1px solid var(--theme-paper-border)",
            borderRadius:   "var(--radius-sm)",
            fontFamily:     "var(--font-sans)",
            fontSize:       "var(--text-sm)",
            fontWeight:     "var(--weight-medium)",
            color:          "var(--theme-text-secondary)",
            textDecoration: "none",
            cursor:         "pointer",
          }}
        >
          Cancel
        </a>
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
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────

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

// ─── Shared styles ─────────────────────────────────────────

const formStyle: React.CSSProperties = {
  padding: "var(--space-6) var(--space-8)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-5)",
  borderTop: "1px solid var(--theme-paper-border)",
};

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor:           "pointer",
  appearance:       "none",
  WebkitAppearance: "none",
  paddingRight:     "var(--space-8)",
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
