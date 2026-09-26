"use client";

/**
 * RoleDomainFields — THE domain → role (→ position → queendom) field group every account-
 * shaping form composes (Create / Invite / Edit Authorization). Two axes, never one list:
 *
 *   domain      "where do you sit"           picked first — it decides what the Role select offers
 *   role        "what can you do"            the platform role (routes + RLS key on it)
 *   position    "what is your job in the team" (queen / bishop / genie / joker / joker head) —
 *               only for a domain listed in DOMAIN_POSITIONS; picking one DERIVES the platform role
 *               (SIA_ROLE_PLATFORM_ROLE) and locks it, so a genie can never be created as a manager
 *   queendom    "which team"                 required with a position, blank otherwise (and blank
 *               for the Joker head, who sits above every queendom)
 *
 * The <form> receives exactly four fields: role, domain, sia_role, queendom_id — the same
 * names the Zod schemas read (domain and queendom_id ride FormSelect's hidden input, 2026-09-25;
 * the Zod schema is the required check). A domain with no positions renders the plain role select.
 */

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { FormSelect } from "@/components/ui/FormSelect";
import { USER_ROLES, ROLE_LABELS } from "@/lib/constants/roles";
import { APP_DOMAINS, DOMAIN_LABELS } from "@/lib/constants/domains";
import { SIA_ROLES, SIA_ROLE_PLATFORM_ROLE, positionsForDomain, isSiaRole, seatNeedsQueendom, type SiaRole } from "@/lib/constants/sia-roles";
import type { QueendomSummary } from "@/lib/types/member";
import type { UserRole, AppDomain } from "@/lib/types/database";

export type RoleDomainDefaults = {
  role:        UserRole;
  domain:      AppDomain;
  sia_role?:   string | null;
  queendom_id?: string | null;
};

type Props = {
  queendoms: QueendomSummary[];
  defaults:  RoleDomainDefaults;
  /** Prefix for element ids so two forms on one page never collide. */
  idPrefix?: string;
};

type Pick = { kind: "position"; value: SiaRole } | { kind: "role"; value: UserRole };
const encode = (p: Pick) => `${p.kind}:${p.value}`;
function decode(v: string): Pick {
  const [kind, value] = v.split(":");
  if (kind === "position" && isSiaRole(value)) return { kind, value };
  return { kind: "role", value: (USER_ROLES.includes(value as UserRole) ? value : "agent") as UserRole };
}

export function RoleDomainFields({ queendoms, defaults, idPrefix = "" }: Props) {
  const [domain, setDomain] = useState<AppDomain>(defaults.domain);
  const [pick, setPick] = useState<Pick>(
    isSiaRole(defaults.sia_role) && positionsForDomain(defaults.domain).includes(defaults.sia_role)
      ? { kind: "position", value: defaults.sia_role }
      : { kind: "role", value: defaults.role },
  );
  const [queendomId, setQueendomId] = useState<string>(defaults.queendom_id ?? "");

  const positions = positionsForDomain(domain);
  const position  = pick.kind === "position" ? pick.value : null;
  const role: UserRole = position ? SIA_ROLE_PLATFORM_ROLE[position] : (pick as { value: UserRole }).value;
  // A company-wide seat (the Joker head) sits above the queendoms: no queendom to pick.
  const needsQueendom = seatNeedsQueendom(position);
  const id = (s: string) => `${idPrefix}${s}`;

  function onDomain(next: AppDomain) {
    setDomain(next);
    // Leaving a domain that has positions drops the position and the queendom; the platform
    // role the position implied stays as the plain pick so nothing is lost by accident.
    if (positionsForDomain(next).length === 0 && pick.kind === "position") {
      setPick({ kind: "role", value: role });
      setQueendomId("");
    }
  }

  return (
    <>
      {/* The four values the action reads. role + sia_role are derived here, never typed. */}
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="sia_role" value={position ?? ""} />
      {!needsQueendom && <input type="hidden" name="queendom_id" value="" />}

      <div className="serene-form-row">
        <Field label="Domain" htmlFor={id("domain")} required>
          <FormSelect id={id("domain")} name="domain" value={domain} onValueChange={(next) => onDomain(next as AppDomain)}>
            {APP_DOMAINS.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
            ))}
          </FormSelect>
        </Field>

        <Field
          label={positions.length ? "Position" : "Role"}
          htmlFor={id("role")}
          required
          hint={position ? `Access level: ${ROLE_LABELS[role]} (set by the position)${needsQueendom ? "" : ". Reaches every queendom."}` : undefined}
        >
          <FormSelect id={id("role")} value={encode(pick)} onValueChange={(next) => setPick(decode(next))}>
            {positions.length > 0 && (
              <optgroup label="Positions">
                {positions.map((p) => (
                  <option key={p} value={encode({ kind: "position", value: p })}>{SIA_ROLES.labels[p]}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={positions.length ? "Access only (no position)" : "Roles"}>
              {USER_ROLES.map((r) => (
                <option key={r} value={encode({ kind: "role", value: r })}>{ROLE_LABELS[r]}</option>
              ))}
            </optgroup>
          </FormSelect>
        </Field>
      </div>

      {needsQueendom && (
        <Field label="Queendom" htmlFor={id("queendom")} required hint="The team this person works in. Queen and Joker are one seat each; a queendom can have several Bishops and Genies.">
          <FormSelect id={id("queendom")} name="queendom_id" value={queendomId} onValueChange={setQueendomId}>
            <option value="" disabled>Choose a queendom</option>
            {queendoms.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </FormSelect>
        </Field>
      )}
    </>
  );
}
