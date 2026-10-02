"use client";

// "Correct" under a message the Indulge concierge sent (0252, plan section 12): the agent writes
// what she should have said; it lands in the corrections queue on the library page.

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { recordBotCorrectionAction } from "@/lib/actions/public-bot";

interface BotCorrectButtonProps {
  conversationId: string;
  messageId: string;
  whatSheSaid: string;
}

const field: React.CSSProperties = {
  width: "100%", padding: "var(--space-3)", background: "var(--theme-paper)",
  border: "1px solid var(--theme-paper-border)", borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)", color: "var(--theme-text-primary)", resize: "vertical", lineHeight: "var(--leading-normal)",
};

export function BotCorrectButton({ conversationId, messageId, whatSheSaid }: BotCorrectButtonProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!text.trim()) {
      setError("Write what she should have said.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await recordBotCorrectionAction({ conversationId, messageId, shouldHaveSaid: text, note: note.trim() || undefined });
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success("Thank you. The correction is with the founders.");
      setOpen(false);
      setText("");
      setNote("");
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" size="xs" type="button" onClick={() => setOpen(true)} style={{ fontSize: "var(--text-2xs)" }}>
          Correct
        </Button>
      </div>
      <Modal
        open={open}
        onClose={pending ? () => {} : () => setOpen(false)}
        title="Correct the concierge"
        error={error ? <p style={{ fontSize: "var(--text-sm)", color: "var(--color-danger-text)", margin: 0 }}>{error}</p> : undefined}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" type="button" onClick={save} loading={pending}>Send correction</Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <p className="label-micro" style={{ margin: "0 0 var(--space-2)" }}>She said</p>
            <p style={{ ...field, margin: 0, background: "var(--theme-paper-subtle)", whiteSpace: "pre-wrap" }}>{whatSheSaid}</p>
          </div>
          <div>
            <label htmlFor="bot-correct-text" className="label-micro block mb-2">She should have said</label>
            <textarea id="bot-correct-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="serene-input" style={field} />
          </div>
          <div>
            <label htmlFor="bot-correct-note" className="label-micro block mb-2">Why (optional)</label>
            <input id="bot-correct-note" value={note} onChange={(e) => setNote(e.target.value)} className="serene-input" style={{ ...field, height: "2.5rem" }} />
          </div>
        </div>
      </Modal>
    </>
  );
}
