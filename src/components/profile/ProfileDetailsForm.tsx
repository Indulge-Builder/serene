"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AtSign, Briefcase, Mail, Phone, Settings2, User, X } from "lucide-react";
import { updateProfile }  from "@/lib/actions/profiles";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { InfoRow } from "@/components/ui/InfoRow";
import { FormNotice } from "@/components/profile/FormNotice";
import { toast } from "@/lib/toast";
import { normalizeToE164 } from "@/lib/utils/phone";
import type { Profile }   from "@/lib/types/database";
import type { ActionResult } from "@/lib/types";

type Props = { profile: Profile };

const initialState: ActionResult<Profile> = { data: null, error: null };

/** Strip the leading +91 (or whatever country code) for display in the number input. */
function stripCountryCode(phone: string | null | undefined): string {
  if (!phone) return "";
  // If stored as E.164 +91XXXXXXXXXX, show just the local digits
  const match = phone.match(/^\+91(\d+)$/);
  return match ? (match[1] ?? "") : phone;
}

export function ProfileDetailsForm({ profile }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);
  const [editing, setEditing] = useState(false);
  const phoneNumberRef = useRef<HTMLInputElement>(null);
  const phoneHiddenRef = useRef<HTMLInputElement>(null);
  // Tracks the last save we reacted to, so the effect fires once per submission.
  const handledSaveRef = useRef<Profile | null>(null);

  // Freshest values: the action's returned row wins until the RSC revalidates.
  const current = state.data ?? profile;

  useEffect(() => {
    if (state.data && state.data !== handledSaveRef.current) {
      handledSaveRef.current = state.data;
      toast.success("Profile updated");
      setEditing(false);
    }
  }, [state.data]);

  function normalizePhoneOnBlur() {
    const raw = phoneNumberRef.current?.value ?? "";
    if (!raw.trim()) {
      if (phoneHiddenRef.current) phoneHiddenRef.current.value = "";
      return;
    }
    // Prepend +91 if user only typed local digits
    const withCode = raw.startsWith("+") ? raw : `+91${raw}`;
    try {
      const e164 = normalizeToE164(withCode, "IN");
      if (phoneHiddenRef.current) phoneHiddenRef.current.value = e164;
    } catch {
      // Leave hidden value as-is; server Zod will surface phoneInvalid
      if (phoneHiddenRef.current) phoneHiddenRef.current.value = withCode;
    }
  }

  return (
    <SectionCard
      title="Personal Details"
      headerRight={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          iconLeft={editing ? X : Settings2}
          iconMotion="rotate"
          onClick={() => setEditing((v) => !v)}
          disabled={isPending}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
      }
    >
      {!editing ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ columnGap: "var(--space-6)", rowGap: "var(--space-5)" }}
        >
          <InfoRow icon={User} label="Full Name" value={current.full_name} />
          <InfoRow
            icon={Phone}
            label="Phone Number"
            value={
              current.phone ? (
                <span style={{ fontFamily: "var(--font-mono)" }}>{current.phone}</span>
              ) : undefined
            }
          />
          <InfoRow icon={Briefcase} label="Job Title" value={current.job_title || undefined} />
          <InfoRow icon={AtSign} label="Username" value={current.username || undefined} />
          <InfoRow
            icon={Mail}
            label="Email Address"
            value={current.email}
            style={{ gridColumn: "1 / -1" }}
          />
        </div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="id" value={current.id} />
          {/* Phone is normalised to E.164 on blur; hidden input carries the canonical value */}
          <input ref={phoneHiddenRef} type="hidden" name="phone"
            defaultValue={current.phone ?? ""} />

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

            {/* Row 1 — Full Name + Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Full Name"
                htmlFor="pf_full_name"
                required
              >
                <input
                  id="pf_full_name"
                  name="full_name"
                  type="text"
                  defaultValue={current.full_name}
                  required
                  autoComplete="name"
                  className="serene-input"
                  style={{ height: "36px", padding: "0 var(--space-3)" }}
                />
              </Field>

              <Field
                label="Phone Number"
                htmlFor="pf_phone_number"
              >
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {/* Country code — read-only display */}
                  <div
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      height:         "36px",
                      padding:        "0 var(--space-3)",
                      background:     "var(--theme-paper-subtle)",
                      border:         "1px solid var(--theme-paper-border)",
                      borderRadius:   "var(--radius-sm)",
                      fontFamily:     "var(--font-sans)",
                      fontSize:       "var(--text-sm)",
                      color:          "var(--theme-text-tertiary)",
                      flexShrink:     0,
                      whiteSpace:     "nowrap",
                      userSelect:     "none",
                    }}
                  >
                    +91
                  </div>
                  <input
                    id="pf_phone_number"
                    ref={phoneNumberRef}
                    type="tel"
                    defaultValue={stripCountryCode(current.phone)}
                    placeholder="98765 43210"
                    autoComplete="tel-national"
                    className="serene-input"
                    style={{ height: "36px", padding: "0 var(--space-3)", flex: 1 }}
                    onBlur={normalizePhoneOnBlur}
                  />
                </div>
              </Field>
            </div>

            {/* Row 2 — Job Title + Username */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Job Title" htmlFor="pf_job_title">
                <input
                  id="pf_job_title"
                  name="job_title"
                  type="text"
                  defaultValue={current.job_title ?? ""}
                  placeholder="e.g. Senior Concierge Agent"
                  className="serene-input"
                  style={{ height: "36px", padding: "0 var(--space-3)" }}
                />
              </Field>

              <Field
                label="Username"
                htmlFor="pf_username"
              >
                <input
                  id="pf_username"
                  name="username"
                  type="text"
                  defaultValue={current.username ?? ""}
                  placeholder="e.g. priya_sharma"
                  autoComplete="username"
                  className="serene-input"
                  style={{ height: "36px", padding: "0 var(--space-3)" }}
                />
              </Field>
            </div>

            {/* Email — read-only, full width */}
            <Field
              label="Email Address"
              htmlFor="pf_email"
              hint="Email changes require contacting your administrator."
            >
              <div
                id="pf_email"
                aria-readonly="true"
                style={{
                  height:       "36px",
                  display:      "flex",
                  alignItems:   "center",
                  padding:      "0 var(--space-3)",
                  background:   "var(--theme-paper-subtle)",
                  border:       "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-sm)",
                  fontFamily:   "var(--font-sans)",
                  fontSize:     "var(--text-sm)",
                  color:        "var(--theme-text-tertiary)",
                  userSelect:   "all",
                  cursor:       "text",
                }}
              >
                {current.email}
              </div>
            </Field>

            {/* Feedback */}
            {state.error && <FormNotice kind="error">{state.error}</FormNotice>}

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
                style={{ boxShadow: isPending ? "none" : "var(--shadow-accent-glow)" }}
              >
                {isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </SectionCard>
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
        className="label-micro"
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "var(--space-2)",
        }}
      >
        {label}
        {required && (
          <span
            style={{
              fontSize:     "var(--text-2xs)",
              fontWeight:   "var(--weight-medium)",
              background:   "var(--theme-paper-subtle)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-full)",
              padding:      "0 var(--space-2)",
              lineHeight:   "1.6",
              color:        "var(--theme-text-tertiary)",
              textTransform: "none",
              letterSpacing: "0",
              marginLeft:   "auto",
            }}
          >
            Required
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
