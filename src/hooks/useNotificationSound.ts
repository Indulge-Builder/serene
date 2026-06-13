"use client";

/**
 * useNotificationSound — synthesised C6/E6 chime via Web Audio API.
 * No audio files. AudioContext created lazily on first play.
 * Sound state persists to localStorage: serene:notifications:sound:v1.
 *
 * Pre-mortem rules:
 * - Realtime fires outside a user gesture — context.resume() may silently fail.
 *   Silence is the correct fallback. Never throw or console.error on this path.
 * - Debounce gate: 1500ms between plays. Three rapid inserts → one chime.
 * - SSR-safe: AudioContext is never created if typeof window === 'undefined'.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LS_KEY = "serene:notifications:sound:v1";

export function useNotificationSound() {
  // Start null (unhydrated) — toggle renders nothing until the useEffect below reads
  // localStorage. This avoids the SSR→client flicker: server emits no toggle value,
  // client paint 1 reads the real pref and sets it, no mismatch.
  const [enabled, setEnabledState] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    setEnabledState(stored === null ? true : stored === "true");
  }, []);

  const contextRef   = useRef<AudioContext | null>(null);
  const lastPlayed   = useRef<number>(0);

  // Create AudioContext lazily on mount (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;

    const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    contextRef.current = ctx;

    return () => {
      if (ctx.state !== "closed") {
        ctx.close();
      }
    };
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;

    const context = contextRef.current;
    if (!context) return;

    // Debounce gate: max one chime per 1500ms
    const now = Date.now();
    if (now - lastPlayed.current < 1500) return;
    lastPlayed.current = now;

    // Autoplay guard: Realtime fires outside user gesture — resume silently fails here.
    // If state is suspended after resume attempt, we bail. Silence is correct.
    const doPlay = () => {
      if (context.state !== "running") return;

      const masterGain = context.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(context.destination);

      // Oscillator 1: C6 (1047 Hz)
      const osc1  = context.createOscillator();
      const gain1 = context.createGain();
      osc1.type      = "sine";
      osc1.frequency.value = 1047;
      gain1.gain.setValueAtTime(0.10, context.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(context.currentTime);
      osc1.stop(context.currentTime + 0.45);

      // Oscillator 2: E6 (1318 Hz) — major third chime quality
      const osc2  = context.createOscillator();
      const gain2 = context.createGain();
      osc2.type      = "sine";
      osc2.frequency.value = 1318;
      gain2.gain.setValueAtTime(0.10, context.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(context.currentTime);
      osc2.stop(context.currentTime + 0.45);
    };

    if (context.state === "suspended") {
      context.resume().then(doPlay).catch(() => {
        // Autoplay blocked — silence is correct, never throw
      });
    } else {
      doPlay();
    }
  }, [enabled]);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, String(value));
    }
  }, []);

  return { play, enabled, setEnabled };
}
