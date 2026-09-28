'use client';

// Elaya's voice call — THE browser side of the voice channel (2026-09-28, 0247).
//
// Three pieces over one small hook, so the chat shell composes them where they
// belong and owns every state it already owns (the transcript, the status line):
//
//   useElayaVoiceCall  — start (the action mints the grant → join the room →
//                        open the mic) / end / the status; one LiveKit Room,
//                        released on hang-up or when the room closes.
//   ElayaVoiceButton   — the 32px composer control beside the mic (the
//                        DictationButton's own material, so the pair reads as one).
//   ElayaVoicePanel    — the live row above the composer: what the caller is
//                        saying and what Elaya is saying, as captions, and End.
//                        It also hands every FINISHED line to the shell (onTurn),
//                        so the call appears in the chat as it happens; the
//                        rows themselves were persisted by the brain, and the
//                        page reloads with them.
//
// Nothing here talks to the brain: the worker (backend/voice) does, over the
// same endpoint as typing. Never a second LiveKit connection in the app.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneCall, PhoneOff } from 'lucide-react';
import { Room, RoomEvent } from 'livekit-client';
import { RoomAudioRenderer, RoomContext, useTranscriptions, useVoiceAssistant } from '@livekit/components-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { ElayaGlyphDisc } from '@/components/ui/elaya-glyph';
import { ElayaStatusText } from '@/components/elaya/ElayaStatusText';
import { startElayaVoiceCallAction } from '@/lib/actions/elaya-voice';
import { formErrors } from '@/lib/validations/form-errors';

export type ElayaVoiceStatus = 'idle' | 'starting' | 'live';

export type ElayaVoiceTurn = { id: string; role: 'user' | 'assistant'; content: string };

export type ElayaVoiceCall = {
  status: ElayaVoiceStatus;
  room: Room | null;
  start: () => Promise<void>;
  end: () => void;
};

export function useElayaVoiceCall(opts: {
  onError: (message: string) => void;
  onEnded?: () => void;
}): ElayaVoiceCall {
  const [status, setStatus] = useState<ElayaVoiceStatus>('idle');
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const { onError, onEnded } = opts;

  const release = useCallback(() => {
    roomRef.current = null;
    setRoom(null);
    setStatus('idle');
    onEnded?.();
  }, [onEnded]);

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setStatus('starting');
    const result = await startElayaVoiceCallAction();
    if (result.error || !result.data) {
      setStatus('idle');
      onError(result.error ?? formErrors.elayaVoiceUnavailable);
      return;
    }
    const next = new Room();
    roomRef.current = next;
    next.on(RoomEvent.Disconnected, release);
    try {
      await next.connect(result.data.url, result.data.token);
      await next.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      console.error('[elaya-voice] join failed:', e instanceof Error ? e.message : e);
      next.off(RoomEvent.Disconnected, release);
      await next.disconnect().catch(() => {});
      roomRef.current = null;
      setStatus('idle');
      onError(formErrors.elayaVoiceUnavailable);
      return;
    }
    setRoom(next);
    setStatus('live');
  }, [onError, release]);

  const end = useCallback(() => {
    const current = roomRef.current;
    if (!current) return;
    // Disconnected fires → release(); the room closes on the server once empty.
    void current.disconnect();
  }, []);

  // Leaving the page mid-call hangs up; the worker sees the room empty and stops.
  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return { status, room, start, end };
}

/** The composer control: PhoneCall to start, PhoneOff while live. */
export function ElayaVoiceButton({ call, disabled = false }: { call: ElayaVoiceCall; disabled?: boolean }) {
  const live = call.status === 'live';
  const busy = call.status === 'starting';
  const blocked = disabled && !live;
  const label = live ? 'End the call' : busy ? 'Connecting…' : 'Call Elaya';
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={live ? call.end : () => void call.start()}
        disabled={live ? false : blocked || busy}
        aria-label={label}
        className="serene-pressable"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          // A live call is an active state: the rose wash + chip shadow, like recording.
          background: live ? 'var(--color-danger-light)' : 'transparent',
          boxShadow: live ? 'var(--neu-shadow-chip)' : 'none',
          color: live ? 'var(--color-danger-text)' : 'var(--theme-accent)',
          cursor: blocked && !live ? 'not-allowed' : 'pointer',
          opacity: blocked && !live ? 0.45 : 1,
          flexShrink: 0,
          transition: 'opacity 150ms, background 150ms, box-shadow 150ms',
        }}
      >
        {live ? (
          <PhoneOff style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 1.5 }} />
        ) : (
          <PhoneCall style={{ width: '0.9rem', height: '0.9rem', strokeWidth: 1.5 }} />
        )}
      </button>
    </Tooltip>
  );
}

/** What the presence header says while a call is on. */
function voiceStatusLine(state: string): string {
  switch (state) {
    case 'connecting':
    case 'initializing':
      return 'Connecting…';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking';
    default:
      return 'On the call';
  }
}

export function ElayaVoicePanel({
  call,
  onTurn,
  onStatus,
}: {
  call: ElayaVoiceCall;
  /** A FINISHED line, the caller's or Elaya's; the shell appends it to the transcript. */
  onTurn: (turn: ElayaVoiceTurn) => void;
  /** The header status while the call is on; null when it ends. */
  onStatus: (line: string | null) => void;
}) {
  if (!call.room) return null;
  return (
    <RoomContext.Provider value={call.room}>
      <RoomAudioRenderer />
      <VoicePanelBody call={call} onTurn={onTurn} onStatus={onStatus} />
    </RoomContext.Provider>
  );
}

function VoicePanelBody({
  call,
  onTurn,
  onStatus,
}: {
  call: ElayaVoiceCall;
  onTurn: (turn: ElayaVoiceTurn) => void;
  onStatus: (line: string | null) => void;
}) {
  const { state } = useVoiceAssistant();
  const segments = useTranscriptions();
  const me = call.room?.localParticipant.identity;
  const handed = useRef(new Set<string>());

  useEffect(() => {
    onStatus(voiceStatusLine(state));
    return () => onStatus(null);
  }, [state, onStatus]);

  // A segment is final once the stream says so; hand each one to the shell once.
  useEffect(() => {
    for (const seg of segments) {
      const info = seg.streamInfo;
      if (info.attributes?.['lk.transcription_final'] !== 'true') continue;
      if (handed.current.has(info.id)) continue;
      const content = seg.text.trim();
      if (!content) continue;
      handed.current.add(info.id);
      onTurn({
        id: `voice-${info.id}`,
        role: seg.participantInfo.identity === me ? 'user' : 'assistant',
        content,
      });
    }
  }, [segments, me, onTurn]);

  // Live captions: the newest line each way, final or not.
  const latest = (mine: boolean) =>
    [...segments].reverse().find((s) => (s.participantInfo.identity === me) === mine)?.text ?? '';
  const youSaid = latest(true);
  const sheSaid = latest(false);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center"
      style={{
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--theme-paper-subtle)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <ElayaGlyphDisc size={28} thinking={state === 'thinking'} />
      <div className="flex flex-col min-w-0 flex-1" style={{ gap: '2px' }}>
        <span
          className="italic truncate"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}
        >
          <ElayaStatusText text={voiceStatusLine(state)} />
        </span>
        {youSaid && (
          <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
            You: {youSaid}
          </span>
        )}
        {sheSaid && (
          <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-primary)' }}>
            Elaya: {sheSaid}
          </span>
        )}
      </div>
      <Button variant="ghost-danger" size="sm" type="button" onClick={call.end} aria-label="End the call">
        <PhoneOff className="w-4 h-4" strokeWidth={1.5} />
        End
      </Button>
    </div>
  );
}
