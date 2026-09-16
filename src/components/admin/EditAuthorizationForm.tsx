"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateUserAuthorization } from "@/lib/actions/profiles";
import { Button, type ButtonStatus } from "@/components/ui/Button";
import { RoleDomainFields } from "@/components/admin/RoleDomainFields";
import type { Profile } from "@/lib/types/database";
import type { QueendomSummary } from "@/lib/types/client";
import type { ActionResult } from "@/lib/types";

type Props = { user: Profile; queendoms: QueendomSummary[] };

const initialState: ActionResult<Profile> = { data: null, error: null };

export function EditAuthorizationForm({ user, queendoms }: Props) {
  const [state, formAction, isPending] = useActionState(updateUserAuthorization, initialState);

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
      <input type="hidden" name="id" value={user.id} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        {/* Domain → role / position → queendom: the one shared field group (RoleDomainFields).
            Keyed on the saved row so a successful save re-seeds the defaults. */}
        <RoleDomainFields
          key={state.data?.updated_at ?? user.updated_at}
          queendoms={queendoms}
          defaults={{ role: (state.data ?? user).role, domain: (state.data ?? user).domain, sia_role: (state.data ?? user).sia_role, queendom_id: (state.data ?? user).queendom_id }}
          idPrefix="edit_"
        />

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
          Changing domain, role or seat immediately affects what this person can see and do. All changes are audited.
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
            Update Authorization
          </Button>
        </div>
      </div>
    </form>
  );
}



