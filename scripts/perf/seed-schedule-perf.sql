-- スケジュール管理の性能計測用の架空データ（手元の local-repro DB 専用。本番・staging では実行しない）
-- 規模は 2026-10 の本番の最大組織に合わせる: 店舗 7（+臨時 2）、スタッフ 50、作品 260、担当 約4,000、
-- 公演 約390件/月 × 7か月（2026-07〜2027-01）、予約 約13,000、シフト 約800件/月、顧客 1,400。
-- 実行: docker exec -i supabase_db_mmq-local-repro psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/perf/seed-schedule-perf.sql
-- 何度流しても同じ状態になる（先に perf-org のデータを消す）。トリガーは止めて入れる（通知・外部送信を起こさない）。
-- ログイン: perf-admin@perf.test（パスワードは local-repro/README.md の共通値）

\set org '''e0000000-0000-4000-a000-000000000001'''
BEGIN;
SET LOCAL session_replication_role = replica;
SELECT setseed(0.42);

-- 既存の perf-org データを消す
DELETE FROM public.reservations WHERE organization_id = :org;
DELETE FROM public.schedule_events WHERE organization_id = :org;
DELETE FROM public.shift_submissions WHERE organization_id = :org;
DELETE FROM public.daily_memos WHERE organization_id = :org;
DELETE FROM public.schedule_slot_memos WHERE organization_id = :org;
DELETE FROM public.staff_scenario_assignments WHERE organization_id = :org;
DELETE FROM public.organization_scenarios WHERE organization_id = :org;
DELETE FROM public.customers WHERE organization_id = :org;
DELETE FROM public.staff WHERE organization_id = :org;
DELETE FROM public.users WHERE organization_id = :org;
DELETE FROM public.stores WHERE organization_id = :org;
DELETE FROM public.scenario_masters WHERE submitted_by_organization_id = :org;
DELETE FROM auth.identities WHERE user_id = 'e0000000-0000-4000-b000-000000000001';
DELETE FROM auth.users WHERE id = 'e0000000-0000-4000-b000-000000000001';
DELETE FROM public.organizations WHERE id = :org;

INSERT INTO public.organizations (id, name, slug, contact_email, is_active, booking_site_status, plan)
VALUES (:org, '性能試験劇団', 'perf-org', 'perf-admin@perf.test', true, 'approved', 'pro');

-- 店舗 7 + 臨時会場 2
INSERT INTO public.stores (id, organization_id, name, short_name, status, capacity, rooms, display_order, ownership_type, is_temporary, color)
SELECT md5('perf-store-' || i)::uuid, :org, '試験店舗' || i, '試' || i, 'active', 8, 1, i,
       CASE WHEN i = 7 THEN 'office' ELSE 'corporate' END, false,
       (ARRAY['blue','green','purple','orange','red','amber','teal'])[i]
FROM generate_series(1, 7) i;
INSERT INTO public.stores (id, organization_id, name, short_name, status, capacity, rooms, display_order, ownership_type, is_temporary, temporary_dates)
SELECT md5('perf-temp-' || i)::uuid, :org, '臨時会場' || i, '臨' || i, 'active', 8, 1, 100 + i, 'corporate', true,
       jsonb_build_array('2026-10-1' || i, '2026-11-1' || i)
FROM generate_series(1, 2) i;

-- 作品 300（うち 260 を組織で使う）
INSERT INTO public.scenario_masters (id, title, author, player_count_min, player_count_max, official_duration, master_status, submitted_by_organization_id, is_shared)
SELECT md5('perf-sm-' || i)::uuid, '試験作品' || lpad(i::text, 3, '0'), '試験作者' || (i % 40), 4 + (i % 3), 6 + (i % 3),
       180 + (i % 5) * 30, 'approved', :org, false
FROM generate_series(1, 300) i;
INSERT INTO public.organization_scenarios (id, organization_id, scenario_master_id, slug, duration, participation_fee, org_status, accepts_private_booking, web_published, gm_count, available_stores)
SELECT md5('perf-os-' || i)::uuid, :org, md5('perf-sm-' || i)::uuid, 'perf-' || i, 180 + (i % 5) * 30, 4000 + (i % 4) * 500, 'available', true, true, 1,
       ARRAY(SELECT md5('perf-store-' || s)::text FROM generate_series(1, 6) s)
FROM generate_series(1, 260) i;

-- 管理者アカウント
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-b000-000000000001', 'authenticated', 'authenticated', 'perf-admin@perf.test',
  extensions.crypt('repro-local-2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (gen_random_uuid(), 'e0000000-0000-4000-b000-000000000001', 'e0000000-0000-4000-b000-000000000001',
  jsonb_build_object('sub', 'e0000000-0000-4000-b000-000000000001', 'email', 'perf-admin@perf.test', 'email_verified', true), 'email', now(), now(), now());
INSERT INTO public.users (id, email, role, organization_id, display_name)
VALUES ('e0000000-0000-4000-b000-000000000001', 'perf-admin@perf.test', 'admin', :org, '試験管理者')
ON CONFLICT (id) DO UPDATE SET role = 'admin', organization_id = EXCLUDED.organization_id;

-- スタッフ 50（1 人目が管理者）
INSERT INTO public.staff (id, name, email, user_id, organization_id, role, status, stores)
SELECT md5('perf-staff-' || i)::uuid, '試験スタッフ' || lpad(i::text, 2, '0'),
       CASE WHEN i = 1 THEN 'perf-admin@perf.test' ELSE 'perf-staff' || i || '@perf.test' END,
       CASE WHEN i = 1 THEN 'e0000000-0000-4000-b000-000000000001'::uuid ELSE NULL END,
       :org, CASE WHEN i = 1 THEN ARRAY['管理者','GM'] ELSE ARRAY['GM'] END, 'active',
       ARRAY(SELECT md5('perf-store-' || s)::text FROM generate_series(1, 6) s)
FROM generate_series(1, 50) i;

-- 担当（スタッフごとに 80 作品）
INSERT INTO public.staff_scenario_assignments (staff_id, scenario_id, scenario_master_id, organization_id, can_main_gm, can_sub_gm, is_experienced)
SELECT md5('perf-staff-' || s)::uuid, md5('perf-sm-' || sc)::uuid, md5('perf-sm-' || sc)::uuid, :org, sc % 3 <> 0, sc % 3 <> 0, (sc % 3 = 0)
FROM generate_series(1, 50) s
CROSS JOIN LATERAL (SELECT DISTINCT 1 + ((s * 7 + k * 3) % 260) AS sc FROM generate_series(1, 80) k) x;

-- 顧客 1,400
INSERT INTO public.customers (id, organization_id, name, nickname, email)
SELECT md5('perf-cust-' || i)::uuid, :org, '試験顧客' || i, '試験' || i, 'perf-cust' || i || '@perf.test'
FROM generate_series(1, 1400) i;

-- 公演（2026-07-01〜2027-01-31、各店舗 6 つ × 3 枠 × 確率 0.72）
CREATE TEMP TABLE perf_ev ON COMMIT DROP AS
SELECT md5('perf-ev-' || d::date || '-' || s || '-' || slot)::uuid AS id,
       d::date AS date, s, slot,
       1 + floor(random() * 260)::int AS sc,
       random() AS rcat, random() AS rcancel
FROM generate_series('2026-07-01'::date, '2027-01-31'::date, '1 day') d
CROSS JOIN generate_series(1, 6) s
CROSS JOIN generate_series(1, 3) slot
WHERE random() < 0.72;

INSERT INTO public.schedule_events (id, organization_id, date, venue, store_id, scenario, scenario_master_id, organization_scenario_id,
  gms, gm_roles, start_time, end_time, category, is_cancelled, capacity, max_participants, current_participants,
  is_reservation_enabled, time_slot, notes, is_tentative)
SELECT e.id, :org, e.date, md5('perf-store-' || e.s)::text, md5('perf-store-' || e.s)::uuid,
       '試験作品' || lpad(e.sc::text, 3, '0'), md5('perf-sm-' || e.sc)::uuid, md5('perf-os-' || e.sc)::uuid,
       ARRAY['試験スタッフ' || lpad((1 + (abs(hashtext(e.id::text)) % 50))::text, 2, '0')],
       '{}'::jsonb,
       (ARRAY['10:00','14:00','19:00'])[e.slot]::time, (ARRAY['13:30','17:30','22:30'])[e.slot]::time,
       CASE WHEN e.rcat < 0.49 THEN 'open' WHEN e.rcat < 0.86 THEN 'private' WHEN e.rcat < 0.92 THEN 'gmtest'
            WHEN e.rcat < 0.96 THEN 'offsite' WHEN e.rcat < 0.99 THEN 'testplay' ELSE 'mtg' END,
       e.rcancel < 0.05, 6 + (e.sc % 3), 6 + (e.sc % 3), 0,
       true, (ARRAY['morning','afternoon','evening'])[e.slot], '', false
FROM perf_ev e;

-- 予約: 公開公演に 1〜6 件、貸切公演に貸切予約 1 件（約 13,000 件）
INSERT INTO public.reservations (id, organization_id, reservation_number, title, scenario_master_id, store_id, customer_id, customer_name,
  requested_datetime, duration, participant_count, status, reservation_source, schedule_event_id, candidate_datetimes, total_price, final_price)
SELECT md5('perf-res-' || e.id || '-' || n)::uuid, :org, 'P' || substr(md5(e.id || '-' || n), 1, 10),
       '試験作品' || lpad(e.sc::text, 3, '0'), md5('perf-sm-' || e.sc)::uuid, md5('perf-store-' || e.s)::uuid,
       md5('perf-cust-' || (1 + (abs(hashtext(e.id::text || n)) % 1400)))::uuid, '試験顧客',
       (e.date::text || ' 19:00:00+09')::timestamptz, 210,
       CASE WHEN e.rcat >= 0.49 AND e.rcat < 0.86 THEN 6 ELSE 1 + (n % 2) END,
       CASE WHEN n % 9 = 0 THEN 'cancelled' ELSE 'confirmed' END,
       CASE WHEN e.rcat >= 0.49 AND e.rcat < 0.86 THEN 'web_private' WHEN n % 3 = 0 THEN 'demo' ELSE 'web' END,
       e.id,
       CASE WHEN e.rcat >= 0.49 AND e.rcat < 0.86 THEN jsonb_build_object('candidates', jsonb_build_array(jsonb_build_object(
         'date', e.date::text, 'order', 1, 'status', 'confirmed',
         'timeSlot', (ARRAY['午前','午後','夜'])[e.slot], 'startTime', (ARRAY['10:00','14:00','19:00'])[e.slot], 'endTime', (ARRAY['13:30','17:30','22:30'])[e.slot])))
       ELSE NULL END,
       4500, 4500
FROM perf_ev e
CROSS JOIN LATERAL generate_series(1, CASE WHEN e.rcat >= 0.49 AND e.rcat < 0.86 THEN 1 WHEN e.rcat < 0.49 THEN 2 + (abs(hashtext(e.id::text)) % 10) ELSE 0 END) n;

UPDATE public.schedule_events se SET current_participants = x.p
FROM (SELECT schedule_event_id, sum(participant_count) p FROM public.reservations
      WHERE organization_id = :org AND status <> 'cancelled' GROUP BY 1) x
WHERE se.id = x.schedule_event_id;
UPDATE public.schedule_events se SET reservation_id = r.id
FROM public.reservations r WHERE r.schedule_event_id = se.id AND r.reservation_source = 'web_private' AND se.organization_id = :org;

-- シフト（スタッフ 50 × 日 × 確率 0.55 ≒ 850件/月）
INSERT INTO public.shift_submissions (id, organization_id, staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT gen_random_uuid(), :org, md5('perf-staff-' || s)::uuid, d::date, random() < 0.4, random() < 0.6, random() < 0.7, false, 'submitted', now()
FROM generate_series('2026-07-01'::date, '2027-01-31'::date, '1 day') d
CROSS JOIN generate_series(1, 50) s
WHERE random() < 0.55;

-- メモ
INSERT INTO public.daily_memos (id, organization_id, date, venue_id, memo_text)
SELECT gen_random_uuid(), :org, d::date, md5('perf-store-' || s)::uuid, '試験メモ'
FROM generate_series('2026-07-01'::date, '2027-01-31'::date, '1 day') d
CROSS JOIN generate_series(1, 6) s WHERE random() < 0.6;
INSERT INTO public.schedule_slot_memos (organization_id, date, store_id, time_slot, memo)
SELECT :org, d::date, md5('perf-store-' || s)::uuid, 'morning', '空き枠メモ'
FROM generate_series('2026-07-01'::date, '2027-01-31'::date, '1 day') d
CROSS JOIN generate_series(1, 6) s WHERE random() < 0.25;

COMMIT;
ANALYZE public.schedule_events; ANALYZE public.reservations; ANALYZE public.shift_submissions; ANALYZE public.staff_scenario_assignments;
SELECT 'events/月(2026-10)', count(*) FROM public.schedule_events WHERE organization_id = :org AND date BETWEEN '2026-10-01' AND '2026-10-31'
UNION ALL SELECT 'reservations', count(*) FROM public.reservations WHERE organization_id = :org
UNION ALL SELECT 'shifts/月(2026-10)', count(*) FROM public.shift_submissions WHERE organization_id = :org AND date BETWEEN '2026-10-01' AND '2026-10-31'
UNION ALL SELECT 'assignments', count(*) FROM public.staff_scenario_assignments WHERE organization_id = :org;
