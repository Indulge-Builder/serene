"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from '@/components/ui/Button';
import { PasswordStrengthBar } from '@/components/ui/PasswordStrengthBar';
import { createClient } from "@/lib/supabase/client";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

export function PasswordChangeForm() {
  const [current,   setCurrent]   = useState("");
  const [next,      setNext]      = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showCur,   setShowCur]   = useState(false);
  const [showNext,  setShowNext]  = useState(false);
  const [formState, setFormState] = useState<State>({ status: "idle" });


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!current || !next || !confirm) {
      setFormState({ status: "error", message: "All fields are required." });
      return;
    }
    if (next.length < 8) {
      setFormState({ status: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setFormState({ status: "error", message: "New passwords do not match." });
      return;
    }
    if (next === current) {
      setFormState({ status: "error", message: "New password must differ from the current password." });
      return;
    }

    setFormState({ status: "pending" });

    const supabase = createClient();

    // Re-authenticate with the current password to verify it before changing.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setFormState({ status: "error", message: "Session expired. Please sign in again." });
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: current,
    });

    if (signInError) {
      setFormState({ status: "error", message: "Current password is incorrect." });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: next,
    });

    if (updateError) {
      setFormState({
        status:  "error",
        message: updateError.message ?? "Failed to update password. Please try again.",
      });
      return;
    }

    setFormState({ status: "success" });
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  const isPending = formState.status === "pending";

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

        {/* Current password */}
        <PasswordField
          id="pw_current"
          label="Current Password"
          value={current}
          onChange={setCurrent}
          show={showCur}
          onToggleShow={() => setShowCur((v) => !v)}
          autoComplete="current-password"
          disabled={isPending}
        />

        {/* New password + strength bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <PasswordField
            id="pw_next"
            label="New Password"
            value={next}
            onChange={setNext}
            show={showNext}
            onToggleShow={() => setShowNext((v) => !v)}
            autoComplete="new-password"
            disabled={isPending}
          />

          {/* Strength bar */}
          <PasswordStrengthBar password={next} />
        </div>

        {/* Confirm new password */}
        <PasswordField
          id="pw_confirm"
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          show={showNext}
          onToggleShow={() => setShowNext((v) => !v)}
          autoComplete="new-password"
          disabled={isPending}
          error={confirm.length > 0 && confirm !== next ? "Passwords do not match." : undefined}
        />

        {/* Feedback */}
        {formState.status === "error" && (
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
            {formState.message}
          </div>
        )}
        {formState.status === "success" && (
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
            Password updated successfully.
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
          <Button
            variant="primary"
            type="submit"
            disabled={isPending}
            loading={isPending}
            style={{ boxShadow: isPending ? 'none' : 'var(--shadow-accent-glow)' }}
          >
            {isPending ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── PasswordField ────────────────────────────────────────

type PasswordFieldProps = {
  id:             string;
  label:          string;
  value:          string;
  onChange:       (v: string) => void;
  show:           boolean;
  onToggleShow:   () => void;
  autoComplete?:  string;
  disabled?:      boolean;
  error?:         string;
};

function PasswordField({
  id, label, value, onChange, show, onToggleShow, autoComplete, disabled, error,
}: PasswordFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label
        htmlFor={id}
        style={{
          fontFamily:    "var(--font-sans)",
          fontSize:      "var(--text-2xs)",
          fontWeight:    "var(--weight-semibold)",
          letterSpacing: "var(--tracking-widest)",
          textTransform: "uppercase",
          color:         "var(--theme-text-tertiary)",
        }}
      >
        {label}
      </label>

      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          style={{
            width:        "100%",
            height:       "36px",
            padding:      "0 var(--space-10) 0 var(--space-3)",
            background:   "var(--theme-paper-subtle)",
            border:       `1px solid ${error ? "var(--color-danger)" : "var(--theme-paper-border)"}`,
            borderRadius: "var(--radius-sm)",
            fontFamily:   "var(--font-sans)",
            fontSize:     "var(--text-sm)",
            color:        "var(--theme-text-primary)",
            outline:      "none",
            boxSizing:    "border-box",
            transition:   "border-color var(--duration-fast) var(--ease-in-out), box-shadow var(--duration-fast) var(--ease-in-out)",
            opacity:      disabled ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-danger)" : "var(--theme-accent)";
            e.currentTarget.style.boxShadow   = error
              ? "0 0 0 3px var(--color-danger-light)"
              : "var(--shadow-focus)";
            e.currentTarget.style.background  = "var(--theme-paper)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? "var(--color-danger)" : "var(--theme-paper-border)";
            e.currentTarget.style.boxShadow   = "none";
            e.currentTarget.style.background  = "var(--theme-paper-subtle)";
          }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          style={{
            position:        "absolute",
            right:           "var(--space-3)",
            top:             "50%",
            transform:       "translateY(-50%)",
            background:      "transparent",
            border:          "none",
            padding:         0,
            cursor:          "pointer",
            color:           "var(--theme-text-tertiary)",
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
          }}
        >
          {show ? (
            <EyeOff style={{ width: "15px", height: "15px", strokeWidth: 1.5 }} />
          ) : (
            <Eye style={{ width: "15px", height: "15px", strokeWidth: 1.5 }} />
          )}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--color-danger-text)",
            margin:     0,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
