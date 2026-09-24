"use client";

import { useState } from "react";
import { Eye, EyeOff, Check, Lock, Settings2, X } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import { Button, useButtonStatus } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { InfoRow } from "@/components/ui/InfoRow";
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { FormNotice } from "@/components/profile/FormNotice";
import { toast } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import { formErrors } from "@/lib/validations/form-errors";
import { FAST_DURATION, EASE_OUT_EXPO } from "@/lib/constants/motion";

type FormStatus =
  | { status: "idle" }
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
  const [editing,    setEditing]    = useState(false);
  const [current,    setCurrent]    = useState("");
  const [next,       setNext]       = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showCur,    setShowCur]    = useState(false);
  const [showNext,   setShowNext]   = useState(false);
  const [formState,  setFormState]  = useState<FormStatus>({ status: "idle" });
  // Only show confirm mismatch after user has typed something in the confirm field
  const [confirmTouched, setConfirmTouched] = useState(false);

  // Save morph (polish §03): the button confirms — pending → sage "Saved" (1.8s)
  // → then the card folds back to read view (matches ProfileDetailsForm timing).
  const save = useButtonStatus();
  const isPending = save.status === "pending";

  const allRequirementsMet = REQUIREMENTS.every((r) => r.met(next));
  const confirmMatches     = confirm === next;
  const canSubmit          = !isPending && current.length > 0 && allRequirementsMet && confirmMatches && confirm.length > 0;

  function resetFields() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShowCur(false);
    setShowNext(false);
    setConfirmTouched(false);
    setFormState({ status: "idle" });
  }

  function toggleEditing() {
    if (editing) resetFields();
    setEditing((v) => !v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (next === current) {
      setFormState({ status: "error", message: formErrors.passwordSameAsCurrent });
      return;
    }

    setFormState({ status: "idle" });

    await save.run(async () => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setFormState({ status: "error", message: formErrors.passwordSessionExpired });
        return { success: false };
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    user.email,
        password: current,
      });

      if (signInError) {
        setFormState({ status: "error", message: formErrors.passwordCurrentIncorrect });
        return { success: false };
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });

      if (updateError) {
        setFormState({ status: "error", message: formErrors.generic });
        return { success: false };
      }

      toast.success("Password updated");
      // Let the sage "Saved" morph hold, then fold back to the read view.
      setTimeout(() => {
        resetFields();
        setEditing(false);
      }, 1800);
      return { success: true };
    });
  }

  const confirmError =
    confirmTouched && confirm.length > 0 && !confirmMatches
      ? formErrors.passwordConfirmMismatch
      : undefined;

  return (
    <SectionCard
      title="Security"
      headerRight={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          iconLeft={editing ? X : Settings2}
          iconMotion="rotate"
          onClick={toggleEditing}
          disabled={isPending}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
      }
    >
      {!editing ? (
        <InfoRow
          icon={Lock}
          label="Password"
          value={
            <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
              ••••••••••
            </span>
          }
        />
      ) : (
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
              <FormNotice kind="error">{formState.message}</FormNotice>
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
                status={save.status}
                loadingLabel="Updating…"
                successLabel="Saved"
                style={{ boxShadow: canSubmit && save.status === "idle" ? "var(--shadow-accent-glow)" : "none" }}
              >
                Update Password
              </Button>
            </div>
          </div>
        </form>
      )}
    </SectionCard>
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
          className="serene-input"
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
            // Inputs float (soft-UI Rule 3) — focus adds the accent ring over
            // the paired input shadow; never a flat glow, never a sunken fill.
            e.currentTarget.style.boxShadow = error
              ? "0 0 0 1px var(--color-danger), var(--neu-shadow-input)"
              : "0 0 0 1px var(--theme-accent), var(--neu-shadow-input)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = borderColor;
            e.currentTarget.style.boxShadow   = "var(--neu-shadow-input)";
          }}
        />
        <Button
          variant="ghost"
          iconOnly size="sm"
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          style={{
            position:        "absolute",
            right:           "var(--space-3)",
            top:             "50%",
            transform:       "translateY(-50%)",
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
        </Button>
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
            color:      "var(--color-success-text)",
            margin:     0,
          }}
        >
          Passwords match.
        </p>
      )}
    </div>
  );
}
