-- 隔離した空のPostgreSQL専用。実環境には実行しない。
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE organizations (id uuid PRIMARY KEY);
CREATE TABLE stores (id uuid PRIMARY KEY, name text);
CREATE TABLE scenarios (id uuid PRIMARY KEY, player_count_min integer, player_count_max integer);
CREATE TABLE scenario_masters (id uuid PRIMARY KEY, player_count_min integer, player_count_max integer);
CREATE TABLE organization_scenarios (id uuid PRIMARY KEY, scenario_master_id uuid, override_player_count_min integer, override_player_count_max integer);
CREATE TABLE schedule_events (id uuid PRIMARY KEY, organization_id uuid, date date, start_time time, scenario text, category text DEFAULT 'open', is_cancelled boolean DEFAULT false, is_recruitment_extended boolean DEFAULT true, gm_roles jsonb DEFAULT '{}', max_participants integer DEFAULT 4, organization_scenario_id uuid, scenario_master_id uuid, scenario_id uuid, store_id uuid, gms text[] DEFAULT '{}', updated_at timestamptz, current_participants integer DEFAULT 0);
CREATE TABLE customers(id uuid PRIMARY KEY, email text);
CREATE TABLE reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, customer_id uuid, customer_email text, cancelled_at timestamptz, cancellation_reason text, updated_at timestamptz, schedule_event_id uuid, participant_count integer, status text DEFAULT 'confirmed', reservation_source text, participant_names text[]);
CREATE TABLE performance_cancellation_logs (schedule_event_id uuid, organization_id uuid, check_type text, current_participants integer, max_participants integer, result text, UNIQUE(schedule_event_id, check_type));

CREATE SCHEMA cron;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE TABLE app_config(key text PRIMARY KEY,value text);
INSERT INTO app_config VALUES('supabase_url','https://example.invalid'),('trigger_secret','fixture-only');
CREATE SCHEMA net;
CREATE TABLE net.requests(body jsonb);
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO net.requests VALUES(body); RETURN 1; END; $$;
