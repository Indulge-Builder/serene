-- 0202 — Members: the customer is a member. Every "client" object becomes a "member" object.
--
-- Why: Indulge sells memberships, so the person is a member; "client" also collides with two
-- other meanings in this codebase (the Supabase client, React client components). Decided
-- with the founder 2026-09-17. This migration RENAMES ONLY: no table is dropped, no row is
-- deleted, no column changes type. Every statement is a catalog change, and the whole file
-- runs in one transaction, so it either lands completely or not at all.
--
-- What it renames (the live inventory taken from a schema dump, 2026-09-17):
--   A. tables      clients → members; client_* → member_* (11 satellites + the 40 monthly
--                  partitions of client_events + its default partition)
--   B. columns     client_id → member_id everywhere (satellites, sia.tickets / ticket_events /
--                  extraction_runs / wag_groups / wag_contacts, freshdesk.tickets / contacts,
--                  public.deals / vendor_engagements); sia.tickets.last_client_update_at →
--                  last_member_update_at; sia.ticket_sla_policies.client_silence_min →
--                  member_silence_min
--   C. functions   client_visible → member_visible, can_access_client_queendom →
--                  can_access_member_queendom (the RLS gates: new bodies, every policy that
--                  named them re-created against the new one, then the old dropped);
--                  sia.create_ticket / sia.apply_ticket_change re-declared (JSON key
--                  member_id); freshdesk.ticket_overview re-declared (p_client → p_member)
--   D. names       every index, constraint, trigger, policy and sequence whose NAME carries
--                  "client" is renamed client → member (cosmetic, but the next engineer reads
--                  one vocabulary, not two)
--   E. values      our OWN stored vocabularies that say client: ticket status awaiting_client,
--                  resolution cancelled_by_client, event actor_kind client, link_kind
--                  client_reply, notification types/keys ticket_client_*, relation entity_kind
--                  client, WhatsApp group_kind client and participant_role client, access-log
--                  surface clients_page. Each: drop CHECK → UPDATE the rows → add the CHECK
--                  back with the new word. The ticket tables are empty today; wag_groups /
--                  wag_contacts / member_access_log rows are updated in place.
--   F. deals.member_id gains its foreign key to members (the column was born without one,
--                  "FK deferred to the clients migration"; zero rows carry a value today)
--
-- NOT renamed on purpose: vendors.category_source 'client-excluded' (a vendor-import label,
-- not the member), find_vendors_by_history's stop-word list ('client' is a word people type),
-- and the changelog (history is not rewritten).
--
-- Rollback = the same statements with the two words swapped; nothing here loses information.

-- ─── A. Tables ───────────────────────────────────────────────────────────────

ALTER TABLE public.clients              RENAME TO members;
ALTER TABLE public.client_people        RENAME TO member_people;
ALTER TABLE public.client_facts         RENAME TO member_facts;
ALTER TABLE public.client_relations     RENAME TO member_relations;
ALTER TABLE public.client_events        RENAME TO member_events;
ALTER TABLE public.client_documents     RENAME TO member_documents;
ALTER TABLE public.client_chunks        RENAME TO member_chunks;
ALTER TABLE public.client_snapshot      RENAME TO member_snapshot;
ALTER TABLE public.client_health_policy RENAME TO member_health_policy;
ALTER TABLE public.client_health_events RENAME TO member_health_events;
ALTER TABLE public.client_anticipations RENAME TO member_anticipations;
ALTER TABLE public.client_access_log    RENAME TO member_access_log;

-- The monthly partitions of the diary (client_events_2024_01 … client_events_default).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname ~ '^client_events_'
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', r.relname, replace(r.relname, 'client_events_', 'member_events_'));
  END LOOP;
END $$;

-- ─── B. Columns ──────────────────────────────────────────────────────────────
-- A partitioned parent's RENAME COLUMN recurses into every partition (member_events, sia.ticket_events).

ALTER TABLE public.member_people        RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_facts         RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_relations     RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_events        RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_documents     RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_chunks        RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_snapshot      RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_health_events RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_anticipations RENAME COLUMN client_id TO member_id;
ALTER TABLE public.member_access_log    RENAME COLUMN client_id TO member_id;
ALTER TABLE public.deals                RENAME COLUMN client_id TO member_id;
ALTER TABLE public.vendor_engagements   RENAME COLUMN client_id TO member_id;
ALTER TABLE sia.tickets                 RENAME COLUMN client_id TO member_id;
ALTER TABLE sia.ticket_events           RENAME COLUMN client_id TO member_id;
ALTER TABLE sia.extraction_runs         RENAME COLUMN client_id TO member_id;
ALTER TABLE sia.wag_groups              RENAME COLUMN client_id TO member_id;
ALTER TABLE sia.wag_contacts            RENAME COLUMN client_id TO member_id;
ALTER TABLE freshdesk.tickets           RENAME COLUMN client_id TO member_id;
ALTER TABLE freshdesk.contacts          RENAME COLUMN client_id TO member_id;

ALTER TABLE sia.tickets             RENAME COLUMN last_client_update_at TO last_member_update_at;
ALTER TABLE sia.ticket_sla_policies RENAME COLUMN client_silence_min    TO member_silence_min;

-- ─── C. Functions ────────────────────────────────────────────────────────────

-- C1. The two RLS gates, new names + new bodies (the old ones stay until every policy moved).
CREATE OR REPLACE FUNCTION public.can_access_member_queendom(p_queendom uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT get_user_role() IN ('admin', 'founder')
      OR (p_queendom IS NOT NULL AND p_queendom = get_user_queendom());
$$;
REVOKE ALL ON FUNCTION public.can_access_member_queendom(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_member_queendom(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.member_visible(p_member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = p_member_id AND can_access_member_queendom(m.queendom_id)
  );
$$;
REVOKE ALL ON FUNCTION public.member_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_visible(uuid) TO authenticated, service_role;

-- C2. Every policy that names an old gate is re-created verbatim against the new one
-- (same name, same command, same roles, same permissive/restrictive; names get the D pass).
DO $$
DECLARE
  p record; v_qual text; v_chk text; v_roles text; v_cmd text; v_sql text;
BEGIN
  FOR p IN
    SELECT pol.polname, n.nspname, c.relname, pol.polcmd, pol.polpermissive, pol.polroles,
           pg_get_expr(pol.polqual, pol.polrelid)      AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS chk
    FROM pg_policy pol
    JOIN pg_class c     ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')      ~ 'client_visible|can_access_client_queendom'
       OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'client_visible|can_access_client_queendom'
  LOOP
    v_qual := replace(replace(p.qual, 'client_visible', 'member_visible'), 'can_access_client_queendom', 'can_access_member_queendom');
    v_chk  := replace(replace(p.chk,  'client_visible', 'member_visible'), 'can_access_client_queendom', 'can_access_member_queendom');
    IF p.polroles = '{0}'::oid[] THEN
      v_roles := 'PUBLIC';
    ELSE
      SELECT string_agg(quote_ident(rolname), ', ') INTO v_roles FROM pg_roles WHERE oid = ANY (p.polroles);
    END IF;
    v_cmd := CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;
    EXECUTE format('DROP POLICY %I ON %I.%I', p.polname, p.nspname, p.relname);
    v_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                    p.polname, p.nspname, p.relname,
                    CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END, v_cmd, v_roles);
    IF v_qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF v_chk  IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_chk); END IF;
    EXECUTE v_sql;
  END LOOP;
END $$;

DROP FUNCTION public.client_visible(uuid);
DROP FUNCTION public.can_access_client_queendom(uuid);

-- C3. The ticket RPCs: same signatures, member_id in the row and the JSON key.
CREATE OR REPLACE FUNCTION sia.create_ticket(p_ticket jsonb, p_event jsonb)
RETURNS sia.tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sia, public AS $$
DECLARE
  v_row sia.tickets;
BEGIN
  INSERT INTO sia.tickets (
    member_id, queendom_id, origin, origin_ref, group_jid, category, sub_category, item, title, brief, checklist,
    priority, priority_approved_at, priority_approved_by, status, requested_for,
    first_response_due_at, next_update_due_at, resolve_due_at,
    assignee_id, bishop_id, created_by, created_by_kind, proposed_by_run_id, freshdesk_id, next_wake_at, wake_reason
  ) VALUES (
    (p_ticket->>'member_id')::uuid, NULLIF(p_ticket->>'queendom_id', '')::uuid,
    p_ticket->>'origin', COALESCE(p_ticket->'origin_ref', '{}'::jsonb), p_ticket->>'group_jid',
    p_ticket->>'category', p_ticket->>'sub_category', p_ticket->>'item', p_ticket->>'title',
    COALESCE(p_ticket->'brief', '{}'::jsonb), COALESCE(p_ticket->'checklist', '[]'::jsonb),
    COALESCE(p_ticket->>'priority', 'medium'),
    NULLIF(p_ticket->>'priority_approved_at', '')::timestamptz, NULLIF(p_ticket->>'priority_approved_by', '')::uuid,
    COALESCE(p_ticket->>'status', 'open'), NULLIF(p_ticket->>'requested_for', '')::timestamptz,
    NULLIF(p_ticket->>'first_response_due_at', '')::timestamptz, NULLIF(p_ticket->>'next_update_due_at', '')::timestamptz,
    NULLIF(p_ticket->>'resolve_due_at', '')::timestamptz,
    NULLIF(p_ticket->>'assignee_id', '')::uuid, NULLIF(p_ticket->>'bishop_id', '')::uuid,
    NULLIF(p_ticket->>'created_by', '')::uuid, COALESCE(p_ticket->>'created_by_kind', 'human'),
    NULLIF(p_ticket->>'proposed_by_run_id', '')::uuid, NULLIF(p_ticket->>'freshdesk_id', '')::bigint,
    NULLIF(p_ticket->>'next_wake_at', '')::timestamptz, p_ticket->>'wake_reason'
  ) RETURNING * INTO v_row;

  INSERT INTO sia.ticket_events (ticket_id, member_id, queendom_id, actor_kind, actor_id, event_type, body, meta, run_id)
  VALUES (v_row.id, v_row.member_id, v_row.queendom_id,
          COALESCE(p_event->>'actor_kind', 'human'), NULLIF(p_event->>'actor_id', '')::uuid,
          COALESCE(p_event->>'event_type', 'created'), p_event->>'body', COALESCE(p_event->'meta', '{}'::jsonb),
          NULLIF(p_event->>'run_id', '')::uuid);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION sia.apply_ticket_change(p_ticket_id uuid, p_patch jsonb, p_event jsonb)
RETURNS sia.tickets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = sia, public AS $$
DECLARE
  v_row sia.tickets;
BEGIN
  UPDATE sia.tickets SET
    status                = COALESCE(p_patch->>'status', status),
    priority              = COALESCE(p_patch->>'priority', priority),
    priority_approved_at  = CASE WHEN p_patch ? 'priority_approved_at' THEN NULLIF(p_patch->>'priority_approved_at', '')::timestamptz ELSE priority_approved_at END,
    priority_approved_by  = CASE WHEN p_patch ? 'priority_approved_by' THEN NULLIF(p_patch->>'priority_approved_by', '')::uuid ELSE priority_approved_by END,
    assignee_id           = CASE WHEN p_patch ? 'assignee_id' THEN NULLIF(p_patch->>'assignee_id', '')::uuid ELSE assignee_id END,
    bishop_id             = CASE WHEN p_patch ? 'bishop_id' THEN NULLIF(p_patch->>'bishop_id', '')::uuid ELSE bishop_id END,
    title                 = COALESCE(p_patch->>'title', title),
    category              = COALESCE(p_patch->>'category', category),
    sub_category          = CASE WHEN p_patch ? 'sub_category' THEN NULLIF(p_patch->>'sub_category', '') ELSE sub_category END,
    item                  = CASE WHEN p_patch ? 'item' THEN NULLIF(p_patch->>'item', '') ELSE item END,
    brief                 = COALESCE(p_patch->'brief', brief),
    checklist             = COALESCE(p_patch->'checklist', checklist),
    money                 = COALESCE(p_patch->'money', money),
    tags                  = CASE WHEN p_patch ? 'tags' THEN COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_patch->'tags') AS x), '{}'::text[]) ELSE tags END,
    summary               = CASE WHEN p_patch ? 'summary' THEN NULLIF(p_patch->>'summary', '') ELSE summary END,
    requested_for         = CASE WHEN p_patch ? 'requested_for' THEN NULLIF(p_patch->>'requested_for', '')::timestamptz ELSE requested_for END,
    first_response_due_at = CASE WHEN p_patch ? 'first_response_due_at' THEN NULLIF(p_patch->>'first_response_due_at', '')::timestamptz ELSE first_response_due_at END,
    next_update_due_at    = CASE WHEN p_patch ? 'next_update_due_at' THEN NULLIF(p_patch->>'next_update_due_at', '')::timestamptz ELSE next_update_due_at END,
    resolve_due_at        = CASE WHEN p_patch ? 'resolve_due_at' THEN NULLIF(p_patch->>'resolve_due_at', '')::timestamptz ELSE resolve_due_at END,
    first_responded_at    = CASE WHEN p_patch ? 'first_responded_at' THEN NULLIF(p_patch->>'first_responded_at', '')::timestamptz ELSE first_responded_at END,
    last_member_update_at = CASE WHEN p_patch ? 'last_member_update_at' THEN NULLIF(p_patch->>'last_member_update_at', '')::timestamptz ELSE last_member_update_at END,
    handoff_department    = CASE WHEN p_patch ? 'handoff_department' THEN NULLIF(p_patch->>'handoff_department', '') ELSE handoff_department END,
    vendor_id             = CASE WHEN p_patch ? 'vendor_id' THEN NULLIF(p_patch->>'vendor_id', '')::uuid ELSE vendor_id END,
    closed_at             = CASE WHEN p_patch ? 'closed_at' THEN NULLIF(p_patch->>'closed_at', '')::timestamptz ELSE closed_at END,
    resolution            = CASE WHEN p_patch ? 'resolution' THEN NULLIF(p_patch->>'resolution', '') ELSE resolution END,
    satisfaction          = CASE WHEN p_patch ? 'satisfaction' THEN NULLIF(p_patch->>'satisfaction', '')::smallint ELSE satisfaction END,
    sentinel_state        = COALESCE(p_patch->'sentinel_state', sentinel_state),
    next_wake_at          = CASE WHEN p_patch ? 'next_wake_at' THEN NULLIF(p_patch->>'next_wake_at', '')::timestamptz ELSE next_wake_at END,
    wake_reason           = CASE WHEN p_patch ? 'wake_reason' THEN NULLIF(p_patch->>'wake_reason', '') ELSE wake_reason END
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO sia.ticket_events (ticket_id, member_id, queendom_id, actor_kind, actor_id, event_type, body, meta, run_id)
  VALUES (v_row.id, v_row.member_id, v_row.queendom_id,
          COALESCE(p_event->>'actor_kind', 'human'), NULLIF(p_event->>'actor_id', '')::uuid,
          COALESCE(p_event->>'event_type', 'observation'), p_event->>'body', COALESCE(p_event->'meta', '{}'::jsonb),
          NULLIF(p_event->>'run_id', '')::uuid);
  RETURN v_row;
END;
$$;

-- C4. The /freshdesk overview: p_client → p_member (a parameter rename needs DROP + CREATE).
DROP FUNCTION freshdesk.ticket_overview(integer[], bigint, bigint, text, integer, timestamptz, timestamptz, text, uuid, timestamptz);
CREATE FUNCTION freshdesk.ticket_overview(
  p_status      integer[]   DEFAULT NULL,
  p_group       bigint      DEFAULT NULL,
  p_agent       bigint      DEFAULT NULL,
  p_category    text        DEFAULT NULL,
  p_priority    integer     DEFAULT NULL,
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_search      text        DEFAULT NULL,
  p_member      uuid        DEFAULT NULL,
  p_today_start timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = freshdesk, pg_temp
AS $$
  WITH per_status AS (
    SELECT
      b.status,
      count(*)                                                        AS n,
      count(*) FILTER (WHERE b.m)                                     AS n_matching,
      count(*) FILTER (WHERE b.m AND b.fd_created_at >= p_today_start) AS created_today,
      count(*) FILTER (WHERE b.m AND b.resolved_at   >= p_today_start) AS resolved_today,
      count(*) FILTER (WHERE b.m AND b.is_escalated)                  AS escalated
    FROM (
      SELECT
        t.status, t.fd_created_at, t.resolved_at, t.is_escalated,
        (p_status IS NULL OR cardinality(p_status) = 0 OR t.status = ANY (p_status)) AS m
      FROM freshdesk.tickets t
      WHERE t.deleted = false
        AND t.spam = false
        AND (p_group    IS NULL OR t.group_id     = p_group)
        AND (p_agent    IS NULL OR t.responder_id = p_agent)
        AND (p_category IS NULL OR t.category     = p_category)
        AND (p_priority IS NULL OR t.priority     = p_priority)
        AND (p_from     IS NULL OR t.fd_created_at >= p_from)
        AND (p_to       IS NULL OR t.fd_created_at <= p_to)
        AND (p_member   IS NULL OR t.member_id     = p_member)
        AND (
          p_search IS NULL OR p_search = ''
          OR t.subject        ILIKE '%' || p_search || '%'
          OR t.requester_name ILIKE '%' || p_search || '%'
          OR (p_search ~ '^[0-9]{1,18}$' AND t.id = p_search::bigint)
        )
    ) b
    GROUP BY b.status
  )
  SELECT jsonb_build_object(
    'by_status',      COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', n) ORDER BY status), '[]'::jsonb),
    'total',          COALESCE(sum(n_matching), 0),
    'open',           COALESCE(sum(n_matching)  FILTER (WHERE status NOT IN (4, 5)), 0),
    'created_today',  COALESCE(sum(created_today), 0),
    'resolved_today', COALESCE(sum(resolved_today), 0),
    'escalated_open', COALESCE(sum(escalated)   FILTER (WHERE status NOT IN (4, 5)), 0)
  )
  FROM per_status;
$$;
REVOKE ALL ON FUNCTION freshdesk.ticket_overview(integer[], bigint, bigint, text, integer, timestamptz, timestamptz, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION freshdesk.ticket_overview(integer[], bigint, bigint, text, integer, timestamptz, timestamptz, text, uuid, timestamptz)
  TO service_role;
COMMENT ON FUNCTION freshdesk.ticket_overview IS
  'The /freshdesk overview strip in one scan: by_status (all filters except status), total/open/created_today/resolved_today/escalated_open (all filters). Service role only; the admin/founder page gate is the trust boundary.';

-- ─── D. Names: indexes, constraints, triggers, policies, sequences ───────────

DO $$
DECLARE r record;
BEGIN
  -- indexes
  FOR r IN
    SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND n.nspname IN ('public', 'sia', 'freshdesk') AND c.relname LIKE '%client%'
  LOOP
    EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', r.nspname, r.relname, replace(replace(r.relname, 'clients', 'members'), 'client', 'member'));
  END LOOP;
  -- constraints (a FK / PK / UNIQUE / CHECK is renamed on its own table; partitions carry copies with their own names)
  FOR r IN
    SELECT n.nspname, c.relname AS tbl, con.conname FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'sia', 'freshdesk') AND con.conname LIKE '%client%'
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid AND con.conislocal = false)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I', r.nspname, r.tbl, r.conname, replace(replace(r.conname, 'clients', 'members'), 'client', 'member'));
  END LOOP;
  -- triggers
  FOR r IN
    SELECT n.nspname, c.relname AS tbl, t.tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'sia', 'freshdesk') AND t.tgname LIKE '%client%'
  LOOP
    EXECUTE format('ALTER TRIGGER %I ON %I.%I RENAME TO %I', r.tgname, r.nspname, r.tbl, replace(replace(r.tgname, 'clients', 'members'), 'client', 'member'));
  END LOOP;
  -- policies
  FOR r IN
    SELECT n.nspname, c.relname AS tbl, pol.polname FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'sia', 'freshdesk') AND pol.polname LIKE '%client%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I RENAME TO %I', r.polname, r.nspname, r.tbl, replace(replace(r.polname, 'clients', 'members'), 'client', 'member'));
  END LOOP;
  -- sequences
  FOR r IN
    SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname IN ('public', 'sia', 'freshdesk') AND c.relname LIKE '%client%'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I RENAME TO %I', r.nspname, r.relname, replace(replace(r.relname, 'clients', 'members'), 'client', 'member'));
  END LOOP;
END $$;

-- ─── E. Our own stored vocabularies ──────────────────────────────────────────
-- Pattern per list: drop the CHECK, move the rows, add the CHECK back with the new word.

-- sia.tickets.status
ALTER TABLE sia.tickets DROP CONSTRAINT tickets_status_check;
UPDATE sia.tickets SET status = 'awaiting_member' WHERE status = 'awaiting_client';
ALTER TABLE sia.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('proposed', 'open', 'sourcing', 'awaiting_member', 'awaiting_vendor', 'in_delivery', 'payment_due', 'resolved', 'closed', 'dropped'));

-- sia.tickets.resolution
ALTER TABLE sia.tickets DROP CONSTRAINT tickets_resolution_check;
UPDATE sia.tickets SET resolution = 'cancelled_by_member' WHERE resolution = 'cancelled_by_client';
ALTER TABLE sia.tickets ADD CONSTRAINT tickets_resolution_check
  CHECK (resolution IN ('delivered', 'cancelled_by_member', 'could_not_source', 'duplicate', 'not_a_request'));

-- sia.ticket_events.actor_kind (partitioned: the parent's CHECK reaches every partition)
ALTER TABLE sia.ticket_events DROP CONSTRAINT ticket_events_actor_kind_check;
UPDATE sia.ticket_events SET actor_kind = 'member' WHERE actor_kind = 'client';
UPDATE sia.ticket_events SET event_type = replace(event_type, 'client_', 'member_') WHERE event_type LIKE 'client_%';
ALTER TABLE sia.ticket_events ADD CONSTRAINT ticket_events_actor_kind_check
  CHECK (actor_kind IN ('human', 'sentinel', 'intake', 'elaya', 'system', 'member'));

-- sia.ticket_message_links.link_kind
ALTER TABLE sia.ticket_message_links DROP CONSTRAINT ticket_message_links_link_kind_check;
UPDATE sia.ticket_message_links SET link_kind = 'member_reply' WHERE link_kind = 'client_reply';
ALTER TABLE sia.ticket_message_links ADD CONSTRAINT ticket_message_links_link_kind_check
  CHECK (link_kind IN ('origin', 'update', 'member_reply', 'staff_reply', 'attachment'));

-- public.notifications.type
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
UPDATE public.notifications SET type = replace(type, 'ticket_client_', 'ticket_member_') WHERE type LIKE 'ticket_client_%';
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('lead_assigned', 'lead_won', 'task_due', 'task_assigned', 'mention', 'system', 'sla_breach_agent', 'sla_breach_manager', 'sla_breach_founder', 'task_overdue_manager', 'suggestion_resolved', 'ticket_assigned', 'ticket_proposed', 'ticket_sla_warning', 'ticket_sla_breach', 'ticket_member_replied', 'ticket_member_unhappy'));

-- public.notification_preferences.notification_key
ALTER TABLE public.notification_preferences DROP CONSTRAINT notification_preferences_notification_key_check;
UPDATE public.notification_preferences SET notification_key = 'ticket_member_unhappy' WHERE notification_key = 'ticket_client_unhappy';
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_notification_key_check
  CHECK (notification_key IN ('lead_assigned', 'new_lead_founder_alert', 'lead_won', 'deal_created', 'task_assigned', 'task_due', 'task_overdue_manager', 'sla_breach', 'sla_escalation', 'ticket_proposed_for_approval', 'ticket_sla_warning', 'ticket_sla_breach_manager', 'ticket_member_unhappy', 'ticket_daily_digest_founder'));

-- public.member_relations.entity_kind (the D pass already renamed the constraint)
ALTER TABLE public.member_relations DROP CONSTRAINT member_relations_entity_kind_check;
UPDATE public.member_relations SET entity_kind = 'member' WHERE entity_kind = 'client';
ALTER TABLE public.member_relations ADD CONSTRAINT member_relations_entity_kind_check
  CHECK (entity_kind IN ('person', 'vendor', 'place', 'venue', 'brand', 'interest', 'member'));

-- sia.wag_contacts.participant_role (rows carry the value today)
ALTER TABLE sia.wag_contacts DROP CONSTRAINT wag_contacts_participant_role_check;
UPDATE sia.wag_contacts SET participant_role = 'member' WHERE participant_role = 'client';
ALTER TABLE sia.wag_contacts ADD CONSTRAINT wag_contacts_participant_role_check
  CHECK (participant_role IN ('member', 'genie', 'bishop', 'queen', 'joker', 'founder', 'vendor', 'watcher', 'unknown'));

-- sia.wag_groups.group_kind (rows carry the value today)
ALTER TABLE sia.wag_groups DROP CONSTRAINT wag_groups_group_kind_check;
UPDATE sia.wag_groups SET group_kind = 'member' WHERE group_kind = 'client';
ALTER TABLE sia.wag_groups ADD CONSTRAINT wag_groups_group_kind_check
  CHECK (group_kind IN ('member', 'vendor', 'internal', 'unmapped'));

-- public.member_access_log.surface (free text, no CHECK)
UPDATE public.member_access_log SET surface = 'members_page' WHERE surface = 'clients_page';

-- ─── F. deals.member_id gets the foreign key it was always meant to have ─────

ALTER TABLE public.deals
  ADD CONSTRAINT deals_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_member ON public.deals (member_id) WHERE member_id IS NOT NULL;

-- ─── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.members IS
  'The member identity spine (one row per human, 0181 as clients, renamed 0202). Join keys + a strict membership summary only — dynamic profile data lives in the member_* satellites, raw source rows in import_raw. Writes are service-role only.';
COMMENT ON COLUMN public.deals.member_id IS
  'The member this deal created or renewed (0202: the Gia → Sia bridge; set when a won deal becomes a membership).';

-- PostgREST re-reads the catalog on DDL, but say it explicitly so the API sees the new names at once.
NOTIFY pgrst, 'reload schema';
