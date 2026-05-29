/**
 * One-time import script for house.csv leads.
 * Run: node scripts/import-house-leads.mjs
 *
 * - id is auto-generated (gen_random_uuid equivalent via crypto.randomUUID)
 * - assigned_to is fixed to 59d948a3-37c5-4a2d-b5fa-d41f92d8ef93 (Sailee, only house agent)
 * - first_name split on first space → first_name + last_name
 * - form_data preserved as-is from CSV (already valid JSON)
 * - campaign_id stored in form_data.campaign_id (leads table has no campaign_id col in use)
 * - A lead_created + agent_assigned activity is written for every inserted lead
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = 'https://xmucqqhbupudnzderchy.supabase.co';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdWNxcWhidXB1ZG56ZGVyY2h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwNTE0NywiZXhwIjoyMDk1MzgxMTQ3fQ.wGJ1Wi15Dg03V18tzOtxJX6egwRObrLlkO1L_Y6YS2Q';

const SAILEE_ID = '59d948a3-37c5-4a2d-b5fa-d41f92d8ef93';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rows = [
  { email: 'hamsloveu1985@yahoo.com', first_name: 'M.H.Khan', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010085', created_at: '2026-05-20 07:14:56', phone: '+919849503450', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night", "full_name": "M.H.Khan", "email": "hamsloveu1985@yahoo.com", "phone_number": "+919849503450"}' },
  { email: 'esushma127@gmail.com', first_name: 'Sushma', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010086', created_at: '2026-05-20 09:38:53', phone: '+919840150502', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night", "full_name": "Sushma", "email": "esushma127@gmail.com", "phone_number": "+919840150502"}' },
  { email: 'aliskacarvalho@yahoo.com', first_name: 'Aliska Carvalho', utm_campaign: 'TG_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110083', created_at: '2026-05-20 17:05:23', phone: '+919850486898', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"where_are_you_from?": "goa", "when_would_you_like_to_book_pickleball_activity?": "upcoming_week", "full_name": "Aliska Carvalho", "phone_number": "+919850486898", "email": "aliskacarvalho@yahoo.com"}' },
  { email: 'simran121k@gmail.com', first_name: '• SIMRAN KAUR •', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010089', created_at: '2026-05-20 23:52:31', phone: '+918299869179', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "• SIMRAN KAUR •", "email": "simran121k@gmail.com", "phone_number": "+918299869179", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night"}' },
  { email: '44rahul@gmail.com', first_name: 'Rahul', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010090', created_at: '2026-05-21 00:22:53', phone: '+919910056098', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Rahul", "email": "44rahul@gmail.com", "phone_number": "+919910056098", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night"}' },
  { email: 'viren@thethakkarfamily.com', first_name: 'Viren Thakkar', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010087', created_at: '2026-05-21 09:11:49', phone: '+919998850588', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"which_type_of_experience_would_you_like_to_book?": "full_property_booking_-_₹80,000+ per night", "full_name": "Viren Thakkar", "phone_number": "+919998850588", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "email": "viren@thethakkarfamily.com"}' },
  { email: 'manishmmehta@ymail.com', first_name: 'Deepak', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010088', created_at: '2026-05-21 13:57:42', phone: '+919844335331', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Deepak", "email": "manishmmehta@ymail.com", "phone_number": "+919844335331", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night"}' },
  { email: 'anaidu368@gmail.com', first_name: 'Naidu Anil Kumar', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010101', created_at: '2026-05-22 17:16:08', phone: '+919949077469', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "phone_number": "+919949077469", "full_name": "Naidu Anil Kumar", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "email": "anaidu368@gmail.com"}' },
  { email: 'drabhishek2508@gmail.com', first_name: 'Abhishek Anand', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010099', created_at: '2026-05-22 18:58:53', phone: '+918105502481', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Abhishek Anand", "email": "drabhishek2508@gmail.com", "phone_number": "+918105502481", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night"}' },
  { email: 'harminder.s.jaggi@gmail.com', first_name: 'Harmindder Singh Jaggi', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010095', created_at: '2026-05-22 19:21:05', phone: '+918826501996', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Harmindder Singh Jaggi", "phone_number": "+918826501996", "email": "harminder.s.jaggi@gmail.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'milu575757@yahoo.com', first_name: 'Vinayak Redkar', utm_campaign: 'TG_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110085', created_at: '2026-05-23 04:32:27', phone: '+919923141557', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"where_are_you_from?": "goa", "when_would_you_like_to_book_pickleball_activity?": "still_planning", "full_name": "Vinayak Redkar", "phone_number": "+919923141557", "email": "milu575757@yahoo.com"}' },
  { email: 'aayushgada39@gmail.com', first_name: 'Aayush Gada', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010093', created_at: '2026-05-23 11:36:35', phone: '+919930063677', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Aayush Gada", "phone_number": "+919930063677", "email": "aayushgada39@gmail.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'arunaoct@gmail.com', first_name: 'Aaryaman poddar', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010096', created_at: '2026-05-23 13:59:02', phone: '+919987553231', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "Aaryaman poddar", "phone_number": "+919987553231", "email": "arunaoct@gmail.com"}' },
  { email: 'tareenii.jeewellery@gmail.com', first_name: 'Tiyasshha Chowdhuryy', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010094', created_at: '2026-05-23 16:20:50', phone: '+919224218086', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "Tiyasshha Chowdhuryy", "phone_number": "+919224218086", "email": "tareenii.jeewellery@gmail.com"}' },
  { email: 'athishwaran2000@gmail.com', first_name: 'Athish', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010091', created_at: '2026-05-23 18:01:37', phone: '+918667316422', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Athish", "phone_number": "+918667316422", "email": "athishwaran2000@gmail.com", "are_you_an_indulge_member?": "yes", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'chawlajc1@gmail.com', first_name: 'CA Jitendra Chawla', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010100', created_at: '2026-05-23 18:46:48', phone: '+919829322741', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "CA Jitendra Chawla", "phone_number": "+919829322741", "email": "chawlajc1@gmail.com"}' },
  { email: 'akhil_pitty@yahoo.com', first_name: 'Akhil Pitty', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010092', created_at: '2026-05-23 21:37:48', phone: '+919923375755', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Akhil Pitty", "phone_number": "+919923375755", "email": "akhil_pitty@yahoo.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'atishgada7151@gmail.com', first_name: 'Atish Gada', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010098', created_at: '2026-05-24 00:31:45', phone: '+919860433600', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Atish Gada", "phone_number": "+919860433600", "email": "atishgada7151@gmail.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'sonnytomas@gmail.com', first_name: 'Sonny', utm_campaign: 'TG_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110084', created_at: '2026-05-24 08:50:54', phone: '+919930524717', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Sonny", "when_would_you_like_to_book_pickleball_activity?": "upcoming_week", "phone_number": "+919930524717", "where_are_you_from?": "goa", "email": "sonnytomas@gmail.com"}' },
  { email: 'divyanshjain651@gmail.com', first_name: 'Divyansh Jain', utm_campaign: 'TG_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010097', created_at: '2026-05-24 09:52:16', phone: '+919993241984', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Divyansh Jain", "phone_number": "+919993241984", "email": "divyanshjain651@gmail.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'vips_bindaas@yahoo.com', first_name: 'Vipul Chaurasia', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010081', created_at: '2026-05-25 11:11:58', phone: '+919811125231', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "Vipul Chaurasia", "phone_number": "+919811125231", "email": "vips_bindaas@yahoo.com"}' },
  { email: 'anikisi@gmail.co', first_name: 'PRAVEEN KUMAR', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010082', created_at: '2026-05-25 11:31:12', phone: '+919845532107', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night", "full_name": "PRAVEEN KUMAR", "phone_number": "+919845532107", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "email": "anikisi@gmail.co"}' },
  { email: 'arora007varun@gmail.com', first_name: 'Varun Arora', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010083', created_at: '2026-05-25 12:57:18', phone: '+919814250199', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Varun Arora", "phone_number": "+919814250199", "email": "arora007varun@gmail.com", "are_you_an_indulge_member?": "yes", "what_would_you_like_to_book?": "the_entire_property_(private)", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'drkislaya@gmail.com', first_name: 'Nikshay Kumar', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010079', created_at: '2026-05-25 20:23:45', phone: '+918052735770', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_₹15,000_to_₹30,000_per_night", "full_name": "Nikshay Kumar", "phone_number": "+918052735770", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "email": "drkislaya@gmail.com"}' },
  { email: 'vyasrohith902@gmail.com', first_name: 'Rohit Vyas', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010080', created_at: '2026-05-25 20:39:30', phone: '+917405858569', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "Rohit Vyas", "phone_number": "+917405858569", "email": "vyasrohith902@gmail.com"}' },
  { email: 'annavarapuradhika1@gmail.com', first_name: 'Radhika Annavarapu', utm_campaign: 'TG_House_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110079', created_at: '2026-05-25 23:50:52', phone: '+919970153335', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"where_are_you_from?": "goa", "when_would_you_like_to_book_pickleball_activity?": "upcoming_week", "full_name": "Radhika Annavarapu", "phone_number": "+919970153335", "email": "annavarapuradhika1@gmail.com"}' },
  { email: 'sdpsaji@gmail.com', first_name: 'saji', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010084', created_at: '2026-05-26 09:54:21', phone: '+919422068495', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "saji", "phone_number": "+919422068495", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "email": "sdpsaji@gmail.com"}' },
  { email: 'udhayarajank@gmail.com', first_name: 'udhaya rajan', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010085', created_at: '2026-05-26 15:01:19', phone: '+916381078058', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "the_entire_property_(private)", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "udhaya rajan", "phone_number": "+916381078058", "email": "udhayarajank@gmail.com"}' },
  { email: 'Mohur2019@gmail.com', first_name: 'Mohur K', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010088', created_at: '2026-05-26 17:59:16', phone: '+919820746149', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"full_name": "Mohur K", "phone_number": "+919820746149", "email": "Mohur2019@gmail.com", "are_you_an_indulge_member?": "no", "what_would_you_like_to_book?": "a_select_number_of_rooms", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night"}' },
  { email: 'fernandesdx@yahoo.co.in', first_name: 'Xavi Fernandes', utm_campaign: 'TG_House_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110080', created_at: '2026-05-26 22:25:29', phone: '+919822156672', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"email": "fernandesdx@yahoo.co.in", "full_name": "Xavi Fernandes", "phone_number": "+919822156672", "where_are_you_from?": "goa", "when_would_you_like_to_book_pickleball_activity?": "upcoming_week"}' },
  { email: 'narenderchangia@yahoo.com', first_name: 'Narender Changia', utm_campaign: 'TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept', campaign_id: '120235554297010087', created_at: '2026-05-27 08:39:06', phone: '+919772078777', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"email": "narenderchangia@yahoo.com", "which_type_of_experience_would_you_like_to_book?": "premium_glamping_experience_-_starting_from_₹8,000_per_night", "full_name": "Narender Changia", "what_would_you_like_to_book?": "a_select_number_of_rooms", "phone_number": "+919772078777", "are_you_an_indulge_member?": "no"}' },
  { email: 'panelpk@gmail.com', first_name: 'Pavan Kumar Mehta', utm_campaign: 'TG_House_Meta Leads_Indulge House_Pickle ball_1st Oct', campaign_id: '120236459966110083', created_at: '2026-05-27 13:40:04', phone: '+918128593789', status: 'touched', platform: 'meta', utm_source: 'meta', form_data: '{"where_are_you_from?": "goa", "when_would_you_like_to_book_pickleball_activity?": "still_planning", "full_name": "Pavan Kumar Mehta", "phone_number": "+918128593789", "email": "panelpk@gmail.com"}' },
];

function splitName(full) {
  const idx = full.indexOf(' ');
  if (idx === -1) return { first_name: full, last_name: null };
  return { first_name: full.slice(0, idx), last_name: full.slice(idx + 1) };
}

async function run() {
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const { first_name, last_name } = splitName(row.first_name);
    const leadId = randomUUID();
    const createdAt = new Date(row.created_at + ' UTC').toISOString();

    // Check for existing lead with same phone to avoid dupes
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', row.phone)
      .is('archived_at', null)
      .maybeSingle();

    if (existing) {
      console.log(`  SKIP  ${row.phone} — already exists`);
      skipped++;
      continue;
    }

    const leadPayload = {
      id: leadId,
      first_name,
      last_name,
      email: row.email || null,
      phone: row.phone,
      domain: 'house',
      assigned_to: SAILEE_ID,
      assigned_at: createdAt,
      status: row.status,
      platform: row.platform,
      utm_source: row.utm_source,
      utm_campaign: row.utm_campaign,
      campaign_id: row.campaign_id,
      form_data: JSON.parse(row.form_data),
      created_at: createdAt,
      updated_at: createdAt,
    };

    const { error: leadErr } = await supabase.from('leads').insert(leadPayload);
    if (leadErr) {
      console.error(`  ERROR ${row.phone}:`, leadErr.message);
      errors.push({ phone: row.phone, error: leadErr.message });
      continue;
    }

    // Activity: lead_created
    const { error: actErr1 } = await supabase.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: SAILEE_ID,
      action_type: 'lead_created',
      details: { source: 'csv_import', campaign: row.utm_campaign },
      created_at: createdAt,
    });
    if (actErr1) console.warn(`  WARN  activity lead_created for ${row.phone}:`, actErr1.message);

    // Activity: agent_assigned
    const { error: actErr2 } = await supabase.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: SAILEE_ID,
      action_type: 'agent_assigned',
      details: { assigned_to: SAILEE_ID, assigned_to_name: 'Sailee', source: 'csv_import' },
      created_at: createdAt,
    });
    if (actErr2) console.warn(`  WARN  activity agent_assigned for ${row.phone}:`, actErr2.message);

    console.log(`  OK    ${first_name}${last_name ? ' ' + last_name : ''} (${row.phone})`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}  Skipped (dupes): ${skipped}  Errors: ${errors.length}`);
  if (errors.length) {
    console.log('Errors:', errors);
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
