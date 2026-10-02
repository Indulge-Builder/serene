'use client';
// ElayaChatsWorkspace — THE admin view of everyone's chats with Elaya (2026-09-29; /settings/elaya-chats,
// admin/founder). The Sia / WhatsApp layout (ui/SplitWorkspace): the people who have talked to her in
// the rail, one person's whole history in the pane, every session and channel in one thread with a
// divider where a new session starts. Under each of her replies: the time, the channel, the specialist
// and playbook, the tools she called, whether the turn failed, and "Correct" (the Requests queue).
// Display + selection state only (A-06); reads through actions/elaya-chats.ts.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, MessagesSquare, PencilLine } from 'lucide-react';
import { SplitWorkspace, SplitRail, SplitRailHeader, SplitRailList, SplitPane } from '@/components/ui/SplitWorkspace';
import { ConversationRailRow } from '@/components/ui/ConversationRailRow';
import { SelectionButton } from '@/components/ui/SelectionButton';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { ElayaMessageBubble } from '@/components/elaya/ElayaMessageBubble';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import { formatDate, formatRelativeTime } from '@/lib/utils/dates';
import { formatCount } from '@/lib/utils/numbers';
import { getElayaChatPageAction } from '@/lib/actions/elaya-chats';
import { ROLE_LABELS } from '@/lib/constants/roles';
import { ELAYA_CHAT_CHANNEL_FILTERS, ELAYA_CHAT_CHANNEL_LABELS, ELAYA_CHATS_PERSON_PARAM } from '@/lib/constants/elaya';
import { ELAYA_REQUEST_STATUS_LABELS, type ElayaRequestKind } from '@/lib/constants/elaya-memory';
import type { ElayaChatMessage, ElayaChatPerson } from '@/lib/services/elaya-chats-service';
import type { CorrectTarget } from '@/components/settings/ElayaReplyCorrectDialog';

const ElayaReplyCorrectDialog = dynamic(
  () => import('@/components/settings/ElayaReplyCorrectDialog').then((m) => m.ElayaReplyCorrectDialog),
  { ssr: false },
);

type ChannelFilter = 'all' | (typeof ELAYA_CHAT_CHANNEL_FILTERS)[number];
const CHANNEL_FILTERS: ChannelFilter[] = ['all', ...ELAYA_CHAT_CHANNEL_FILTERS];

function channelLine(p: ElayaChatPerson): string {
  const parts = ELAYA_CHAT_CHANNEL_FILTERS
    .filter((c) => (p.byChannel[c] ?? 0) > 0)
    .map((c) => `${ELAYA_CHAT_CHANNEL_LABELS[c]} ${formatCount(p.byChannel[c] ?? 0)}`);
  return [p.role ? ROLE_LABELS[p.role] : null, ...parts].filter(Boolean).join(' · ');
}

export function ElayaChatsWorkspace({ people, initialUserId }: { people: ElayaChatPerson[]; initialUserId: string | null }) {
  const isMobile = useMediaQuery(MQ.mobile);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlUserId = searchParams.get(ELAYA_CHATS_PERSON_PARAM);
  const pushedEntry = useRef(false);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialUserId);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [messages, setMessages] = useState<ElayaChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<CorrectTarget | null>(null);
  const dialogMounted = useMountOnFirstOpen(correcting !== null);

  const scrollRef = useRef<HTMLDivElement>(null);
  // After a load: 'bottom' = land on the newest message; a number = the scrollHeight before older
  // messages were put on top, so the reader stays where they were.
  const scrollIntent = useRef<'bottom' | number | null>(null);
  // A slow answer for a person (or channel) no longer on screen never overwrites the current one.
  const seq = useRef(0);

  const selected = people.find((p) => p.userId === selectedId) ?? null;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, search]);

  const load = useCallback(async (userId: string, ch: ChannelFilter) => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    setMessages([]);
    const res = await getElayaChatPageAction({ user_id: userId, ...(ch === 'all' ? {} : { channel: ch }) });
    if (mine !== seq.current) return;
    setLoading(false);
    if (res.error || !res.data) { setError(res.error ?? 'Those messages could not be loaded just now.'); return; }
    scrollIntent.current = 'bottom';
    setMessages(res.data.messages);
    setHasMore(res.data.hasMore);
  }, []);

  useEffect(() => {
    if (selectedId) void load(selectedId, channel);
  }, [selectedId, channel, load]);

  async function loadEarlier() {
    if (!selectedId || loadingMore || messages.length === 0) return;
    const mine = seq.current;
    setLoadingMore(true);
    const res = await getElayaChatPageAction({
      user_id: selectedId,
      before: messages[0]!.createdAt,
      ...(channel === 'all' ? {} : { channel }),
    });
    setLoadingMore(false);
    if (mine !== seq.current) return;
    if (res.error || !res.data) { setError(res.error ?? 'Earlier messages could not be loaded just now.'); return; }
    scrollIntent.current = scrollRef.current?.scrollHeight ?? null;
    const page = res.data;
    setMessages((prev) => [...page.messages, ...prev]);
    setHasMore(page.hasMore);
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const intent = scrollIntent.current;
    if (!el || intent === null) return;
    scrollIntent.current = null;
    el.scrollTop = intent === 'bottom' ? el.scrollHeight : el.scrollHeight - intent + el.scrollTop;
  }, [messages]);

  // The open person lives in the URL: a deep link opens them, and below md an open chat is a
  // history entry so hardware Back closes it (the Sia / WhatsApp rule).
  function select(userId: string) {
    if (userId === selectedId) return;
    setChannel('all');
    setSelectedId(userId);
    const next = new URLSearchParams(searchParams.toString());
    next.set(ELAYA_CHATS_PERSON_PARAM, userId);
    const url = `${pathname}?${next.toString()}`;
    if (isMobile && !urlUserId) {
      window.history.pushState(null, '', url);
      pushedEntry.current = true;
    } else {
      window.history.replaceState(null, '', url);
    }
  }

  function closeOnMobile() {
    setSelectedId(null);
    if (pushedEntry.current) {
      pushedEntry.current = false;
      window.history.back();
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete(ELAYA_CHATS_PERSON_PARAM);
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (!isMobile) return;
    if (urlUserId === null && selectedId !== null) {
      pushedEntry.current = false;
      setSelectedId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlUserId, isMobile]);

  function markFlagged(messageId: string, kind: ElayaRequestKind) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, flag: { status: 'open', kind } } : m)));
  }

  const showRail = !isMobile || selected === null;
  const showPane = !isMobile || selected !== null;

  return (
    <>
      <SplitWorkspace>
        {showRail && (
          <SplitRail>
            <SplitRailHeader>
              <SearchBar value={search} onChange={setSearch} placeholder="Search people" size="sm" aria-label="Search people" />
              <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
                People · {formatCount(people.length)}
              </span>
            </SplitRailHeader>
            <SplitRailList>
              {visible.length === 0 ? (
                <div className="py-10 px-4">
                  <EmptyState variant="inline" title={search ? 'Nobody by that name.' : 'Nobody has talked to Elaya yet.'} />
                </div>
              ) : (
                visible.map((p, i) => (
                  <ConversationRailRow
                    key={p.userId}
                    title={p.name}
                    meta={formatRelativeTime(p.lastAt)}
                    preview={channelLine(p)}
                    selected={p.userId === selectedId}
                    index={i}
                    onSelect={() => select(p.userId)}
                  />
                ))
              )}
            </SplitRailList>
          </SplitRail>
        )}

        {showPane && (selected ? (
          <SplitPane>
            <div className="shrink-0 px-4 py-2.5 border-b border-(--theme-paper-border) bg-(--theme-paper) flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <Button
                    variant="ghost"
                    iconOnly
                    size="sm"
                    type="button"
                    onClick={closeOnMobile}
                    aria-label="Back to people"
                    className="serene-pressable serene-touch shrink-0 w-8 h-8 rounded-full border border-(--theme-paper-border) bg-(--theme-paper) flex items-center justify-center text-(--theme-text-secondary)"
                  >
                    <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                  </Button>
                )}
                <Avatar name={selected.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="type-body-sm font-(--weight-medium) text-(--theme-text-primary) truncate">{selected.name}</div>
                  <div className="type-caption text-(--theme-text-tertiary) truncate">
                    {formatCount(selected.messages)} messages · {formatCount(selected.sessions)} sessions · last {formatRelativeTime(selected.lastAt)}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {CHANNEL_FILTERS.map((c) => {
                  const active = channel === c;
                  const count = c === 'all' ? selected.messages : selected.byChannel[c] ?? 0;
                  if (c !== 'all' && count === 0) return null;
                  return (
                    <SelectionButton
                      key={c}
                      appearance="choice"
                      selected={active}
                      aria-pressed={active}
                      type="button"
                      onClick={() => setChannel(c)}
                      className="serene-pressable serene-touch type-caption rounded-full border-0 shrink-0"
                      style={{ padding: '3px 11px' }}
                    >
                      {c === 'all' ? 'All' : ELAYA_CHAT_CHANNEL_LABELS[c]}
                      <span className="tabular-nums" style={{ opacity: 0.72, marginLeft: '4px', fontFamily: 'var(--font-mono)' }}>
                        {formatCount(count)}
                      </span>
                    </SelectionButton>
                  );
                })}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4" style={{ background: 'var(--theme-paper)' }}>
              {loading ? (
                <div className="h-full flex items-center justify-center"><LogoSpinner size="md" /></div>
              ) : error && messages.length === 0 ? (
                <EmptyState variant="inline" title="These messages did not load." description={error} />
              ) : messages.length === 0 ? (
                <EmptyState variant="inline" title="Nothing on this channel." description="Pick another channel above, or All." />
              ) : (
                <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
                  {hasMore && (
                    <div className="flex justify-center">
                      <Button variant="control" size="sm" onClick={loadEarlier} loading={loadingMore} disabled={loadingMore}>
                        Earlier messages
                      </Button>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <ChatRow
                      key={m.id}
                      message={m}
                      newSession={i === 0 || messages[i - 1]!.conversationId !== m.conversationId}
                      onCorrect={() => setCorrecting({ messageId: m.id, reply: m.content, personName: selected.name })}
                    />
                  ))}
                </div>
              )}
            </div>
          </SplitPane>
        ) : (
          <SplitPane className="hidden md:flex items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="Select a person."
              description="Their chats with Elaya open here, on every channel, with a way to correct any reply."
              style={{ flex: 1, minHeight: 0 }}
            />
          </SplitPane>
        ))}
      </SplitWorkspace>

      {dialogMounted && (
        <ElayaReplyCorrectDialog target={correcting} onClose={() => setCorrecting(null)} onSaved={markFlagged} />
      )}
    </>
  );
}

function ChatRow({ message: m, newSession, onCorrect }: { message: ElayaChatMessage; newSession: boolean; onCorrect: () => void }) {
  const isReply = m.role === 'assistant';
  const meta: string[] = [formatDate(m.createdAt, 'HH:mm'), ELAYA_CHAT_CHANNEL_LABELS[m.channel] ?? m.channel];
  if (isReply && m.specialist) meta.push(m.specialist);
  if (isReply && m.playbook) meta.push(`playbook: ${m.playbook}`);

  const below = (
    <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
      <span>{meta.join(' · ')}</span>
      {isReply && m.tools.length > 0 && (
        <Tooltip label={m.tools.join(', ')}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {m.tools.length === 1 ? m.tools[0] : `${m.tools.length} tools`}
          </span>
        </Tooltip>
      )}
      {m.briefSlot && <Badge size="xs" tone="info">Brief</Badge>}
      {m.failed && <Badge size="xs" tone="danger">Turn failed</Badge>}
      {m.flag && (
        <Badge size="xs" tone={m.flag.status === 'open' ? 'warning' : 'neutral'}>
          Flagged · {ELAYA_REQUEST_STATUS_LABELS[m.flag.status]}
        </Badge>
      )}
      {isReply && (
        <Button variant="ghost" size="xs" onClick={onCorrect} className="serene-touch">
          <PencilLine className="w-3.5 h-3.5" strokeWidth={1.5} />
          Correct
        </Button>
      )}
    </div>
  );

  return (
    <>
      {newSession && (
        <div className="flex items-center" style={{ gap: 'var(--space-3)', margin: 'var(--space-2) 0' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--theme-paper-border)' }} />
          <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)', whiteSpace: 'nowrap' }}>
            Session · {formatDate(m.createdAt, 'dd MMM yyyy, HH:mm')}
          </span>
          <span style={{ flex: 1, height: 1, background: 'var(--theme-paper-border)' }} />
        </div>
      )}
      <ElayaMessageBubble message={{ id: m.id, role: m.role, content: m.content }} below={below} />
    </>
  );
}
