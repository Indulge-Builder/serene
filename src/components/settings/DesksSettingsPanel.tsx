"use client";

// DesksSettingsPanel — /settings/desks (0248; desks plan Layers E and F). Admin and founder: the
// kill switch and quiet hours, the announcement box (the founder's one line to every table), the
// speakers and TVs on the allow-list with a "Say hello" test, and the ledger of everything said.
// Every save is a server action; nothing here reads the database.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { FormSelect } from "@/components/ui/FormSelect";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/lib/toast";
import { sendDeskAnnouncementAction, testDeskDeviceAction, updateDeskSettingsAction, upsertDeskDeviceAction } from "@/lib/actions/desks";
import { DESK_ANNOUNCEMENT_MAX_CHARS, DESK_DEVICE_KIND_LABELS, DESK_DEVICE_KINDS, type DeskAudience, type DeskDeviceKind, type DeskOutboxStatus } from "@/lib/constants/desks";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { DeskDeviceRow, DeskOutboxRow } from "@/lib/types/desks";

type Settings = { enabled: boolean; quietHours: { from: number; to: number } };
type Option = { id: string; name: string };

const STATUS_TONE: Record<DeskOutboxStatus, SemanticTone> = { queued: "info", sent: "success", failed: "danger", refused: "warning" };
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function audienceLabel(a: DeskAudience, queendoms: Option[], devices: DeskDeviceRow[]): string {
  if ("all" in a) return "All tables";
  if ("queendom_id" in a) return queendoms.find((q) => q.id === a.queendom_id)?.name ?? "One queendom";
  return devices.find((d) => d.id === a.device_id)?.label ?? "One device";
}

export function DesksSettingsPanel({ initial, devices, ledger, queendoms, accounts, senderConfigured }: {
  initial: Settings;
  devices: DeskDeviceRow[];
  ledger: DeskOutboxRow[];
  queendoms: Option[];
  /** Concierge accounts a device may sign in as (the device profile, a genie of its queendom). */
  accounts: Option[];
  senderConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [quiet, setQuiet] = useState(initial.quietHours);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("all");
  const [speak, setSpeak] = useState(true);
  const [device, setDevice] = useState({ kind: "alexa" as DeskDeviceKind, label: "", queendomId: queendoms[0]?.id ?? "", profileId: "", alexaDeviceId: "", voicemonkeyDevice: "" });

  const save = () => start(async () => {
    const r = await updateDeskSettingsAction({ enabled, quietFrom: quiet.from, quietTo: quiet.to });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("Saved. The next line reads these.");
    router.refresh();
  });

  const announce = () => start(async () => {
    const audience: DeskAudience = target === "all" ? { all: true } : target.startsWith("q:") ? { queendom_id: target.slice(2) } : { device_id: target.slice(2) };
    const r = await sendDeskAnnouncementAction({ text, audience, speak });
    if (r.error) { toast.danger(r.error); return; }
    toast.success(speak ? "Queued. The speakers say it in a few seconds." : "Queued for the TVs.");
    setText("");
    router.refresh();
  });

  const addDevice = () => start(async () => {
    const r = await upsertDeskDeviceAction({
      kind: device.kind, label: device.label, queendomId: device.queendomId || null, profileId: device.profileId || null,
      alexaDeviceId: device.alexaDeviceId || null, voicemonkeyDevice: device.voicemonkeyDevice || null, isActive: true,
    });
    if (r.error) { toast.danger(r.error); return; }
    toast.success("On the allow-list.");
    setDevice({ ...device, label: "", profileId: "", alexaDeviceId: "", voicemonkeyDevice: "" });
    router.refresh();
  });

  const toggleDevice = (d: DeskDeviceRow) => start(async () => {
    const r = await upsertDeskDeviceAction({ id: d.id, kind: d.kind, label: d.label, queendomId: d.queendom_id, profileId: d.profile_id, alexaDeviceId: d.alexa_device_id, voicemonkeyDevice: d.voicemonkey_device, isActive: !d.is_active });
    if (r.error) { toast.danger(r.error); return; }
    router.refresh();
  });

  const sayHello = (d: DeskDeviceRow) => start(async () => {
    const r = await testDeskDeviceAction({ id: d.id });
    if (r.error) { toast.danger(r.error); return; }
    toast.success(`Queued for ${d.label}.`);
    router.refresh();
  });

  const speakers = devices.filter((d) => d.kind === "alexa" && d.is_active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionCard title="The tables" description="Elaya on the office speakers and TV boards. Nothing is said while the switch is off; in quiet hours her alerts wait for the morning, a person's announcement still goes." headerRight={<Button size="sm" onClick={save} loading={pending}>Save</Button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <Badge tone={senderConfigured ? "success" : "warning"}>{senderConfigured ? "Voice Monkey connected" : "Voice Monkey token missing"}</Badge>
            <span className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>{speakers.length} active {speakers.length === 1 ? "speaker" : "speakers"}</span>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} label="Desks switched on" description="Off: nothing is queued or spoken. On: alerts reach their queendom's table, announcements reach every table." />
          <div className="serene-form-row">
            <Field label="Quiet from" htmlFor="desks-quiet-from" hint="IST. Alerts queued in the window wait until it ends.">
              <FormSelect id="desks-quiet-from" value={String(quiet.from)} onValueChange={(v) => setQuiet({ ...quiet, from: Number(v) })}>
                {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </FormSelect>
            </Field>
            <Field label="Quiet until" htmlFor="desks-quiet-to">
              <FormSelect id="desks-quiet-to" value={String(quiet.to)} onValueChange={(v) => setQuiet({ ...quiet, to: Number(v) })}>
                {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </FormSelect>
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Announce" description="One line, said on the speakers and shown on the TVs. It is spoken as written, after the room rules: no amounts, no numbers, no names of members.">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Field label="What to say" htmlFor="desks-announce" hint={`${text.length}/${DESK_ANNOUNCEMENT_MAX_CHARS}`}>
            <Textarea id="desks-announce" rows={3} maxLength={DESK_ANNOUNCEMENT_MAX_CHARS} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lunch is on the house today." />
          </Field>
          <div className="serene-form-row">
            <Field label="Who hears it" htmlFor="desks-target">
              <FormSelect id="desks-target" value={target} onValueChange={setTarget}>
                <option value="all">All tables</option>
                <optgroup label="One queendom">{queendoms.map((q) => <option key={q.id} value={`q:${q.id}`}>{q.name}</option>)}</optgroup>
                <optgroup label="One device">{devices.filter((d) => d.is_active).map((d) => <option key={d.id} value={`d:${d.id}`}>{d.label}</option>)}</optgroup>
              </FormSelect>
            </Field>
            <div style={{ display: "flex", alignItems: "end" }}>
              <Toggle checked={speak} onChange={setSpeak} label="Say it on the speakers" description="Off: the TVs show it, nobody hears it." />
            </div>
          </div>
          <div>
            <Button onClick={announce} loading={pending} disabled={!enabled || !text.trim()}>
              <Megaphone className="w-4 h-4" strokeWidth={1.5} /> Send to the tables
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Speakers and TVs" description="The allow-list. A line is sent to a device on this list or not at all. Say hello proves a new speaker before it carries an alert.">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {devices.length === 0 ? (
            <EmptyState variant="inline" title="No devices yet." description="Add the first table's speaker below." />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {devices.map((d) => (
                <li key={d.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--neu-radius-field)", background: "var(--neu-well)" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{ fontWeight: "var(--weight-medium)" }}>{d.label}</span>
                      <Badge tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "Active" : "Off"}</Badge>
                      <Badge tone="neutral">{DESK_DEVICE_KIND_LABELS[d.kind]}</Badge>
                    </div>
                    <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>
                      {queendoms.find((q) => q.id === d.queendom_id)?.name ?? "Company-wide"}
                      {d.kind === "alexa" && !d.voicemonkey_device ? " · no Voice Monkey device name yet" : ""}
                      {d.last_seen_at ? ` · last seen ${formatRelativeTime(d.last_seen_at)}` : ""}
                    </div>
                  </div>
                  {d.kind === "alexa" && d.is_active && <Button size="sm" variant="secondary" onClick={() => sayHello(d)} loading={pending}>Say hello</Button>}
                  <Button size="sm" variant="ghost" onClick={() => toggleDevice(d)} loading={pending}>{d.is_active ? "Switch off" : "Switch on"}</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="serene-form-row">
            <Field label="Kind" htmlFor="desks-dev-kind">
              <FormSelect id="desks-dev-kind" value={device.kind} onValueChange={(v) => setDevice({ ...device, kind: v as DeskDeviceKind })}>
                {DESK_DEVICE_KINDS.map((k) => <option key={k} value={k}>{DESK_DEVICE_KIND_LABELS[k]}</option>)}
              </FormSelect>
            </Field>
            <Field label="Label" htmlFor="desks-dev-label"><Input id="desks-dev-label" value={device.label} onChange={(e) => setDevice({ ...device, label: e.target.value })} placeholder="Anishqa table" /></Field>
            <Field label="Queendom" htmlFor="desks-dev-q">
              <FormSelect id="desks-dev-q" value={device.queendomId} onValueChange={(v) => setDevice({ ...device, queendomId: v })}>
                <option value="">Company-wide</option>
                {queendoms.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </FormSelect>
            </Field>
          </div>
          <div className="serene-form-row">
            <Field label="Device account" htmlFor="desks-dev-profile" hint="The Serene account the device signs in as; a genie of its queendom.">
              <FormSelect id="desks-dev-profile" value={device.profileId} onValueChange={(v) => setDevice({ ...device, profileId: v })}>
                <option value="">None yet</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </FormSelect>
            </Field>
            {device.kind === "alexa" && (
              <>
                <Field label="Voice Monkey device" htmlFor="desks-dev-vm" hint="The device name in Voice Monkey."><Input id="desks-dev-vm" value={device.voicemonkeyDevice} onChange={(e) => setDevice({ ...device, voicemonkeyDevice: e.target.value })} placeholder="anishqa-table" /></Field>
                <Field label="Alexa device id" htmlFor="desks-dev-alexa" hint="From the skill request; can be filled later."><Input id="desks-dev-alexa" value={device.alexaDeviceId} onChange={(e) => setDevice({ ...device, alexaDeviceId: e.target.value })} /></Field>
              </>
            )}
          </div>
          <div><Button variant="secondary" onClick={addDevice} loading={pending} disabled={!device.label.trim()}>Add device</Button></div>
        </div>
      </SectionCard>

      <SectionCard title="What was said" description="The ledger. Every line, who queued it, where it went, and whether a speaker took it.">
        {ledger.length === 0 ? (
          <EmptyState variant="inline" title="Nothing said yet." description="The first announcement or alert lands here." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {ledger.map((row) => (
              <li key={row.id} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start", padding: "var(--space-3) 0", borderBottom: "1px solid var(--neu-edge)" }}>
                <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "var(--weight-medium)" }}>{row.title}</div>
                  <div className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>{row.spoken || row.body}</div>
                  <div className="type-caption" style={{ color: "var(--theme-text-tertiary)" }}>
                    {row.kind} · {row.source} · {audienceLabel(row.audience, queendoms, devices)} · {formatRelativeTime(row.created_at)}
                    {row.sent_to.length ? ` · ${row.sent_to.length} ${row.sent_to.length === 1 ? "speaker" : "speakers"}` : ""}
                    {row.error ? ` · ${row.error}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
