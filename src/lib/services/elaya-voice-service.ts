// SERVER ONLY — THE LiveKit side of Elaya's voice channel (2026-09-28, 0247).
//
// One job: mint the join grant for a call. The browser gets a short-lived token
// for a fresh room; the token itself asks LiveKit to dispatch the voice worker
// (backend/voice/agent.py, registered under ELAYA_VOICE_AGENT_NAME) into that
// room with the caller's VERIFIED profile id as the job metadata. The worker
// trusts that id because only this server can sign it (LIVEKIT_API_SECRET is
// a server secret, S-11), and the Python brain still re-verifies it against
// public.profiles before any model runs — the same trust chain as the
// WhatsApp gate and the Node → brain transport.
//
// Nothing here talks to the brain; the worker does that over the SAME
// /v1/elaya/chat endpoint every other channel uses. Never a second LiveKit
// client, never a token minted anywhere else.

import 'server-only';

import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import {
  ELAYA_VOICE_AGENT_NAME,
  ELAYA_VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
  ELAYA_VOICE_ROOM_MAX_PARTICIPANTS,
  ELAYA_VOICE_ROOM_PREFIX,
  ELAYA_VOICE_TOKEN_TTL_SECONDS,
} from '@/lib/constants/elaya-voice';

export type ElayaVoiceGrant = {
  /** The LiveKit server the browser connects to (wss://…). */
  url: string;
  /** The join token — one room, one identity, minutes of life. */
  token: string;
  /** The room name, for logs and the End button. */
  room: string;
};

function livekitConfig(): { url: string; apiKey: string; apiSecret: string } | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  // The browser will open a WebSocket to this origin; a plain ws:// carries the
  // room token in cleartext outside development.
  if (!/^wss:\/\//i.test(url) && process.env.NODE_ENV === 'production') {
    console.error('[elaya-voice] LIVEKIT_URL must be wss:// in production — refusing');
    return null;
  }
  return { url, apiKey, apiSecret };
}

/** True when the three LIVEKIT_* values are present and sane. */
export function isElayaVoiceConfigured(): boolean {
  return livekitConfig() !== null;
}

/**
 * Mint the join grant for ONE call by a VERIFIED profile. The caller (the action)
 * has already passed requireProfile + hasElayaAccess + the settings switch; this
 * function only signs. Returns null when LiveKit is not configured.
 */
export async function mintElayaVoiceGrant(profile: {
  id: string;
  full_name: string;
}): Promise<ElayaVoiceGrant | null> {
  const config = livekitConfig();
  if (!config) return null;

  const room = `${ELAYA_VOICE_ROOM_PREFIX}${profile.id}-${Date.now().toString(36)}`;

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    // The participant identity IS the profile id: the worker compares it with
    // the job metadata before it listens to a word.
    identity: profile.id,
    name: profile.full_name,
    ttl: ELAYA_VOICE_TOKEN_TTL_SECONDS,
  });
  token.addGrant({
    room,
    roomJoin: true,
    roomCreate: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  // Dispatch is decided by the token, at room creation: the worker joins with
  // the caller's id in hand, so the room can never be answered for someone else.
  token.roomConfig = new RoomConfiguration({
    name: room,
    emptyTimeout: ELAYA_VOICE_ROOM_EMPTY_TIMEOUT_SECONDS,
    maxParticipants: ELAYA_VOICE_ROOM_MAX_PARTICIPANTS,
    agents: [
      new RoomAgentDispatch({
        agentName: ELAYA_VOICE_AGENT_NAME,
        metadata: JSON.stringify({ user_id: profile.id }),
      }),
    ],
  });

  return { url: config.url, token: await token.toJwt(), room };
}
