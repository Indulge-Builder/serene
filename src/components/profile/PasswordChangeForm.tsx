"use client";

import { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { createClient } from "@/lib/supabase/client";
import { formErrors } from "@/lib/validations/form-errors";
import { FAST_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

type FormStatus =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

interface Requirement {
  id:    string;
  label: string;
  met:   (pw: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { id: "len",    label: "At least 8 characters",   met: (pw) => pw.length >= 8 },
  { id: "number", label: "Contains a number",        met: (pw) => /\d/.test(pw) },
  { id: "symbol", label: "Contains a symbol",        met: (pw) => /[^a-zA-Z0-9]/.test(pw) },
  { id: "case",   label: "Mixed upper and lowercase", met: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
];

export function PasswordChangeForm() {
  const [current,    setCurrent]    = useState("");
  const [next,       setNext]       = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showCur,    setShowCur]    = useState(false);
  const [showNext,   setShowNext]   = useState(false);
  const [formState,  setFormState]  = useState<FormStatus>({ status: "idle" });
  // Only show confirm mismatch after user has typed something in the confirm field
  const [confirmTouched, setConfirmTouched] = useState(false);

  const isPending = formState.status === "pending";

  const allRequirementsMet = REQUIREMENTS.every((r) => r.met(next));
  const confirmMatches     = confirm === next;
  const canSubmit          = !isPending && current.length > 0 && allRequirementsMet && confirmMatches && confirm.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (next === current) {
      setFormState({ status: "error", message: formErrors.passwordSameAsCurrent });
      return;
    }

    setFormState({ status: "pending" });

    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setFormState({ status: "error", message: formErrors.passwordSessionExpired });
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: current,
    });

    if (signInError) {
      setFormState({ status: "error", message: formErrors.passwordCurrentIncorrect });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      setFormState({ status: "error", message: formErrors.generic });
      return;
    }

    setFormState({ status: "success" });
    setCurrent("");
    setNext("");
    setConfirm("");
    setConfirmTouched(false);
  }

  const confirmError =
    confirmTouched && confirm.length > 0 && !confirmMatches
      ? formErrors.passwordConfirmMismatch
      : undefined;

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

        {/* New password + requirements + strength bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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

          {/* Live requirements list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {REQUIREMENTS.map((req) => {
              const met = req.met(next);
              return (
                <div
                  key={req.id}
                  style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        "var(--space-2)",
                  }}
                >
                  <span
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      width:          "14px",
                      height:         "14px",
                      flexShrink:     0,
                      color:          met ? "var(--color-success)" : "var(--theme-text-tertiary)",
                      transition:     `color ${FAST_DURATION}s var(--ease-in-out)`,
                    }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {met ? (
                        <motion.span
                          key="met"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1,   opacity: 1 }}
                          exit={{    scale: 0.6, opacity: 0 }}
                          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                          style={{ display: "flex" }}
                        >
                          <Check style={{ width: "12px", height: "12px", strokeWidth: 2.5 }} aria-hidden="true" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="unmet"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1,   opacity: 1 }}
                          exit={{    scale: 0.6, opacity: 0 }}
                          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                          style={{ display: "flex" }}
                        >
                          {/* Small circle placeholder */}
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span
                    style={{
                      fontFamily:  "var(--font-sans)",
                      fontSize:    "var(--text-xs)",
                      color:       met ? "var(--color-success)" : "var(--theme-text-tertiary)",
                      transition:  `color ${FAST_DURATION}s var(--ease-in-out)`,
                    }}
                  >
                    {req.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Strength bar */}
          <PasswordStrengthBar password={next} />
        </div>

        {/* Confirm new password */}
        <PasswordField
          id="pw_confirm"
          label="Confirm New Password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            if (!confirmTouched && v.length > 0) setConfirmTouched(true);
          }}
          show={showNext}
          onToggleShow={() => setShowNext((v) => !v)}
          autoComplete="new-password"
          disabled={isPending}
          error={confirmError}
          matchSuccess={confirmTouched && confirm.length > 0 && confirmMatches}
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
            disabled={!canSubmit}
            loading={isPending}
            style={{ boxShadow: canSubmit && !isPending ? "var(--shadow-accent-glow)" : "none" }}
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
  matchSuccess?:  boolean;
};

function PasswordField({
  id, label, value, onChange, show, onToggleShow, autoComplete, disabled, error, matchSuccess,
}: PasswordFieldProps) {
  const borderColor = error
    ? "var(--color-danger)"
    : matchSuccess
    ? "var(--color-success)"
    : "var(--theme-paper-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label
        htmlFor={id}
        className="label-micro"
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
          className="eia-input"
          style={{
            height:     "36px",
            padding:    "0 var(--space-10) 0 var(--space-3)",
            borderColor,
            opacity:    disabled ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error
              ? "var(--color-danger)"
              : matchSuccess
              ? "var(--color-success)"
              : "var(--theme-accent)";
            e.currentTarget.style.boxShadow = error
              ? "0 0 0 3px var(--color-danger-light)"
              : "var(--shadow-focus)";
            e.currentTarget.style.background = "var(--theme-paper)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = borderColor;
            e.currentTarget.style.boxShadow   = "none";
            e.currentTarget.style.background   = "var(--theme-paper-subtle)";
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
      {!error && matchSuccess && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--color-success)",
            margin:     0,
          }}
        >
          Passwords match.
        </p>
      )}
    </div>
  );
}
