-- 最小人工スキーマ。実データ・実Auth・通知triggerは含まない。

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY,title text,official_duration integer);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid REFERENCES scenario_masters(id),participation_fee integer,participation_costs jsonb,duration integer,override_title text,booking_cutoff_minutes integer);
CREATE TABLE organization_settings(organization_id uuid,custom_holidays jsonb);
CREATE TABLE users(id uuid PRIMARY KEY, role text, organization_id uuid);
CREATE TABLE staff(id uuid DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text);
CREATE TABLE staff_account_access(user_id uuid);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,scenario_id uuid,scenario_master_id uuid REFERENCES scenario_masters(id),organization_scenario_id uuid REFERENCES organization_scenarios(id),store_id uuid,date date,start_time time,end_time time,category text DEFAULT 'open',is_cancelled boolean DEFAULT false,published boolean DEFAULT true,is_reservation_enabled boolean DEFAULT true,max_participants integer,capacity integer,current_participants integer DEFAULT 0,booking_cutoff_minutes integer,updated_at timestamptz DEFAULT now(),CHECK(current_participants<=coalesce(max_participants,capacity)));
CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_event_id uuid REFERENCES schedule_events(id),scenario_id uuid,scenario_master_id uuid REFERENCES scenario_masters(id),store_id uuid,customer_id uuid REFERENCES customers(id),customer_name text,customer_email text,customer_phone text,requested_datetime timestamptz,duration integer,participant_count integer NOT NULL,participant_names text[],base_price integer,options_price integer,total_price integer,discount_amount integer,final_price integer,unit_price integer,payment_method text,payment_status text,status text,customer_notes text,reservation_number text UNIQUE,created_by uuid,organization_id uuid,title text,coupon_usage_id uuid,updated_at timestamptz DEFAULT now());
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE TABLE coupon_usages(id uuid DEFAULT gen_random_uuid(),customer_coupon_id uuid,reservation_id uuid,discount_amount integer);
CREATE TABLE global_settings(organization_id uuid,booking_cutoff_minutes integer);
CREATE TABLE performance_recruitment_deadlines(schedule_event_id uuid,organization_id uuid,deadline timestamptz,status text);
CREATE TABLE performance_cancellation_logs(schedule_event_id uuid,organization_id uuid,result text);
CREATE FUNCTION is_store_recruitment_paused(uuid,text,date) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.recruitment_paused',true),'false')='true'$$;
CREATE FUNCTION get_performance_judgment_deadline(uuid,uuid) RETURNS timestamptz LANGUAGE sql AS $$SELECT '2099-01-01'::timestamptz$$;
CREATE FUNCTION calculate_booking_participation_fee(integer,jsonb,date,time,boolean) RETURNS integer LANGUAGE sql AS $$SELECT $1$$;
CREATE FUNCTION coupon_discount_for_event(uuid,uuid,integer,uuid,uuid) RETURNS integer LANGUAGE sql AS $$SELECT 0$$;

GRANT USAGE ON SCHEMA auth,public TO service_role;

CREATE TABLE test_history(reservation_id uuid, operation text, participant_count integer);
CREATE FUNCTION test_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO test_history VALUES(NEW.id,TG_OP,NEW.participant_count); RETURN NEW; END$$;

CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid);
ALTER TABLE schedule_events ADD COLUMN is_private_booking boolean DEFAULT false;
ALTER TABLE reservations ADD COLUMN private_group_id uuid, ADD COLUMN reservation_source text, ADD COLUMN reservation_type text, ADD COLUMN reservation_change_policy_snapshot_version integer, ADD COLUMN reservation_change_deadline_hours_snapshot integer, ADD COLUMN cancellation_policy_snapshot_version integer, ADD COLUMN cancellation_policy_store_id uuid;
CREATE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('value',nullif(current_setting('test.change_deadline',true),'')::integer)$$;
