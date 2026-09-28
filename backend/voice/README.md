# Elaya voice worker

The real-time voice door on Elaya (2026-09-28, migration 0247). A LiveKit agent
that listens in a call room, sends each finished sentence to the same brain every
other channel uses (`POST /v1/elaya/chat`, `channel: "voice"`) and speaks the
reply as it streams. Nothing about Elaya lives here: identity, the daily cap, the
conversation, the tools, the persona and the confirmation rule are the brain's.

## How a call works

1. The Call button on `/elaya` runs `startElayaVoiceCallAction` (Next.js). It checks
   the session, `hasElayaAccess`, the `voice_enabled` settings row and the LiveKit
   env, then mints a room token whose identity is the profile id. The token carries
   a dispatch request for the agent `elaya-voice` with `{ "user_id": … }` as job
   metadata.
2. The browser joins the room and opens the microphone. LiveKit dispatches this
   worker with that metadata.
3. The worker checks the participant's identity is the id in the metadata, then
   starts a session: STT and TTS through LiveKit Inference, turn detection by
   LiveKit's audio turn detector, and `ElayaBrainLLM` as the model.
4. Every finished sentence becomes one brain turn. The brain persists both rows
   with `channel = 'voice'` and streams the reply; the worker speaks the deltas.
   When the brain goes to a tool before saying anything, one short holding line is
   spoken so the call never goes silent.
5. The call ends when the caller hangs up (the room closes) or after
   `VOICE_MAX_CALL_SECONDS`. The transcript is already in `/elaya`.

## Local run

```bash
cd backend/voice
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m livekit.agents download-files   # once: the local turn-detector fallback + VAD
./.venv/bin/python agent.py dev                # connects to LiveKit Cloud, waits for calls
```

Env (a `.env.local` next to `agent.py` is read in dev):

| Var | Meaning |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | the LiveKit Cloud project; the SAME three the Next.js app holds |
| `ELAYA_BRAIN_URL` | the brain (`http://localhost:8321` locally, `http://api:8080` on Fargate) |
| `BRAIN_API_SECRET` | the shared bearer, the same value the brain checks |
| `VOICE_STT_MODEL` / `VOICE_STT_LANGUAGE` | default `deepgram/nova-3` / `multi` (English and Hindi mixed) |
| `VOICE_TTS_MODEL` / `VOICE_TTS_VOICE` / `VOICE_TTS_LANGUAGE` | default `cartesia/sonic-3`, no voice id, `en` |
| `VOICE_TURN_DETECTION` | `livekit` (default) or `stt` (for a turn-aware STT such as Deepgram Flux) |
| `VOICE_MAX_CALL_SECONDS` | one call's ceiling, default 1200 |

The Next.js app needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` too, and
the settings row must be on: `UPDATE elaya_settings SET value = 'true' WHERE key = 'voice_enabled';`

## Deploy (AWS Copilot, service `voice`)

```bash
cd backend
copilot secret init --name LIVEKIT_URL        # once per secret, env prod
copilot secret init --name LIVEKIT_API_KEY
copilot secret init --name LIVEKIT_API_SECRET
copilot secret init --name VOICE_TTS_VOICE    # may be empty
copilot svc init --name voice                 # once
copilot svc deploy --name voice --env prod
```

`BRAIN_API_SECRET` already exists in SSM (the brain's). The service has no port; a
healthy worker shows on the LiveKit Cloud agents page, and every turn shows in the
brain's logs as a `/v1/elaya/chat` call.
