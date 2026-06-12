// THE markdown → WhatsApp text converter (Elaya WhatsApp channel, 2026-06-12).
//
// Models emit markdown no matter what the prompt says; WhatsApp renders its own
// syntax instead (*bold*, _italic_, ~strike~, ``` blocks, "- " bullets). This is
// the deterministic belt-and-braces pass every model-authored WhatsApp reply goes
// through before sending — the persona instruction reduces markdown, this removes it.

// Sentinel for converted bold so the italic pass can't re-match it. U+0000 can
// never appear in model output that survives sanitisation.
const BOLD_MARK = '\u0000';

export function markdownToWhatsApp(text: string): string {
  return (
    text
      // headings have no WhatsApp equivalent — render as a bold line
      .replace(/^#{1,6}\s+(.+)$/gm, `${BOLD_MARK}$1${BOLD_MARK}`)
      // "* item" bullets → "- item" (WhatsApp-native list; also frees * for emphasis)
      .replace(/^(\s*)\*\s+/gm, '$1- ')
      // bold: **x** / __x__ → placeholder (→ *x*)
      .replace(/\*\*([^*\n]+)\*\*/g, `${BOLD_MARK}$1${BOLD_MARK}`)
      .replace(/__([^_\n]+)__/g, `${BOLD_MARK}$1${BOLD_MARK}`)
      // remaining single-asterisk italic → _x_ (content must not start/end with space)
      .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '_$1_')
      // strikethrough: ~~x~~ → ~x~
      .replace(/~~([^~\n]+)~~/g, '~$1~')
      // links: [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      // code fences: drop the language tag (``` itself is valid WhatsApp monospace)
      .replace(/```[a-zA-Z]+\n/g, '```\n')
      .replace(new RegExp(BOLD_MARK, 'g'), '*')
      .trim()
  );
}
