# Lia — The AI Presence

> **Purpose:** what Lia is and where she stands.
> **Audience:** everyone. · **Source-of-truth scope:** module status + pointers. Lia's design language is fully specified in `../design/DESIGN-DNA.md` §15.
> **Last verified:** 2026-06-11 · **Status:** in design — not built.

Lia is the agentic AI model that lives inside Eia. She is not a chatbot — she is a presence:
a compass that surfaces the right insight on the right surface at the right moment.

**What is specified today (design only):**

- Full design language — glyph (always breathing when present), four surfaces (Panel,
  Conversation, Inline Suggestion, Action Proposal), motion rules, voice: `DESIGN-DNA.md` §15.
- Operating rules (root `CLAUDE.md` quick reference): inline suggestions always delay 400 ms;
  proposal cards have exactly two actions (Approve / Dismiss); one dot or nothing — never a
  number badge; her colour is always `--theme-accent`; cross-domain insights are always
  labelled with the source domain.
- Privacy constraint that shapes the eventual build: **no raw PII reaches any external AI
  model** (D-01) — pseudonymisation before anything leaves the vault.

**What exists in code:** `src/components/ui/lia-glyph.tsx` (the breathing SVG mark), the `lia`
toast/modal types, and the dormant `is_bot` plumbing on WhatsApp messages. No model
integration, no Lia surfaces are wired.

**Current focus note:** Lia is named as the active build focus alongside client records —
see `../01-vision.md`.
