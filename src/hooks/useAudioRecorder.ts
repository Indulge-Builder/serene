"use client";

// THE microphone recording hook — reusable speech-capture infrastructure
// (voice notes today; Elaya's voice channel later). Owns getUserMedia,
// MediaRecorder codec negotiation, the max-duration auto-stop, and mic-track
// release. Audio only ever exists as an in-memory Blob handed to onComplete —
// this hook never uploads or persists anything itself.

import { useCallback, useEffect, useRef, useState } from "react";

export type AudioRecorderStatus = "idle" | "requesting" | "recording";

export type AudioRecording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

type UseAudioRecorderOptions = {
  /** Delivered on stop (manual or max-duration auto-stop). Not fired on cancel. */
  onComplete: (recording: AudioRecording) => void;
  onError?: (message: string) => void;
  /** Auto-stop cap. Default DEFAULT_MAX_RECORDING_MS (2 minutes). */
  maxDurationMs?: number;
  /** Bitrate hint (browsers may ignore it — Safari AAC in particular). */
  audioBitsPerSecond?: number;
};

// Preference order: opus first (smallest), Safari's mp4/aac last-but-supported.
// The actual chosen type travels with the Blob — consumers must never hardcode it.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Default auto-stop cap — keeps low-bitrate uploads well under the action body limit. */
export const DEFAULT_MAX_RECORDING_MS = 120_000;

/** `m:ss` display for the recording counter — shared by every dictation cluster. */
export function formatRecorderElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const MIC_DENIED_MESSAGE =
  "Microphone access was denied. Allow it in your browser settings to dictate.";
const MIC_UNAVAILABLE_MESSAGE =
  "Couldn't start the microphone. Please check your device and try again.";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useAudioRecorder({
  onComplete,
  onError,
  maxDurationMs = DEFAULT_MAX_RECORDING_MS,
  audioBitsPerSecond = 32_000,
}: UseAudioRecorderOptions) {
  const [status, setStatus] = useState<AudioRecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isSupported, setIsSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest-callback refs so start/stop stay referentially stable.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  useEffect(() => {
    setIsSupported(
      typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    tickRef.current = null;
    maxTimerRef.current = null;
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setStatus("idle");
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      onErrorRef.current?.(denied ? MIC_DENIED_MESSAGE : MIC_UNAVAILABLE_MESSAGE);
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond,
      });
    } catch {
      releaseStream();
      setStatus("idle");
      onErrorRef.current?.(MIC_UNAVAILABLE_MESSAGE);
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      clearTimers();
      releaseStream();
      recorderRef.current = null;
      setStatus("idle");
      setElapsedMs(0);

      if (discardRef.current) return;

      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size === 0) {
        onErrorRef.current?.(MIC_UNAVAILABLE_MESSAGE);
        return;
      }
      onCompleteRef.current({
        blob,
        mimeType: type,
        durationMs: Date.now() - startedAtRef.current,
      });
    };

    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStatus("recording");

    tickRef.current = setInterval(
      () => setElapsedMs(Date.now() - startedAtRef.current),
      250,
    );
    maxTimerRef.current = setTimeout(stop, maxDurationMs);
  }, [audioBitsPerSecond, maxDurationMs, clearTimers, releaseStream, stop]);

  // Unmount mid-recording: discard and release the mic — never leave it open.
  useEffect(() => {
    return () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      clearTimers();
      releaseStream();
    };
  }, [clearTimers, releaseStream]);

  return {
    status,
    isRecording: status === "recording",
    elapsedMs,
    isSupported,
    start,
    stop,
    cancel,
  };
}
