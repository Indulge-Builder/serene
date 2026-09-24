"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createUser, inviteUser } from "@/lib/actions/profiles";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { RoleDomainFields } from "@/components/admin/RoleDomainFields";
import type { QueendomSummary } from "@/lib/types/member";
import type { ActionResult } from "@/lib/types";

export type CreateUserMode = "password" | "invite";

const initialState: ActionResult<{ id: string }> = { data: null, error: null };

type CreateUserFormProps = {
  mode:      CreateUserMode;
  queendoms: QueendomSummary[];
};

export function CreateUserForm({ mode, queendoms }: CreateUserFormProps) {
  const router = useRouter();

  const [createState, createAction, createPending] = useActionState(createUser,  initialState);
  const [inviteState, inviteAction, invitePending] = useActionState(inviteUser, initialState);

  const state     = mode === "password" ? createState : inviteState;
  const isPending = mode === "password" ? createPending : invitePending;

  useEffect(() => {
    if (createState.data || inviteState.data) {
      router.push("/admin/users");
    }
  }, [createState.data, inviteState.data, router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {mode === "password" ? (
        <form action={createAction} style={formStyle}>
          <PasswordFields queendoms={queendoms} />
          <FormFooter state={state} isPending={isPending} />
        </form>
      ) : (
        <form action={inviteAction} style={formStyle}>
          <InviteFields queendoms={queendoms} />
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

type FieldsProps = { queendoms: QueendomSummary[] };

function CommonFields({ queendoms }: FieldsProps) {
  return (
    <>
      <Field label="Full Name" htmlFor="full_name" required>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder="e.g. Priya Sharma"
        />
      </Field>

      <Field label="Email Address" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="priya@indulgeglobal.com"
        />
      </Field>

      {/* Domain → role / position → queendom: the one shared field group (RoleDomainFields). */}
      <RoleDomainFields queendoms={queendoms} defaults={{ role: "agent", domain: "concierge" }} idPrefix="new_" />

      <Field label="Job Title" htmlFor="job_title">
        <Input
          id="job_title"
          name="job_title"
          type="text"
          placeholder="e.g. Senior Concierge Agent"
        />
      </Field>
    </>
  );
}

function PasswordFields({ queendoms }: FieldsProps) {
  return (
    <>
      <CommonFields queendoms={queendoms} />
      <Field
        label="Temporary Password"
        htmlFor="password"
        required
        hint="Minimum 8 characters. User can change after login."
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </Field>
      <Field
        label="Phone Number"
        htmlFor="phone"
        hint="Stored in E.164 format (India default)."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+91 98765 43210"
        />
      </Field>
    </>
  );
}

function InviteFields({ queendoms }: FieldsProps) {
  return <CommonFields queendoms={queendoms} />;
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
  const router = useRouter();
  return (
    <>
      {state.error && (
        <Alert tone="danger">{state.error}</Alert>
      )}
      <div
        style={{
          display:        "flex",
          justifyContent: "flex-end",
          gap:            "var(--space-2)",
          paddingTop:     "var(--space-2)",
        }}
      >
        <Button variant="ghost" type="button" disabled={isPending} onClick={() => router.push("/admin/users")}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={isPending} loading={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────

const formStyle: React.CSSProperties = {
  display:       "flex",
  flexDirection: "column",
  gap:           "var(--space-5)",
};

