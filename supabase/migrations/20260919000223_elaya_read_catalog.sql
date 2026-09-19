-- Migration 0223: the founder's "ask the database" seam for Elaya.
--
-- Why: Elaya answers only what a tool was built for. The founder asks questions nobody built a
-- tool for ("which genie closed the most Premium tickets in August and how long did each
-- take"). This lets the MODEL write a read-only query, behind four independent locks:
--
--   1. A login-less role, elaya_reader, that can see ONE schema (elaya_read) and nothing else.
--      It has no rights on any real table, so a query cannot reach one.
--   2. elaya_read holds VIEWS with explicit column lists: no phone, no email, no password, no
--      login, no raw payload, no WhatsApp jid (groups and senders are md5 ids), long text cut
--      short. A column added to a table later is NOT visible until someone adds it here.
--   3. elaya_read.run() executes the query as that role, in a READ ONLY transaction, wrapped as
--      a sub-select (so it can only ever be one SELECT), row-capped, with `public.` and a few
--      dangerous built-ins refused. PostgREST's 8 s statement timeout bounds the run time.
--   4. public.elaya_run_query() is the only door: service_role only. The Node tool behind it is
--      founder/admin only, logs every query (public.elaya_query_log) and masks the result again
--      (maskPii) before the model sees it.

-- ── 1. The role and the schema ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elaya_reader') THEN
    CREATE ROLE elaya_reader NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT elaya_reader TO postgres;

CREATE SCHEMA IF NOT EXISTS elaya_read;
REVOKE ALL ON SCHEMA elaya_read FROM PUBLIC;
GRANT USAGE ON SCHEMA elaya_read TO elaya_reader;

-- ── 2. The views (explicit columns are the contract) ─────────────────────────

CREATE VIEW elaya_read.staff AS
  SELECT id AS staff_id, full_name, role::text AS role, domain::text AS domain, job_title,
         sia_role AS position, queendom_id, reports_to AS reports_to_staff_id, is_active, is_on_leave,
         last_seen_at, created_at
  FROM public.profiles;
COMMENT ON VIEW elaya_read.staff IS 'Every Serene user (the team). role: agent/manager/admin/founder/guest. domain: onboarding/house/shop/legacy/concierge/tech/finance... position (concierge only): queen/bishop/genie/joker. Join any *_staff_id / owner_id / agent staff_id / actor_id to staff_id.';

CREATE VIEW elaya_read.leads AS
  SELECT id AS lead_id, nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') AS name,
         domain::text AS domain, status, lead_intent, source, medium, utm_campaign AS campaign, city,
         service_interests, assigned_to AS owner_id, assigned_at, call_count, last_call_outcome,
         last_call_outcome_at, resolution_reason, created_at, status_changed_at, last_activity_at,
         (archived_at IS NOT NULL) AS archived
  FROM gia.leads;
COMMENT ON VIEW elaya_read.leads IS 'Sales leads (Gia). status: new/touched/in_discussion/nurturing/won/lost/cold/junk. owner_id -> staff. created_at is the cohort date. Exclude archived unless asked.';

CREATE VIEW elaya_read.lead_notes AS
  SELECT id AS note_id, lead_id, author_id, left(content, 400) AS note, call_outcome, created_at FROM gia.lead_notes;
COMMENT ON VIEW elaya_read.lead_notes IS 'Notes and logged calls on leads. call_outcome is set when the note is a call (one row per call). author_id -> staff.';

CREATE VIEW elaya_read.lead_activities AS
  SELECT id AS activity_id, lead_id, actor_id, action_type, details, created_at FROM gia.lead_activities;
COMMENT ON VIEW elaya_read.lead_activities IS 'Append-only history of everything done to a lead (status_changed, call_logged, note_added, lead_assigned...). actor_id -> staff.';

CREATE VIEW elaya_read.deals AS
  SELECT id AS deal_id, lead_id, member_id, contact_name, domain::text AS domain, deal_amount, deal_type,
         deal_category, deal_duration, assigned_to AS owner_id, source, won_at, created_at,
         (archived_at IS NOT NULL) AS archived
  FROM gia.deals;
COMMENT ON VIEW elaya_read.deals IS 'Closed deals. deal_amount is INR. Revenue and "deals closed" count by won_at (not by the lead''s created_at). owner_id -> staff.';

CREATE VIEW elaya_read.lead_sla_timers AS
  SELECT id AS timer_id, lead_id, rule_code, status, scheduled_fire_at, fired_at, cancelled_at, created_at FROM gia.lead_sla_timers;
COMMENT ON VIEW elaya_read.lead_sla_timers IS 'Follow-up / SLA timers per lead. status fired = the lead breached that rule.';

CREATE VIEW elaya_read.revival_candidates AS
  SELECT id AS candidate_id, lead_id, assigned_to AS owner_id, verdict, left(ai_reasoning, 300) AS ai_reasoning,
         status, trigger_status, resolved_at, created_at
  FROM gia.revival_candidates;
COMMENT ON VIEW elaya_read.revival_candidates IS 'Silent leads the nightly revival sweep judged (verdict revive/dismiss/unsure; status open/actioned/dismissed).';

CREATE VIEW elaya_read.ad_spend_daily AS
  SELECT campaign_key AS campaign, spend_date, spend, results, impressions, reach, link_clicks, currency FROM gia.ad_spend_daily;
COMMENT ON VIEW elaya_read.ad_spend_daily IS 'Meta ad spend per campaign per day. Join to leads on lower(trim(leads.campaign)) = campaign.';

CREATE VIEW elaya_read.domain_targets AS
  SELECT domain::text AS domain, metric, target_value, period FROM gia.domain_targets;

CREATE VIEW elaya_read.product_enquiries AS
  SELECT id AS enquiry_id, lead_id, product_name, brand, price, currency, enquiry_type, sold_out, enquired_at FROM gia.lead_product_enquiries;
COMMENT ON VIEW elaya_read.product_enquiries IS 'Shop-app product enquiries; one lead can hold many.';

CREATE VIEW elaya_read.lead_whatsapp_messages AS
  SELECT id AS message_id, lead_id, direction, sender_type, sender_id, message_type, left(content, 300) AS text,
         status, is_bot, created_at
  FROM gia.whatsapp_messages;
COMMENT ON VIEW elaya_read.lead_whatsapp_messages IS 'The official WhatsApp line with LEADS (not the member concierge groups). direction inbound/outbound.';

CREATE VIEW elaya_read.tasks AS
  SELECT t.id AS task_id, t.title, left(t.description, 300) AS description, t.assigned_to AS assignee_id,
         t.created_by AS created_by_staff_id, t.module::text AS module, t.task_type, t.task_category, t.status,
         t.priority, t.due_at, t.completed_at, t.overdue_at, t.group_id AS task_group_id, t.tags, t.created_at,
         g.lead_id
  FROM public.tasks t LEFT JOIN gia.task_gia_meta g ON g.task_id = t.id;
COMMENT ON VIEW elaya_read.tasks IS 'Every task. lead_id is set when it is a lead follow-up. status to_do/in_progress/completed/... Overdue = due_at < now() and status not completed.';

CREATE VIEW elaya_read.task_groups AS
  SELECT id AS task_group_id, title, status, priority, due_at, domain::text AS domain, created_by AS created_by_staff_id, created_at FROM public.task_groups;

CREATE VIEW elaya_read.activity_feed AS
  SELECT id AS event_id, domain::text AS domain, actor_id, subject_type, subject_id, event_type, title, created_at FROM public.activity_events;
COMMENT ON VIEW elaya_read.activity_feed IS 'Live stream of what the team does (lead created/won, deal, task created/completed). actor_id -> staff. Best source for "what happened in the last hour".';

CREATE VIEW elaya_read.staff_usage_daily AS
  SELECT day, user_id AS staff_id, domain::text AS domain, active_minutes FROM public.usage_daily;
COMMENT ON VIEW elaya_read.staff_usage_daily IS 'Minutes each person was active in Serene per IST day.';

CREATE VIEW elaya_read.vendors AS
  SELECT id AS vendor_id, name, category, subcategory, status, home_city, identity_status, sources, created_at FROM public.vendors;
COMMENT ON VIEW elaya_read.vendors IS 'Suppliers. status active/paused/blacklisted. 21k rows: always filter or aggregate.';

CREATE VIEW elaya_read.vendor_jobs AS
  SELECT id AS job_id, vendor_id, member_id, lead_id, agent_id AS staff_id, agent_name_raw, title, category, service,
         city, source, source_ref, started_at, closed_at, outcome, amount_inr, left(note, 300) AS note
  FROM public.vendor_engagements;
COMMENT ON VIEW elaya_read.vendor_jobs IS 'Each time a vendor was used (47k rows; most imported from Freshdesk history). outcome NULL = still open.';

CREATE VIEW elaya_read.vendor_reviews AS
  SELECT id AS review_id, vendor_id, engagement_id AS job_id, reviewer_id AS staff_id, speed, quality, pricing, reliability,
         left(comment, 300) AS comment, created_at
  FROM public.vendor_reviews;

CREATE VIEW elaya_read.vendor_capabilities AS
  SELECT id AS capability_id, vendor_id, category, service, stance, cities FROM public.vendor_capabilities;

CREATE VIEW elaya_read.subscriptions AS
  SELECT id AS subscription_id, name, departments, type, currency, amount, due_day, due_date, is_archived, created_at FROM public.subscriptions;
COMMENT ON VIEW elaya_read.subscriptions IS 'Software the company pays for. Logins and passwords are never exposed here.';

CREATE VIEW elaya_read.subscription_payments AS
  SELECT id AS payment_id, subscription_id, due_date, paid_at, rate, paid_amount_inr FROM public.subscription_payments;

CREATE VIEW elaya_read.queendoms AS
  SELECT id AS queendom_id, name, slug, freshdesk_group_id, is_active FROM sia.queendoms;
COMMENT ON VIEW elaya_read.queendoms IS 'The concierge teams. freshdesk_group_id joins to freshdesk_tickets.group_id.';

CREATE VIEW elaya_read.members AS
  SELECT id AS member_id, full_name, membership_type, membership_status, membership_amount_inr, membership_start,
         membership_end, tier, queendom_id, identity_status, (wa_group_jid IS NOT NULL) AS has_whatsapp_group,
         (zoho_customer_id IS NOT NULL) AS has_zoho, (freshdesk_contact_id IS NOT NULL) AS has_freshdesk, created_at
  FROM member.members;
COMMENT ON VIEW elaya_read.members IS 'Indulge members (clients). membership_status values are capitalised: Active / Expired / ... A renewal is membership_end.';

CREATE VIEW elaya_read.member_facts AS
  SELECT id AS fact_id, member_id, facet, key, left(value, 300) AS value, polarity, source, confidence, observed_at,
         valid_until, (superseded_by IS NULL) AS is_current
  FROM member.member_facts;
COMMENT ON VIEW elaya_read.member_facts IS 'What Serene knows about a member (facet: preference/dietary/travel/family/identity/...). Use is_current. source: whatsapp_group/atlas/typeform/freshdesk_contact/import/manual.';

CREATE VIEW elaya_read.member_people AS
  SELECT id AS person_id, member_id, name, relation, can_request, left(note, 200) AS note FROM member.member_people;

CREATE VIEW elaya_read.member_relations AS
  SELECT id AS relation_id, member_id, entity_kind, entity_label, relation, strength, first_seen_at, last_seen_at, evidence_count
  FROM member.member_relations;
COMMENT ON VIEW elaya_read.member_relations IS 'Places, brands, venues, vendors, interests tied to a member, with how strongly.';

CREATE VIEW elaya_read.member_coming_up AS
  SELECT id AS item_id, member_id, kind, title, due_at, suggested_action, status, resolved_at FROM member.member_anticipations;
COMMENT ON VIEW elaya_read.member_coming_up IS 'Birthdays, anniversaries, trips, renewals ahead. status pending/surfaced/acted/dismissed.';

CREATE VIEW elaya_read.member_timeline AS
  SELECT id AS event_id, member_id, occurred_at, kind, source, actor, left(summary, 400) AS summary, tone, weight FROM member.member_events;
COMMENT ON VIEW elaya_read.member_timeline IS 'One line per finished WhatsApp conversation / ticket / note: what happened and the tone (praise/neutral/frustrated/angry).';

CREATE VIEW elaya_read.member_health_events AS
  SELECT id AS health_event_id, member_id, signal, delta, observed_at, left(note, 200) AS note FROM member.member_health_events;

CREATE VIEW elaya_read.whatsapp_groups AS
  SELECT md5(group_jid) AS group_id, subject AS name, group_kind AS kind, member_id, vendor_id, member_count AS people,
         is_active, created_at
  FROM sia.wag_groups;
COMMENT ON VIEW elaya_read.whatsapp_groups IS 'The WhatsApp groups Sia records. kind member (a member''s concierge group; member_id may be NULL = not linked yet) / internal (team groups) / vendor.';

CREATE VIEW elaya_read.whatsapp_messages AS
  SELECT m.id AS message_id, md5(m.chat_jid) AS group_id, md5(m.sender_jid) AS sender_id, c.push_name AS sender_name,
         c.participant_role AS sender_role,
         (c.staff_profile_id IS NOT NULL OR c.participant_role IN ('genie','bishop','queen','joker','founder','watcher')
           OR c.push_name ~* '\mindulge\M') AS is_staff,
         m.from_me, m.type, left(m.text, 300) AS text, m.wa_timestamp AS sent_at, m.is_revoked AS deleted,
         (m.quoted_wa_message_id IS NOT NULL) AS is_reply
  FROM sia.wag_messages m LEFT JOIN sia.wag_contacts c ON c.jid = m.sender_jid;
COMMENT ON VIEW elaya_read.whatsapp_messages IS 'Every message in the recorded groups (160k+ rows): ALWAYS filter by group_id and/or sent_at, or aggregate. text is cut to 300 chars. is_staff false = the member''s side. To read a chat in full use the chat tools, not this view.';

CREATE VIEW elaya_read.sia_tickets AS
  SELECT id AS ticket_id, ticket_no, member_id, queendom_id, origin, md5(group_jid) AS group_id, category, sub_category,
         item, title, priority, status, requested_for, first_response_due_at, next_update_due_at, resolve_due_at,
         first_responded_at, last_member_update_at, assignee_id, bishop_id, vendor_id, money, left(summary, 400) AS summary,
         created_by_kind, closed_at, resolution, satisfaction, freshdesk_id, tags, created_at, updated_at
  FROM sia.tickets;
COMMENT ON VIEW elaya_read.sia_tickets IS 'Serene''s own tickets (T-000042). Different from Freshdesk tickets. assignee_id / bishop_id -> staff.';

CREATE VIEW elaya_read.sia_ticket_events AS
  SELECT id AS event_id, ticket_id, actor_kind, actor_id, event_type, left(body, 300) AS body, created_at FROM sia.ticket_events;

CREATE VIEW elaya_read.ticket_suggestions AS
  SELECT id AS suggestion_id, member_id, queendom_id, kind, status, confidence, tone, left(summary, 400) AS summary,
         first_message_at, last_message_at, ticket_id, resolved_by AS resolved_by_staff_id, resolved_at, dismiss_reason,
         fields_changed, created_at
  FROM sia.intake_proposals;
COMMENT ON VIEW elaya_read.ticket_suggestions IS 'Tickets Serene proposed from the chats (intake). status open/created/dismissed; fields_changed = what the human corrected.';

CREATE VIEW elaya_read.ai_runs AS
  SELECT id AS run_id, kind, model, prompt_version, member_id, tokens_in, tokens_out, cost_usd, started_at, finished_at, ok,
         left(error, 200) AS error
  FROM sia.extraction_runs;
COMMENT ON VIEW elaya_read.ai_runs IS 'Every background model call (kind profiler/intake/ticket_creator/...). cost_usd is our own estimate and may be NULL.';

CREATE VIEW elaya_read.freshdesk_tickets AS
  SELECT id AS ticket_id, subject, status, status_label, priority, source, ticket_type, category, sub_category,
         classification, tags, group_id, responder_id AS agent_id, requester_name, member_id, due_by, fr_due_by,
         is_escalated, first_responded_at, status_updated_at, reopened_at, pending_since, resolved_at, closed_at,
         fd_created_at AS created_at, fd_updated_at AS updated_at, conversation_count
  FROM freshdesk.tickets WHERE NOT deleted AND NOT spam;
COMMENT ON VIEW elaya_read.freshdesk_tickets IS 'The Freshdesk helpdesk mirror (51k tickets). status 4 = Resolved, 5 = Closed, anything else is open; use status_label for the name. priority 1 low .. 4 urgent. group_id -> freshdesk_groups, agent_id -> freshdesk_agents, member_id -> members.';

CREATE VIEW elaya_read.freshdesk_notes AS
  SELECT id AS note_id, ticket_id, user_id AS agent_id, incoming, private, left(body_text, 300) AS text, fd_created_at AS created_at
  FROM freshdesk.conversations;
COMMENT ON VIEW elaya_read.freshdesk_notes IS 'Replies and private notes on Freshdesk tickets (200k rows): always filter by ticket_id or created_at.';

CREATE VIEW elaya_read.freshdesk_ticket_changes AS
  SELECT id AS change_id, ticket_id, field, old_value, new_value, coalesce(fd_updated_at, observed_at) AS changed_at FROM freshdesk.ticket_changes;
COMMENT ON VIEW elaya_read.freshdesk_ticket_changes IS 'Movement history of Freshdesk tickets since 2026-09-15 (status / agent / group / due date changes).';

CREATE VIEW elaya_read.freshdesk_agents AS
  SELECT id AS agent_id, name, job_title, active, profile_id AS staff_id FROM freshdesk.agents;

CREATE VIEW elaya_read.freshdesk_groups AS
  SELECT id AS group_id, name FROM freshdesk.groups;

-- The catalog the model reads before it writes a query.
CREATE VIEW elaya_read.data_dictionary AS
  SELECT c.relname::text AS view_name, obj_description(c.oid)::text AS about, a.attname::text AS column_name,
         format_type(a.atttypid, a.atttypmod)::text AS data_type, a.attnum::int AS position
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'elaya_read'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relkind = 'v' AND c.relname <> 'data_dictionary';

GRANT SELECT ON ALL TABLES IN SCHEMA elaya_read TO elaya_reader;

-- ── 3. The runner (runs AS elaya_reader) ─────────────────────────────────────

GRANT CREATE ON SCHEMA elaya_read TO elaya_reader;  -- needed only for the ownership change below

CREATE FUNCTION elaya_read.run(p_sql text, p_max_rows int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elaya_read, pg_catalog
AS $$
DECLARE
  v_sql   text := btrim(coalesce(p_sql, ''));
  v_flat  text;
  v_limit int  := least(greatest(coalesce(p_max_rows, 200), 1), 500);
  v_rows  jsonb;
  v_count int;
BEGIN
  v_sql := regexp_replace(v_sql, ';\s*$', '');
  v_flat := lower(replace(v_sql, '"', ''));
  IF length(v_sql) = 0 OR length(v_sql) > 8000 THEN RAISE EXCEPTION 'query is empty or too long'; END IF;
  IF v_flat !~ '^\s*(select|with)\M' THEN RAISE EXCEPTION 'only a single SELECT (or WITH ... SELECT) is allowed'; END IF;
  IF position(';' IN v_sql) > 0 OR position('--' IN v_sql) > 0 OR position('/*' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'no semicolons or comments: send one plain SELECT';
  END IF;
  IF v_flat ~ '\m(public|auth|vault|storage|gia|sia|member|freshdesk|extensions|net|cron|pgsodium|realtime|supabase_functions)\s*\.\s*[a-z_]' THEN
    RAISE EXCEPTION 'only the views of the catalog may be read: do not schema-qualify names, and do not use a table alias named public/auth/gia/sia/member/freshdesk';
  END IF;
  IF v_flat ~ '\m(pg_sleep\w*|pg_read_\w+|pg_ls_\w+|pg_stat_file|lo_\w+|dblink\w*|set_config|pg_terminate_backend|pg_cancel_backend|pg_advisory\w*|nextval|setval|pg_reload_conf|query_to_xml\w*|table_to_xml\w*|database_to_xml\w*)\M' THEN
    RAISE EXCEPTION 'that function is not allowed';
  END IF;

  PERFORM set_config('transaction_read_only', 'on', true);

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb), count(*)::int FROM (SELECT * FROM (%s) elaya_inner LIMIT %s) q',
    v_sql, v_limit + 1
  ) INTO v_rows, v_count;

  IF v_count > v_limit THEN
    v_rows := (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(e, n) WHERE n <= v_limit ORDER BY n) s);
  END IF;
  RETURN jsonb_build_object('rows', v_rows, 'row_count', least(v_count, v_limit), 'truncated', v_count > v_limit, 'row_cap', v_limit);
END;
$$;

ALTER FUNCTION elaya_read.run(text, int) OWNER TO elaya_reader;
REVOKE CREATE ON SCHEMA elaya_read FROM elaya_reader;
REVOKE ALL ON FUNCTION elaya_read.run(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION elaya_read.run(text, int) TO postgres, service_role;

-- ── 4. The one door (PostgREST reaches `public`, not `elaya_read`) ───────────

CREATE FUNCTION public.elaya_run_query(p_sql text, p_max_rows int DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT elaya_read.run(p_sql, p_max_rows); $$;

REVOKE ALL ON FUNCTION public.elaya_run_query(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elaya_run_query(text, int) TO service_role;

-- ── 5. Every query is kept (append-only; service role only) ──────────────────

CREATE TABLE public.elaya_query_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id),
  channel     text NOT NULL,
  purpose     text,
  sql         text NOT NULL,
  ok          boolean NOT NULL,
  error       text,
  row_count   integer,
  truncated   boolean,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_elaya_query_log_user_time ON public.elaya_query_log (user_id, created_at DESC);
ALTER TABLE public.elaya_query_log ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role writes and reads it (Rule 08: never updated or deleted).
COMMENT ON TABLE public.elaya_query_log IS 'Append-only: every SQL the founder''s Elaya ran through elaya_run_query, with its outcome.';

NOTIFY pgrst, 'reload schema';
