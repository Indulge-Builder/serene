// whatsapp-export.ts — parseWhatsAppExport(text, opts): THE parser of a WhatsApp "Export chat"
// .txt file (migration 0249, docs/architecture/sia-resilience-plan.md section 8).
//
// Pure, no dependency, no DB: text in, ordered lines out. The import script
// (scripts/sia/import-chat-export.ts) is the only writer built on it.
//
// An export is one message per line, with continuation lines for a message that had line
// breaks. Two shapes exist:
//   Android   29/09/26, 11:21 am - Name: text        (no seconds; am/pm behind a narrow space)
//   iPhone    [29/09/26, 11:21:35 AM] Name: text     (seconds; invisible marks before some lines)
// The sender is a DISPLAY NAME (the exporting phone's saved contact name, a phone number for
// an unsaved contact, or "~ Name" on an iPhone), never a WhatsApp id. Times are the exporting
// phone's local clock. The day/month order follows that phone's locale, so it is detected
// from the file (a first field above 12 can only be a day) and may be forced.

export type WhatsAppExportKind = "text" | "media" | "system" | "deleted";

export type WhatsAppExportLine = {
  /** UTC instant, ISO. Android exports carry no seconds: lines in one minute are spaced one second apart in file order. */
  at: string;
  /** The display name as exported (a leading "~ " removed), or null for a system line. */
  sender: string | null;
  text: string;
  kind: WhatsAppExportKind;
  /** For media: what the placeholder said it was, when it said. */
  media: "image" | "video" | "voice" | "document" | "sticker" | "contact" | null;
  /** 1-based line number of the message's first line in the file. */
  line: number;
};

export type WhatsAppExportResult = {
  lines: WhatsAppExportLine[];
  dateOrder: "dmy" | "mdy";
  /** True when the file itself decided the order; false when it fell back to the default. */
  dateOrderCertain: boolean;
  /** Lines before the first dated line (a stray header), and dated lines whose date was impossible. */
  dropped: number;
};

export type WhatsAppExportOptions = {
  dateOrder?: "dmy" | "mdy";
  /** The exporting phone's offset from UTC in minutes. Default 330 (IST). */
  tzOffsetMinutes?: number;
  /** The group's name: an iPhone export names the GROUP as the sender of system lines. */
  groupSubject?: string | null;
};

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

// day/month/year with / . or -, then the time, then " - " (Android) or "] " (iPhone).
const HEAD =
  /^\[?(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4}),? (\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?: ?([AaPp])\.? ?[Mm]\.?)?(?:\]| -) (.*)$/;

const MEDIA_PATTERNS: [RegExp, WhatsAppExportLine["media"]][] = [
  [/^<media omitted>$/i, null],
  [/^image omitted$/i, "image"],
  [/^video omitted$/i, "video"],
  [/^gif omitted$/i, "video"],
  [/^audio omitted$/i, "voice"],
  [/^sticker omitted$/i, "sticker"],
  [/^document omitted$/i, "document"],
  [/^contact card omitted$/i, "contact"],
  [/^<attached: .+\.(jpe?g|png|webp|heic)>$/i, "image"],
  [/^<attached: .+\.(mp4|mov|3gp)>$/i, "video"],
  [/^<attached: .+\.(opus|ogg|m4a|mp3|aac)>$/i, "voice"],
  [/^<attached: .+>$/i, "document"],
  [/\.(jpe?g|png|webp|heic) \(file attached\)$/i, "image"],
  [/\.(mp4|mov|3gp) \(file attached\)$/i, "video"],
  [/\.(opus|ogg|m4a|mp3|aac) \(file attached\)$/i, "voice"],
  [/\(file attached\)$/i, "document"],
];

// A system line can carry a colon inside a quoted group name ("X changed the subject to "A: B"").
const SYSTEM_VERBS = / (added|removed|left|joined|created group|changed (the|this|to)|was added|were added|reset this|turned (on|off)|pinned a message)\b/i;

const DELETED = /^(this message was deleted|you deleted this message)\.?$/i;
const EDITED_MARK = / ?<this message was edited>$/i;

function clean(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(SPACES, " ");
}

/** Read the file's own evidence for the day/month order. */
function detectDateOrder(rows: string[]): { order: "dmy" | "mdy"; certain: boolean } {
  for (const r of rows) {
    const m = HEAD.exec(r);
    if (!m) continue;
    if (Number(m[1]) > 12) return { order: "dmy", certain: true };
    if (Number(m[2]) > 12) return { order: "mdy", certain: true };
  }
  return { order: "dmy", certain: false };
}

export function parseWhatsAppExport(text: string, opts: WhatsAppExportOptions = {}): WhatsAppExportResult {
  const tz = opts.tzOffsetMinutes ?? 330;
  const subject = opts.groupSubject?.trim().toLowerCase() || null;
  const rows = text.split(/\r?\n/).map(clean);
  const detected = opts.dateOrder ? { order: opts.dateOrder, certain: true } : detectDateOrder(rows);

  const lines: WhatsAppExportLine[] = [];
  let dropped = 0;
  let current: WhatsAppExportLine | null = null;
  // Android has no seconds: keep file order inside a minute by spacing lines a second apart.
  let lastMinute = "";
  let inMinute = 0;

  const close = () => {
    if (!current) return;
    current.text = current.text.replace(EDITED_MARK, "").trimEnd();
    if (current.kind === "text") {
      const t = current.text.trim();
      if (DELETED.test(t)) current.kind = "deleted";
      else {
        for (const [re, media] of MEDIA_PATTERNS) {
          if (re.test(t)) {
            current.kind = "media";
            current.media = media;
            break;
          }
        }
      }
    }
    lines.push(current);
    current = null;
  };

  rows.forEach((row, i) => {
    const m = HEAD.exec(row);
    if (!m) {
      // A continuation of the message above, or a stray line before the first message.
      if (current) current.text += `\n${row}`;
      else if (row.trim()) dropped += 1;
      return;
    }
    close();

    const a = Number(m[1]);
    const b = Number(m[2]);
    const day = detected.order === "dmy" ? a : b;
    const month = detected.order === "dmy" ? b : a;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const meridiem = m[7]?.toLowerCase();
    if (meridiem === "p" && hour < 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      dropped += 1;
      return;
    }

    let second: number;
    if (m[6] !== undefined) second = Number(m[6]);
    else {
      const key = `${year}-${month}-${day} ${hour}:${minute}`;
      inMinute = key === lastMinute ? Math.min(inMinute + 1, 59) : 0;
      lastMinute = key;
      second = inMinute;
    }
    const at = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - tz * 60_000).toISOString();

    const rest = m[8];
    const split = rest.indexOf(": ");
    // A name never holds a line break and is short; a system line ("X added Y") has no colon,
    // or has one deep inside a sentence.
    const head = split > 0 && split <= 60 ? rest.slice(0, split) : null;
    const name = head && !SYSTEM_VERBS.test(head) ? head.replace(/^~ ?/, "").trim() : null;
    const isGroupAsSender = !!name && !!subject && name.toLowerCase() === subject;
    if (!name || isGroupAsSender) {
      current = { at, sender: null, text: isGroupAsSender ? rest.slice(split + 2) : rest, kind: "system", media: null, line: i + 1 };
    } else {
      current = { at, sender: name, text: rest.slice(split + 2), kind: "text", media: null, line: i + 1 };
    }
  });
  close();

  return { lines, dateOrder: detected.order, dateOrderCertain: detected.certain, dropped };
}

/** A display name reduced to what two spellings of one name share: lower case, no marks, single spaces. */
export function normalizeExportName(name: string): string {
  return clean(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}+ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "+91 98765 43210" and friends → digits, or null when the name is not a phone number. */
export function exportNameAsPhoneDigits(name: string): string | null {
  const t = clean(name).trim();
  if (!/^\+?[\d\s()\-]{8,20}$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}
