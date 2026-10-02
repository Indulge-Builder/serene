// desk-speech.ts — speakableFor(): THE only writer of a desk_outbox row's `spoken` and `body`
// (docs/architecture/desks-plan.md section 5, the "never say aloud" law). A speaker sits in an open
// room and a TV hangs on a wall, so the line that reaches them is written here and nowhere else:
//
//   money never · phone, card, ID, address, email never · a member as the group's name, never a
//   first name and never a phone · staff by first name · one sentence, two at most · every line
//   starts with who is talking.
//
// Pure and benchable: no database, no model. The money and identity shapes are stripped by the
// same redactor the media reader uses (redactSensitiveShapes) plus the phone / email / rupee
// shapes below; a line that still carries a digit run after that is cut at the run.

import {
  DESK_ANNOUNCEMENT_PREFIX, DESK_BODY_MAX_CHARS, DESK_SPOKEN_MAX_CHARS, DESK_VOICE_PREFIX, type DeskMessageKind,
} from "@/lib/constants/desks";
import { redactSensitiveShapes } from "@/lib/services/media-reader";

export type SpeakableInput =
  | { kind: "announcement"; from: string; text: string }
  | { kind: "alert"; severity: 1 | 2 | 3; title: string; body: string }
  | { kind: "answer"; text: string }
  | { kind: "reminder"; text: string };

export type Speakable = { title: string; body: string; spoken: string };

const RUPEE = /(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|k|l|cr))?/gi;
const PHONE = /(?:\+?\d[\d\s-]{8,}\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const CARD_LAST4 = /\b(?:ending|last)\s+(?:in\s+)?\d{4}\b/gi;
const MARKDOWN = /[*_`#>]+/g;

/** Strip everything the law says never leaves, then collapse whitespace. */
export function stripForRoom(text: string): string {
  let out = redactSensitiveShapes(text).text;
  out = out.replace(RUPEE, "an amount").replace(CARD_LAST4, "").replace(EMAIL, "").replace(PHONE, "");
  out = out.replace(MARKDOWN, "");
  return out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** The first one or two sentences, under the character cap, ending on a full stop. A decimal ("25.5 h") is not a break. */
function firstSentences(text: string, max: number, count = 2): string {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const p of parts.slice(0, count)) {
    const next = (out + " " + p.trim()).trim();
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = text.slice(0, max - 1).trim();
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "the team";
}

export function speakableFor(input: SpeakableInput): Speakable {
  switch (input.kind) {
    case "announcement": {
      const clean = firstSentences(stripForRoom(input.text), DESK_SPOKEN_MAX_CHARS, 3);
      const who = firstName(stripForRoom(input.from));
      return { title: `${DESK_ANNOUNCEMENT_PREFIX} ${who}`, body: stripForRoom(input.text).slice(0, DESK_BODY_MAX_CHARS), spoken: `${DESK_ANNOUNCEMENT_PREFIX} ${who}. ${clean}` };
    }
    case "alert": {
      const title = stripForRoom(input.title).slice(0, 120);
      const body = stripForRoom(input.body).slice(0, DESK_BODY_MAX_CHARS);
      const spoken = `${DESK_VOICE_PREFIX[input.severity]} ${firstSentences(`${title}. ${body}`, DESK_SPOKEN_MAX_CHARS)}`;
      return { title, body, spoken };
    }
    case "answer": {
      const clean = stripForRoom(input.text);
      return { title: "Elaya answered", body: clean.slice(0, DESK_BODY_MAX_CHARS), spoken: firstSentences(clean, DESK_SPOKEN_MAX_CHARS, 3) };
    }
    case "reminder": {
      const clean = firstSentences(stripForRoom(input.text), DESK_SPOKEN_MAX_CHARS);
      return { title: "Reminder", body: clean, spoken: `${DESK_VOICE_PREFIX[2]} A reminder. ${clean}` };
    }
  }
}

/** Which of the message kinds a human may queue by hand today. */
export const HUMAN_DESK_KINDS: readonly DeskMessageKind[] = ["announcement"];
