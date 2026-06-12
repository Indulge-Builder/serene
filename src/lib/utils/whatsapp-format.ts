// THE markdown → WhatsApp text converter (Elaya WhatsApp channel, 2026-06-12).
//
// Models emit markdown no matter what the prompt says; WhatsApp renders its own
// syntax instead (*bold*, _italic_, ~strike~, ``` blocks, "- " bullets). This is
// the deterministic belt-and-braces pass every model-authored WhatsApp reply goes
// through before sending — the persona instruction reduces markdown, this removes it.
//
// Single asterisks are treated as markdown italic (the persona tells the model to
// write markdown, never WhatsApp-native syntax) — the converter is the only owner
// of the wire format.

// Sentinel for converted bold so the italic pass can't re-match it. U+0000 can
// never appear in model output that survives sanitisation.
const BOLD_MARK = '\u0000';

export function markdownToWhatsApp(text: string): string {
  return (
    text
      // "* item" bullets → "- item" (WhatsApp-native list; also frees * for emphasis)
      .replace(/^(\s*)\*\s+/gm, '$1- ')
      // bold: **x** / __x__ → placeholder (→ *x*)
      .replace(/\*\*([^*\n]+)\*\*/g, `${BOLD_MARK}$1${BOLD_MARK}`)
      .replace(/__([^_\n]+)__/g, `${BOLD_MARK}$1${BOLD_MARK}`)
      // remaining single-asterisk italic → _x_ (content must not start/end with space)
      .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '_$1_')
      // strikethrough: ~~x~~ → ~x~
      .replace(/~~([^~\n]+)~~/g, '~$1~')
      // headings have no WhatsApp equivalent — render as a bold line. Runs AFTER
      // the emphasis passes; inner sentinels are stripped so a bold heading
      // ("## **X**") collapses to one pair instead of double-wrapping into **X**.
      .replace(
        /^#{1,6}\s+(.+)$/gm,
        (_, heading: string) => `${BOLD_MARK}${heading.split(BOLD_MARK).join('')}${BOLD_MARK}`,
      )
      // links: [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      // code fences: drop the language tag (``` itself is valid WhatsApp monospace)
      .replace(/```[a-zA-Z]+\n/g, '```\n')
      .replace(new RegExp(BOLD_MARK, 'g'), '*')
      .trim()
  );
}

/**
 * Truncate an already-converted WhatsApp reply to `max` chars without leaving
 * an orphaned formatting marker at the cut. An odd count of a pair marker
 * (```, then *, _, ~) after the slice means the cut landed inside a span —
 * everything from the unbalanced opener is dropped. Only the truncation path
 * pays this cost; replies under `max` pass through untouched.
 */
export function truncateWhatsAppText(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = text.slice(0, max);
  // Fences first — a dangling ``` block would swallow the rest of the message.
  if ((out.split('```').length - 1) % 2 === 1) {
    out = out.slice(0, out.lastIndexOf('```'));
  }
  for (const mark of ['*', '_', '~']) {
    if ((out.split(mark).length - 1) % 2 === 1) {
      out = out.slice(0, out.lastIndexOf(mark));
    }
  }
  return out.trimEnd();
}
