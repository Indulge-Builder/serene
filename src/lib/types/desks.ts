// types/desks.ts — row types for desk_devices and desk_outbox (migration 0248), hand-declared until
// the next database.ts regen (the types/hands.ts posture). Types only, no runtime values.

import type { DeskAudience, DeskDeviceKind, DeskMessageKind, DeskOutboxStatus, DeskSource } from "@/lib/constants/desks";

export type DeskDeviceRow = {
  id: string;
  kind: DeskDeviceKind;
  label: string;
  queendom_id: string | null;
  profile_id: string | null;
  alexa_device_id: string | null;
  voicemonkey_device: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DeskOutboxRow = {
  id: string;
  kind: DeskMessageKind;
  severity: 1 | 2 | 3;
  audience: DeskAudience;
  title: string;
  body: string;
  spoken: string;
  source: DeskSource;
  created_by: string | null;
  alert_id: string | null;
  conversation_id: string | null;
  status: DeskOutboxStatus;
  sent_to: string[];
  error: string | null;
  not_before: string;
  expires_at: string | null;
  created_at: string;
  sent_at: string | null;
};
