"use client";

import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateProfile } from "@/lib/actions/profiles";
import { Button, type ButtonStatus } from "@/components/ui/Button";
import type { Profile } from "@/lib/types/database";
import type { ActionResult } from "@/lib/types";

type Props = { user: Profile };

const initialState: ActionResult<Profile> = { data: null, error: null };

export function EditProfileForm({ user }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);

  const succeeded = state.data !== null;

  // Save morph (polish §03): the button confirms — sage re-tint + check draw +
  // "Saved" — holds 1.8s, then returns to idle. Fires once per submission.
  const handledSaveRef = useRef<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state.data && state.data !== handledSaveRef.current) {
      handledSaveRef.current = state.data;
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1800);
      return () => clearTimeout(t);
    }
  }, [state.data]);

  const saveStatus: ButtonStatus = isPending ? "pending" : saved ? "success" : "idle";

  return (
    <form action={formAction}>
      {/* Hidden user id */}
      <input type="hidden" name="id" value={user.id} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Full name */}
        <Field label="Full Name" htmlFor="edit_full_name" required>
          <Input
            id="edit_full_name"
            name="full_name"
            type="text"
            defaultValue={user.full_name}
            required
          />
        </Field>

        {/* Job title */}
        <Field label="Job Title" htmlFor="edit_job_title">
          <Input
            id="edit_job_title"
            name="job_title"
            type="text"
            defaultValue={user.job_title ?? ""}
            placeholder="e.g. Senior Concierge Agent"
          />
        </Field>

        {/* Phone */}
        <Field label="Phone Number" htmlFor="edit_phone" hint="Stored in E.164 format (India default).">
          <Input
            id="edit_phone"
            name="phone"
            type="tel"
            defaultValue={user.phone ?? ""}
            placeholder="+91 98765 43210"
          />
        </Field>

        {/* Username */}
        <Field label="Username" htmlFor="edit_username" hint="Lowercase letters, numbers, and underscores only.">
          <Input
            id="edit_username"
            name="username"
            type="text"
            defaultValue={user.username ?? ""}
            placeholder="e.g. priya_sharma"
          />
        </Field>

        {/* Feedback */}
        {state.error && (
          <Alert tone="danger">{state.error}</Alert>
        )}
        {succeeded && (
          <Alert tone="success">Profile updated successfully.</Alert>
        )}

        {/* Actions */}
        <div
          style={{
            display:        "flex",
            justifyContent: "flex-end",
            paddingTop:     "var(--space-2)",
          }}
        >
          <Button
            variant="primary"
            type="submit"
            status={saveStatus}
            loadingLabel="Saving…"
            successLabel="Saved"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </form>
  );
}
