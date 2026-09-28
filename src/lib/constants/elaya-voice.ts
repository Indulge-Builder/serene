// THE vocabulary of Elaya's voice channel (2026-09-28, migration 0247).
//
// One real-time door over the same brain: the browser joins a LiveKit room, the
// voice worker (backend/voice) listens and speaks, and every finished sentence
// runs through POST /v1/elaya/chat with `channel: 'voice'` like a typed
// message. Pure data, client-safe: no secrets, no env reads.

/** The channel value stamped on the conversation and both rows of a voice turn. */
export const ELAYA_VOICE_CHANNEL = 'voice' as const;

/**
 * The worker's dispatch name. The access token our server mints asks LiveKit to
 * dispatch THIS agent into the room; the worker registers under the same name
 * (backend/voice/agent.py AGENT_NAME). Change both together or no agent answers.
 */
export const ELAYA_VOICE_AGENT_NAME = 'elaya-voice';

/** Room names: the prefix + the caller's profile id + a time stamp (one room per call). */
export const ELAYA_VOICE_ROOM_PREFIX = 'elaya-voice-';

/** The join token is short-lived: the browser connects the moment it gets it. */
export const ELAYA_VOICE_TOKEN_TTL_SECONDS = 120;

/** An empty room (the caller never connected, or left) is closed by LiveKit after this. */
export const ELAYA_VOICE_ROOM_EMPTY_TIMEOUT_SECONDS = 60;

/** One caller and one agent; nobody else can be let into a call room. */
export const ELAYA_VOICE_ROOM_MAX_PARTICIPANTS = 2;

/** The settings row that switches the door on (`elaya_settings.voice_enabled`, seeded false). */
export const ELAYA_VOICE_SETTING_KEY = 'voice_enabled';
