// Elaya presence card content — curated, deterministic, zero AI calls on login.
//
// The Elaya card (dashboard, agent layout) greets by IST time-of-day and shows
// one line per agent per IST day. Rotation is hashString(`${userId}:${dayKey}`)
// — same agent + same day → same line; different agents on the same day spread
// across the list. Never replace this with a model call at login (the future
// Elaya layer lazy-loads post-ship; this file is the pre-ship voice).

import { hashString } from '@/lib/utils/strings';
import type { AppDomain, UserRole } from '@/lib/types/database';
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

/**
 * Curated composer starters — prefill the composer only, never auto-send. This is the generic
 * list (the mobile screen, and any surface that does not know the viewer); the /elaya identity
 * card asks `getElayaStarters(viewer)` for the questions that fit the person's role.
 */
export const ELAYA_STARTER_PROMPTS = [
  "What's on my plate today?",
  'Which of my leads are going cold?',
  'How are my numbers looking this month?',
  'Find me a case about price objections.',
] as const;

/** Who is looking at the card: the two things that decide what Elaya can read for them. */
export type ElayaViewer = { role: UserRole; domain: AppDomain };

/**
 * The questions worth asking, by who is asking (2026-09-19). Written the way people type them;
 * a [bracket] is a blank the person fills in before sending. Keep each list to six: the card
 * is a nudge, not a manual. Kept in step with the tools in lib/elaya/tools/registry.ts.
 */
export function getElayaStarters(viewer: ElayaViewer | null): readonly string[] {
  if (!viewer) return ELAYA_STARTER_PROMPTS;
  const { role, domain } = viewer;
  if (role === 'founder' || role === 'admin') {
    return [
      "What's happening right now?",
      'Which members are waiting on a reply?',
      'Brief me on [member name] before I call them.',
      "What's open in Freshdesk today, and what is escalated?",
      'How much are we owed, and who owes the most?',
      'Which genie resolved the most tickets this month, and how fast?',
    ];
  }
  if (domain === 'concierge') {
    return [
      'Brief me on [member name] before I call them.',
      'What did [member name] ask for this week?',
      "What's open in Freshdesk for my queendom?",
      'Did [member name] ever mention [a place, a brand, a dish]?',
      'Who do we use for [a florist in Goa]?',
      "What's on my plate today?",
    ];
  }
  if (domain === 'finance' || domain === 'tech') {
    return [
      'Which bills are overdue?',
      'What renews this month?',
      "What's on my plate today?",
      'Create a task: [what], due [when].',
    ];
  }
  if (role === 'manager') {
    return [
      "What's slipping in my domain?",
      'Which of our leads are going cold?',
      'How is my team doing this month?',
      'What did the team do today?',
      'Which campaigns are working this month?',
      'Show me the WhatsApp chat with [lead name].',
    ];
  }
  return [
    "What's on my plate today?",
    'Which of my leads are going cold?',
    'How are my numbers looking this month?',
    'Show me the WhatsApp chat with [lead name].',
    'Find me a case about price objections.',
    'Remind me to call [lead name] tomorrow at 11.',
  ];
}

/** What Elaya can read for this viewer, as short labels for the card (icons live in the card). */
export type ElayaCapabilityKey =
  | 'members' | 'groups' | 'freshdesk' | 'tickets' | 'vendors' | 'leads' | 'lead_chats' | 'tasks'
  | 'deals' | 'performance' | 'campaigns' | 'activity' | 'books' | 'subscriptions' | 'cases' | 'analyst';

export const ELAYA_CAPABILITY_LABELS: Record<ElayaCapabilityKey, string> = {
  members: 'Members: profile, chats, requests, money',
  groups: 'The WhatsApp groups',
  freshdesk: 'Freshdesk',
  tickets: 'Sia tickets',
  vendors: 'Vendors',
  leads: 'Leads and deals',
  lead_chats: 'WhatsApp chats with leads',
  tasks: 'Tasks',
  deals: 'Deals',
  performance: 'Performance',
  campaigns: 'Campaigns and budget',
  activity: 'What the team did today',
  books: 'The books (Zoho)',
  subscriptions: 'Subscriptions and bills',
  cases: 'Case library',
  analyst: 'Anything else, worked out from the data',
};

export function getElayaCapabilities(viewer: ElayaViewer | null): readonly ElayaCapabilityKey[] {
  if (!viewer) return ['leads', 'tasks', 'deals', 'performance', 'cases'];
  const { role, domain } = viewer;
  if (role === 'founder' || role === 'admin') {
    return ['members', 'groups', 'freshdesk', 'tickets', 'vendors', 'leads', 'lead_chats', 'tasks', 'performance', 'campaigns', 'activity', 'books', 'subscriptions', 'analyst'];
  }
  if (domain === 'concierge') return ['members', 'groups', 'freshdesk', 'tickets', 'vendors', 'tasks'];
  if (domain === 'finance' || domain === 'tech') return ['subscriptions', 'tasks'];
  if (role === 'manager') return ['leads', 'lead_chats', 'deals', 'performance', 'campaigns', 'activity', 'tasks', 'cases'];
  return ['leads', 'lead_chats', 'tasks', 'deals', 'performance', 'cases'];
}

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

/** The founder's playbooks page (migration 0234): how a KIND of question is answered, editable without a deploy. */
export const ELAYA_PLAYBOOKS_PATH = '/settings/elaya-playbooks';
