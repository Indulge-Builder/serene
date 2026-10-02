"use client";

// HandsGuidesCard — the two editable hands documents on /settings/hands (2026-10-01): the rulebook
// the outside agent receives, and the guide Elaya follows when she writes to it. Edit either by
// hand, or write feedback and let Elaya rewrite both. Every save is a new version; any earlier
// version can be brought back. Elaya reads the current text on her next hands read (no deploy).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Textarea } from "@/components/ui/Field";
import { toast } from "@/lib/toast";
import { improveHandsGuidesAction, restoreHandsGuideAction, saveHandsGuideAction } from "@/lib/actions/hands";
import { HANDS_FEEDBACK_MAX_CHARS, HANDS_GUIDE_LABELS, HANDS_GUIDE_MAX_CHARS, type HandsGuideKind } from "@/lib/constants/hands";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { HandsGuideDoc, HandsGuideVersion } from "@/lib/types/hands";

const SOURCE_LABEL: Record<HandsGuideVersion["source"], string> = { default: "Built in", edit: "Edited", feedback: "From feedback", restore: "Restored" };

const DESCRIPTIONS: Record<HandsGuideKind, string> = {
  rulebook: "What the agent is told about working with us. Send it from a Talk thread with the agent (Send the rulebook) whenever it changes or the agent seems to forget.",
  elaya_guide: "How Elaya writes to the agent. She reads this every time she drafts a line or reads a Hands conversation. Privacy is not up to this text: names, phones, cards, IDs and addresses are blocked before anything is sent.",
};

function versionLine(v: HandsGuideVersion): string {
  const who = v.by ? ` by ${v.by}` : "";
  const when = v.at ? `, ${formatRelativeTime(v.at)}` : "";
  return `${SOURCE_LABEL[v.source]}${who}${when}`;
}

function GuideEditor({ kind, doc, onSaved }: { kind: HandsGuideKind; doc: HandsGuideDoc; onSaved: (d: HandsGuideDoc) => void }) {
  const [text, setText] = useState(doc.body);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();
  const dirty = text.trim() !== doc.body.trim();
  const id = `hands-guide-${kind}`;

  const save = () => start(async () => {
    const r = await saveHandsGuideAction({ kind, body: text, note: null });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not save."); return; }
    onSaved(r.data);
    setText(r.data.body);
    toast.success(kind === "rulebook" ? "Saved. Send it to the agent from the Talk thread." : "Saved. Elaya follows it from her next line.");
  });

  const restore = (version: number) => start(async () => {
    const r = await restoreHandsGuideAction({ kind, version });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not restore."); return; }
    onSaved(r.data);
    setText(r.data.body);
    toast.success(`Version ${version} is back, saved as version ${r.data.version}.`);
  });

  return (
    <SectionCard
      title={HANDS_GUIDE_LABELS[kind]}
      description={DESCRIPTIONS[kind]}
      headerRight={<Badge tone="neutral">Version {doc.version}</Badge>}
    >
      <Field label="Text" htmlFor={id} hint={doc.version > 0 ? versionLine(doc) + (doc.note ? `: ${doc.note}` : "") : "The built-in text. Saving makes it version 1."}>
        <Textarea id={id} rows={kind === "rulebook" ? 8 : 9} maxLength={HANDS_GUIDE_MAX_CHARS} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: "var(--space-3)" }}>
        <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>Save</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setText(doc.body)} disabled={pending}>Undo changes</Button>}
        {doc.history.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
            {showHistory ? "Hide earlier versions" : `Earlier versions (${doc.history.length})`}
          </Button>
        )}
      </div>
      {showHistory && (
        <div className="flex flex-col gap-2" style={{ marginTop: "var(--space-3)" }}>
          {doc.history.map((v) => (
            <div key={`${v.version}-${v.at ?? "default"}`} style={{ padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--theme-paper-border)", background: "var(--theme-paper-subtle)" }}>
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: "var(--space-2)" }}>
                <span className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>Version {v.version} · {versionLine(v)}{v.note ? `: ${v.note}` : ""}</span>
                <Button size="sm" variant="ghost" onClick={() => restore(v.version)} disabled={pending}>Restore</Button>
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-xs)", color: "var(--theme-text-secondary)" }}>{v.body}</pre>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function HandsGuidesCard({ initial }: { initial: { rulebook: HandsGuideDoc; guide: HandsGuideDoc } }) {
  const router = useRouter();
  const [docs, setDocs] = useState(initial);
  const [feedback, setFeedback] = useState("");
  const [lastChange, setLastChange] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A rewrite replaces both editors' text; the key forces them to take the new version.
  const [round, setRound] = useState(0);

  const improve = () => start(async () => {
    const r = await improveHandsGuidesAction({ feedback, threadId: null });
    if (r.error || !r.data) { toast.danger(r.error ?? "Could not rewrite."); return; }
    const { changed, summary } = r.data;
    setDocs({ rulebook: r.data.rulebook, guide: r.data.guide });
    setRound((n) => n + 1);
    setFeedback("");
    const what = changed.rulebook && changed.guide ? "Both documents" : changed.rulebook ? "The rulebook" : changed.guide ? "Elaya's guide" : null;
    setLastChange(what ? `${what} updated${summary ? `: ${summary}` : "."}` : "Nothing needed to change.");
    toast.success(what ? `${what} updated. Each earlier version is kept.` : "Elaya read the feedback; nothing needed to change.");
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Teach Elaya" description="Say in plain words what should change about how we work with the agent. Elaya rewrites the rulebook and her own guide, saves each as a new version, and you can bring back any earlier one.">
        <Field label="Your feedback" htmlFor="hands-feedback" hint="For example: ask for two options, not five. Or: the agent keeps asking for the guest's name, tell it bookings are in our desk's name.">
          <Textarea id="hands-feedback" rows={3} maxLength={HANDS_FEEDBACK_MAX_CHARS} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: "var(--space-3)" }}>
          <Button size="sm" onClick={improve} loading={pending} disabled={!feedback.trim()}>Rewrite with Elaya</Button>
          {lastChange && <span className="type-caption" style={{ color: "var(--theme-text-secondary)" }}>{lastChange}</span>}
        </div>
      </SectionCard>
      <GuideEditor key={`rulebook-${round}`} kind="rulebook" doc={docs.rulebook} onSaved={(d) => setDocs((s) => ({ ...s, rulebook: d }))} />
      <GuideEditor key={`guide-${round}`} kind="elaya_guide" doc={docs.guide} onSaved={(d) => setDocs((s) => ({ ...s, guide: d }))} />
    </div>
  );
}
