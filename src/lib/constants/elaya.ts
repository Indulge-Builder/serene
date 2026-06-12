// Elaya presence card content — curated, deterministic, zero AI calls on login.
//
// The Elaya card (dashboard, agent layout) greets by IST time-of-day and shows
// one line per agent per IST day. Rotation is hashString(`${userId}:${dayKey}`)
// — same agent + same day → same line; different agents on the same day spread
// across the list. Never replace this with a model call at login (the future
// Elaya layer lazy-loads post-ship; this file is the pre-ship voice).

import { hashString } from '@/lib/utils/strings';
import { toIst } from '@/lib/utils/ist';

/** Curated daily lines — light, warm, never corporate. Edit freely; order matters only for rotation. */
export const ELAYA_DAILY_LINES = [
  'Every call is a door. Knock like you mean it.',
  'Luxury is patience wearing a good watch.',
  'I counted your leads while you slept. They missed you.',
  'A follow-up today beats a brilliant excuse tomorrow.',
  'The pipeline rewards the persistent, not the loud.',
  'Somewhere out there a lead is hoping you call first.',
  'Charm is free. Use it generously.',
  'Small notes today, big deals tomorrow.',
  'I would make you coffee if I had hands.',
  'Win the morning and the dashboard wins with you.',
  'Cold leads are just warm leads taking a nap.',
  'Listen twice as much as you pitch. The numbers agree.',
  'Today’s "new" column is tomorrow’s "won" column in disguise.',
  'Grace under pressure closes more than pressure ever did.',
] as const;

/** IST time-of-day salutation for the Elaya card. */
export function getElayaTimeGreeting(now: Date): string {
  const { hour } = toIst(now);
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Deterministic line of the day for one agent — date + agent id, no randomness. */
export function pickElayaDailyLine(userId: string, now: Date): string {
  const { year, month, day } = toIst(now);
  const key = `${userId}:${year}-${month + 1}-${day}`;
  return ELAYA_DAILY_LINES[hashString(key) % ELAYA_DAILY_LINES.length];
}
