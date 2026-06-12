// ChatMarkdown — THE markdown-lite renderer for model-authored chat text
// (Elaya in-app bubbles). The WhatsApp counterpart is lib/utils/whatsapp-format.ts
// (markdown → WhatsApp's own syntax, outbound); this is the in-app side: the same
// subset the models actually emit (**bold**, *italic*, `code`, [text](url),
// "-"/"1." lists, headings-as-bold-lines, ``` fences) rendered as React elements.
// No dangerouslySetInnerHTML, no markdown dependency — model output can never
// inject HTML. Anything outside the subset falls through as plain text, so a
// half-streamed token (e.g. an unclosed "**Sail") just shows raw until it closes.
// Display-only (A-06), server-component-safe.

import React from 'react';

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string };

// Alternation order matters: code spans first (protect their contents), then
// double-marker bold, strike, links, then single-marker italic. Underscore
// italic requires standalone markers so snake_case identifiers never match.
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(\*\S(?:[^*\n]*\S)?\*)|((?<=^|[\s(])_[^_\n]+_(?=$|[\s).,!?;:]))/g;

function inlineNodes(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = new RegExp(INLINE.source, 'g');
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}.${n++}`;
    if (tok.startsWith('`')) {
      out.push(
        <code key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875em' }}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(
        <strong key={key} style={{ fontWeight: 'var(--weight-semibold)' }}>
          {inlineNodes(tok.slice(2, -2), key)}
        </strong>,
      );
    } else if (tok.startsWith('~~')) {
      out.push(<del key={key}>{tok.slice(2, -2)}</del>);
    } else if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(tok);
      if (link) {
        out.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--theme-accent)',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {link[1]}
          </a>,
        );
      } else {
        out.push(tok);
      }
    } else {
      out.push(<em key={key}>{inlineNodes(tok.slice(1, -1), key)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join('\n') });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const line of content.split('\n')) {
    if (fence) {
      if (/^\s*```/.test(line)) {
        blocks.push({ kind: 'code', text: fence.join('\n') });
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushPara();
      flushList();
      fence = [];
      continue;
    }
    // Marker must be followed by whitespace, so a line opening with "**bold"
    // never reads as a "*" bullet.
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushPara();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((bullet ?? ordered)![1]);
      continue;
    }
    flushList();
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line);
  }
  // Unterminated fence = mid-stream; render what we have so far.
  if (fence) blocks.push({ kind: 'code', text: fence.join('\n') });
  flushPara();
  flushList();
  return blocks;
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <div key={i} style={{ fontWeight: 'var(--weight-semibold)' }}>
              {inlineNodes(block.text, `b${i}`)}
            </div>
          );
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={i}
              style={{
                margin: 0,
                paddingLeft: 'var(--space-5)',
                listStyleType: block.ordered ? 'decimal' : 'disc',
              }}
            >
              {block.items.map((item, j) => (
                <li key={j}>{inlineNodes(item, `b${i}.${j}`)}</li>
              ))}
            </Tag>
          );
        }
        if (block.kind === 'code') {
          return (
            <pre
              key={i}
              style={{
                margin: 0,
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--theme-paper)',
                border: '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {block.text}
            </pre>
          );
        }
        return <div key={i}>{inlineNodes(block.text, `b${i}`)}</div>;
      })}
    </div>
  );
}
