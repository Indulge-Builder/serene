"use client";

// HandsSettingsPanel — /settings/hands (0245; hands plan Layer F). Admin and founder: the kill
// switch, the trust level per ticket category, the three rupee caps, the allowlist of numbers the
// hands may talk to, and the connector's state. Every save is a server action; nothing here reads
// the database.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { FormSelect } from "@/components/ui/FormSelect";
import { Field, Input } from "@/components/ui/Field";
import { toast } from "@/lib/toast";
import { updateHandsSettingsAction, upsertAllowedContactAction } from "@/lib/actions/hands";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/constants/tickets";
import { HANDS_TRUST_LEVELS, HANDS_DEFAULT_TRUST_LEVEL, HANDS_IDENTITY_NAME, HANDS_RULEBOOK, type HandsTrustLevel } from "@/lib/constants/hands";
import { formatCurrency } from "@/lib/utils/numbers";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { HandsAllowedContactRow, HandsConnectorStatusRow } from "@/lib/types/hands";

type Settings = { enabled: boolean; trustByCategory: Record<string, HandsTrustLevel>; perJobCapInr: number; dailyCapInr: number; monthlyCapInr: number };

export function HandsSettingsPanel({ initial, contacts, connector, vendors }: {
  initial: Settings;
  contacts: HandsAllowedContactRow[];
  connector: HandsConnectorStatusRow | null;
  /** Agent vendors (vendors.kind = agent) an allowed number can stand for. */
  vendors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [trust, setTrust] = useState<Record<string, HandsTrustLevel>>(initial.trustByCategory);
  const [caps, setCaps] = useState({ perJob: String(initial.perJobCapInr), daily: String(initial.dailyCapInr), monthly: String(initial.monthlyCapInr) });
  const [contact, setContact] = useState({ jid: "", label: "", vendorId: vendors[0]?.id ?? "" });

  const save = () => start(async () => {
    const trustByCategory = Object.fromEntries(TICKET_CATEGORIES.values.map((c) => [c, trust[c] ?? HANDS_DEFAULT_TRUST_LEVEL])) as Record<TicketCategory, HandsTrustLevel>;
    const r = await updateHandsSettingsAction({ enabled, trustByCategory, perJobCapInr: Number(caps.perJob), dailyCapInr: Number(caps.daily), monthlyCapInr: Number(caps.monthly) });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("Saved. Every next line reads these.");
    router.refresh();
  });

  const addContact = () => start(async () => {
    const digits = contact.jid.replace(/\D/g, "");
    const r = await upsertAllowedContactAction({ jid: `${digits}@s.whatsapp.net`, label: contact.label, vendorId: contact.vendorId || null, isActive: true });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("On the allowlist. The connector picks it up within a minute.");
    setContact({ jid: "", label: "", vendorId: vendors[0]?.id ?? "" });
    router.refresh();
  });

  const toggleContact = (c: HandsAllowedContactRow) => start(async () => {
    const r = await upsertAllowedContactAction({ jid: c.jid, label: c.label, vendorId: c.vendor_id, isActive: !c.is_active });
    if (r.error) { toast.danger(r.error); return; }
    router.refresh();
  });

  const connected = connector?.connected && Date.now() - new Date(connector.beat_at).getTime() < 3 * 60_000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionCard title="The line" description={`The second WhatsApp number, the identity the agent knows as ${HANDS_IDENTITY_NAME}. Nothing leaves it while the switch is off.`} headerRight={<Button size="sm" onClick={save} loading={pending}>Save</Button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <Badge tone={connected ? "success" : "warning"}>{connected ? "Connected" : connector?.state === "pairing" ? "Waiting for the phone to scan" : connector ? `Offline (${connector.state})` : "Connector never ran"}</Badge>
            {connector?.beat_at && <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>last heartbeat {formatRelativeTime(connector.beat_at)}</span>}
            {connector?.account_jid && <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>as {connector.account_jid.split("@")[0].replace(/(\d{2})(\d+)(\d{4})/, "$1 ••• $3")}</span>}
          </div>
          <Toggle checked={enabled} onChange={setEnabled} label="Hands switched on" description="Off: threads can be read, nothing can be queued or sent. On: lines go, each one through the disclosure filter and the leak check." />
          <div className="serene-form-row">
            <Field label="Per job cap (₹)" htmlFor="hands-cap-job" hint="A genie may mark a payment up to this; above it a bishop, admin or founder must."><Input id="hands-cap-job" type="number" min={0} value={caps.perJob} onChange={(e) => setCaps({ ...caps, perJob: e.target.value })} /></Field>
            <Field label="Daily cap (₹)" htmlFor="hands-cap-day"><Input id="hands-cap-day" type="number" min={0} value={caps.daily} onChange={(e) => setCaps({ ...caps, daily: e.target.value })} /></Field>
            <Field label="Monthly cap (₹)" htmlFor="hands-cap-month"><Input id="hands-cap-month" type="number" min={0} value={caps.monthly} onChange={(e) => setCaps({ ...caps, monthly: e.target.value })} /></Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="How much Elaya may do, per category" description="Every category starts at L0: a human approves every line. Move one up only after a clean run of jobs.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(18rem, 100%), 1fr))", gap: "var(--space-3)" }}>
          {TICKET_CATEGORIES.values.map((c) => (
            <Field key={c} label={TICKET_CATEGORIES.labels[c]} htmlFor={`hands-trust-${c}`}>
              <FormSelect id={`hands-trust-${c}`} value={trust[c] ?? HANDS_DEFAULT_TRUST_LEVEL} onValueChange={(v) => setTrust({ ...trust, [c]: v as HandsTrustLevel })}>
                {HANDS_TRUST_LEVELS.values.map((l) => <option key={l} value={l}>{HANDS_TRUST_LEVELS.labels[l]}</option>)}
              </FormSelect>
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Who the hands may talk to" description="A number not on this list is refused by the connector before anything is sent, and its messages are recorded raw and dropped.">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {contacts.length === 0 && <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>Nobody yet. Add the agent's WhatsApp number below.</span>}
          {contacts.map((c) => (
            <div key={c.jid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--theme-paper-border)" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>{c.label}</span>
                <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>{c.jid.split("@")[0]} · {vendors.find((v) => v.id === c.vendor_id)?.name ?? "no vendor linked"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone={c.is_active ? "success" : "neutral"} size="xs">{c.is_active ? "Allowed" : "Paused"}</Badge>
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => toggleContact(c)}>{c.is_active ? "Pause" : "Allow"}</Button>
              </div>
            </div>
          ))}
          <div className="serene-form-row" style={{ alignItems: "end" }}>
            <Field label="WhatsApp number" htmlFor="hands-jid" hint="Digits with the country code, 91…"><Input id="hands-jid" inputMode="numeric" value={contact.jid} onChange={(e) => setContact({ ...contact, jid: e.target.value })} placeholder="9198XXXXXXXX" /></Field>
            <Field label="Label" htmlFor="hands-label"><Input id="hands-label" value={contact.label} onChange={(e) => setContact({ ...contact, label: e.target.value })} placeholder="Instinct" /></Field>
            <Field label="Stands for the vendor" htmlFor="hands-vendor" hint={vendors.length ? undefined : "Create a vendor with kind agent first."}>
              <FormSelect id="hands-vendor" value={contact.vendorId} onValueChange={(v) => setContact({ ...contact, vendorId: v })}>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </FormSelect>
            </Field>
            <div><Button size="sm" disabled={pending || contact.jid.replace(/\D/g, "").length < 8 || !contact.label.trim()} loading={pending} onClick={addContact}>Add</Button></div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="The rulebook" description="Sent to the agent once from the hands phone (a Talk thread). Re-send it when the agent seems to have forgotten.">
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>{HANDS_RULEBOOK}</pre>
        <span className="type-caption" style={{ color: "var(--theme-text-tertiary)", display: "block", marginTop: "var(--space-2)" }}>Caps today: {formatCurrency(Number(caps.perJob) || 0)} a job, {formatCurrency(Number(caps.daily) || 0)} a day, {formatCurrency(Number(caps.monthly) || 0)} a month.</span>
      </SectionCard>
    </div>
  );
}
