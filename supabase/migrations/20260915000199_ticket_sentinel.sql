-- 0199 — the sentinel's mailbox, alarm clock and pool (client-ticket-plan.md 7.6)
--
-- One sentinel per ticket: identity = the ticket row, state = sentinel_state, alarm clock =
-- next_wake_at. This migration gives it the three pieces of plumbing the plan names:
--   * the MAILBOX: a row landing in ticket_events (by anyone but the sentinel itself) or in
--     ticket_message_links sets next_wake_at = now() on the ticket, so the next sweep reads it;
--   * the POOL: claim_sentinel_wakes() hands a worker up to p_limit due tickets under
--     FOR UPDATE SKIP LOCKED and leases them for p_lease_min minutes (a crashed worker's
--     tickets come back on their own; several workers are safe);
--   * SLEEP: sentinel_sleep() writes the state and the next alarm without an event, so the
--     diary holds only what happened, never the bookkeeping.
-- All three are service-role only; the worker is the Trigger.dev task (or the laptop loop).

CREATE OR REPLACE FUNCTION sia.wake_sentinel_on_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, public AS $$
BEGIN
  IF NEW.actor_kind <> 'sentinel' THEN
    UPDATE sia.tickets SET next_wake_at = now(), wake_reason = 'event:' || NEW.event_type
    WHERE id = NEW.ticket_id AND status NOT IN ('closed', 'dropped');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sia_ticket_events_wake ON sia.ticket_events;
CREATE TRIGGER sia_ticket_events_wake AFTER INSERT ON sia.ticket_events
  FOR EACH ROW EXECUTE FUNCTION sia.wake_sentinel_on_event();

CREATE OR REPLACE FUNCTION sia.wake_sentinel_on_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, public AS $$
BEGIN
  IF NEW.ticket_id IS NOT NULL THEN
    UPDATE sia.tickets SET next_wake_at = now(), wake_reason = 'message:' || NEW.link_kind
    WHERE id = NEW.ticket_id AND status NOT IN ('closed', 'dropped');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sia_ticket_links_wake ON sia.ticket_message_links;
CREATE TRIGGER sia_ticket_links_wake AFTER INSERT ON sia.ticket_message_links
  FOR EACH ROW EXECUTE FUNCTION sia.wake_sentinel_on_link();

-- The pool: due tickets, oldest alarm first, leased so two workers never take the same one.
CREATE OR REPLACE FUNCTION sia.claim_sentinel_wakes(p_limit integer DEFAULT 20, p_lease_min integer DEFAULT 5)
RETURNS SETOF sia.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sia, public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id FROM sia.tickets
    WHERE next_wake_at <= now() AND status NOT IN ('closed', 'dropped')
    ORDER BY next_wake_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sia.tickets t
  SET next_wake_at = now() + make_interval(mins => p_lease_min)
  FROM due WHERE t.id = due.id
  RETURNING t.*;
END;
$$;

-- Sleep: the state and the next alarm, no event.
CREATE OR REPLACE FUNCTION sia.sentinel_sleep(p_ticket_id uuid, p_state jsonb, p_next_wake_at timestamptz, p_wake_reason text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = sia, public AS $$
  UPDATE sia.tickets
  SET sentinel_state = p_state, next_wake_at = p_next_wake_at, wake_reason = p_wake_reason
  WHERE id = p_ticket_id;
$$;

REVOKE ALL ON FUNCTION sia.claim_sentinel_wakes(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sia.sentinel_sleep(uuid, jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sia.claim_sentinel_wakes(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION sia.sentinel_sleep(uuid, jsonb, timestamptz, text) TO service_role;

-- Every live ticket that has never been woken gets its first alarm now.
UPDATE sia.tickets SET next_wake_at = now(), wake_reason = 'born'
WHERE next_wake_at IS NULL AND status NOT IN ('closed', 'dropped');
