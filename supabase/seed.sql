-- =============================================================================
-- 手元の開発用 試験データ（ローカル Supabase 専用。壊してよい）
--
-- 入れ方: npm run dev:full（初回起動時に自動）／ npm run supabase:reset（入れ直し）
-- アカウントとパスワード: docs/development/local-dev.md の「試験アカウント」
--
-- - 実在のお客様・スタッフ・店舗の情報は含まない。メールは全て *.test（送信されない）。
-- - 日付は「投入した日（日本時間）」からの相対。日が経ったら npm run supabase:reset で入れ直す。
-- - 貸切グループは画面と同じ RPC（お客様・スタッフとしてログインした扱い）で作るので、
--   制約・トリガー・権限確認を通った「本物と同じ形」のデータになる。
-- =============================================================================

-- 固定 ID（試験・文書から参照しやすいように）
--   組織            00000000-0000-4000-a000-000000000001  slug: queens-waltz
--   店舗            ...a000-000000000101（本店）/ ...0102（二号店）
--   作品（マスタ）  ...a000-000000000201 6人固定 / ...0202 5〜8人 / ...0203 事前読み込みあり
--   作品（組織）    ...a000-000000000301 / 0302 / 0303
--   ログインユーザー ...b000-000000000001 管理者 / ...0011 お客様1 / ...0012 お客様2（ニックネーム無し）

-- 組織 -------------------------------------------------------------------------
-- 組織を作るとトリガーで organization_settings・global_settings・臨時会場 1〜5 が自動で作られる（本番と同じ）
INSERT INTO public.organizations (id, name, slug, plan, contact_email, contact_name, is_active, booking_site_status,
  public_booking_hero_description)
VALUES ('00000000-0000-4000-a000-000000000001', 'Queens Waltz（手元試験）', 'queens-waltz', 'free',
  'staff-admin@mmq.test', '試験 管理者', true, 'approved',
  '手元の開発環境の試験データです。予約・取消は自由に試してください。');

-- 店舗 -------------------------------------------------------------------------
INSERT INTO public.stores (id, organization_id, name, short_name, address, status, capacity, rooms,
  display_order, ownership_type, color, region, access_info)
VALUES
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', '試験 本店', '本店',
   '東京都試験区本町1-1', 'active', 8, 1, 1, 'corporate', '#3B82F6', '東京都', '試験駅から徒歩1分'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000001', '試験 二号店', '二号',
   '東京都試験区二町2-2', 'active', 8, 1, 2, 'corporate', '#10B981', '東京都', '試験駅から徒歩5分');

-- 作品 -------------------------------------------------------------------------
INSERT INTO public.scenario_masters (id, title, author, description, synopsis, player_count_min, player_count_max,
  official_duration, genre, has_pre_reading, master_status, submitted_by_organization_id, is_shared)
VALUES
  ('00000000-0000-4000-a000-000000000201', '試験作品・六人の館', '試験 作者A', '人数固定（6名）の試験作品',
   '六人だけが招かれた館で事件が起きる。', 6, 6, 240, ARRAY['ミステリー'], false, 'approved',
   '00000000-0000-4000-a000-000000000001', false),
  ('00000000-0000-4000-a000-000000000202', '試験作品・揺れる人数', '試験 作者B', '5〜8名で遊べる人数可変の試験作品',
   '集まった人数で結末が変わる。', 5, 8, 210, ARRAY['ミステリー'], false, 'approved',
   '00000000-0000-4000-a000-000000000001', false),
  ('00000000-0000-4000-a000-000000000203', '試験作品・事前の手紙', '試験 作者C', '事前読み込み（読み合わせ）ありの試験作品',
   '公演前に届く手紙を読んでから参加する。', 4, 5, 180, ARRAY['ドラマ'], true, 'approved',
   '00000000-0000-4000-a000-000000000001', false);

INSERT INTO public.organization_scenarios (id, organization_id, scenario_master_id, slug, duration,
  participation_fee, org_status, accepts_private_booking, web_published, gm_count, available_stores)
VALUES
  ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000201', 'test-six-fixed', 240, 4500, 'available', true, true, 1,
   ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']),
  ('00000000-0000-4000-a000-000000000302', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000202', 'test-flex-5-8', 210, 5000, 'available', true, true, 1,
   ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']),
  ('00000000-0000-4000-a000-000000000303', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000203', 'test-pre-reading', 180, 5500, 'available', true, true, 1,
   ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']);

-- 登録クーポンのキャンペーン（会員登録時に配る型。組織顧客の作成時にトリガーで付与される）
INSERT INTO public.coupon_campaigns (id, organization_id, name, display_name, description, discount_type,
  discount_amount, max_uses_per_customer, target_type, trigger_type, coupon_expiry_days, is_active, customer_terms)
VALUES ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-a000-000000000001', '試験 新規登録クーポン',
  '新規登録 500円引き', '手元試験用の登録クーポン', 'fixed', 500, 1, 'all', 'registration', 90, true,
  '1回限り・他クーポンと併用可（試験データ）');

-- ログインユーザー（パスワードは docs/development/local-dev.md）--------------------
-- auth.users を入れると on_auth_user_created トリガーで public.users（role=customer）が作られる
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('mmq-local-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
FROM (VALUES
  ('00000000-0000-4000-b000-000000000001', 'staff-admin@mmq.test'),
  ('00000000-0000-4000-b000-000000000011', 'customer1@mmq.test'),
  ('00000000-0000-4000-b000-000000000012', 'customer2@mmq.test')
) AS u(id, email);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
FROM auth.users
WHERE id IN ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000011',
             '00000000-0000-4000-b000-000000000012');

-- スタッフ（管理者・GM を兼ねる）------------------------------------------------
INSERT INTO public.staff (id, name, email, user_id, organization_id, role, status, stores)
VALUES ('00000000-0000-4000-c000-000000000001', '試験 管理者', 'staff-admin@mmq.test',
  '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', ARRAY['管理者'], 'active',
  ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']);

UPDATE public.users SET role = 'admin', organization_id = '00000000-0000-4000-a000-000000000001',
  display_name = '試験 管理者'
WHERE id = '00000000-0000-4000-b000-000000000001';

-- お客様（どの組織にも属さない「プラットフォームのお客様」。本番の会員登録と同じ形）------
INSERT INTO public.customers (id, user_id, organization_id, name, nickname, email, email_verified, phone,
  prefecture, birth_date)
VALUES
  ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-b000-000000000011', NULL, '試験 一子', 'いちこ',
   'customer1@mmq.test', true, '09000000011', '東京都', '1990-01-01'),
  ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-b000-000000000012', NULL, '試験 二郎', NULL,
   'customer2@mmq.test', true, '09000000012', '神奈川県', '1992-02-02');

-- お客様1 には登録クーポンを 1 枚持たせておく（クーポン適用の確認用）
INSERT INTO public.customer_coupons (campaign_id, customer_id, organization_id, uses_remaining, expires_at, status)
VALUES ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-d000-000000000011',
  '00000000-0000-4000-a000-000000000001', 1, now() + interval '90 days', 'active');

-- 一般公演（今日から 14 日分）------------------------------------------------------
-- 満席・残り 1・空きありを含む。日付・時刻は日本時間。
WITH base AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS today),
ev(id, day, store_id, os_id, start_t, end_t, slot, max_p) AS (VALUES
  ('00000000-0000-4000-e000-000000000001'::uuid, 2,  '00000000-0000-4000-a000-000000000101'::uuid, '00000000-0000-4000-a000-000000000301'::uuid, '13:00'::time, '17:00'::time, '午後', 6),
  ('00000000-0000-4000-e000-000000000002'::uuid, 3,  '00000000-0000-4000-a000-000000000102'::uuid, '00000000-0000-4000-a000-000000000302'::uuid, '18:00'::time, '21:30'::time, '夜間', 8),
  ('00000000-0000-4000-e000-000000000003'::uuid, 5,  '00000000-0000-4000-a000-000000000101'::uuid, '00000000-0000-4000-a000-000000000303'::uuid, '13:00'::time, '16:00'::time, '午後', 5),
  ('00000000-0000-4000-e000-000000000004'::uuid, 7,  '00000000-0000-4000-a000-000000000102'::uuid, '00000000-0000-4000-a000-000000000301'::uuid, '18:00'::time, '22:00'::time, '夜間', 6),
  ('00000000-0000-4000-e000-000000000005'::uuid, 10, '00000000-0000-4000-a000-000000000101'::uuid, '00000000-0000-4000-a000-000000000302'::uuid, '13:00'::time, '16:30'::time, '午後', 8),
  ('00000000-0000-4000-e000-000000000006'::uuid, 12, '00000000-0000-4000-a000-000000000102'::uuid, '00000000-0000-4000-a000-000000000303'::uuid, '10:00'::time, '13:00'::time, '午前', 5)
)
INSERT INTO public.schedule_events (id, organization_id, date, venue, scenario, store_id, organization_scenario_id,
  scenario_master_id, scenario_id, start_time, end_time, start_at, end_at, time_slot, category, published,
  is_reservation_enabled, max_participants, capacity, gms, gm_roles, venue_rental_fee)
SELECT ev.id, '00000000-0000-4000-a000-000000000001', base.today + ev.day, st.name, sm.title, ev.store_id, ev.os_id,
  os.scenario_master_id, os.scenario_master_id, ev.start_t, ev.end_t,
  ((base.today + ev.day) + ev.start_t) AT TIME ZONE 'Asia/Tokyo',
  ((base.today + ev.day) + ev.end_t) AT TIME ZONE 'Asia/Tokyo',
  ev.slot, 'open', true, true, ev.max_p, ev.max_p, ARRAY['試験 管理者'], '{"試験 管理者": "main"}'::jsonb, 0
FROM ev
CROSS JOIN base
JOIN public.organization_scenarios os ON os.id = ev.os_id
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
JOIN public.stores st ON st.id = ev.store_id;

-- 既存の予約（店頭受付のゲスト扱い）で埋める: 1 本目は満席（6/6）、2 本目は残り 1（7/8）、5 本目は 2/8
INSERT INTO public.reservations (organization_id, schedule_event_id, title, scenario_master_id, store_id,
  requested_datetime, duration, participant_count, customer_name, customer_email, status, reservation_source,
  base_price, total_price, final_price, unit_price)
SELECT e.organization_id, e.id, e.scenario, e.scenario_master_id, e.store_id, e.start_at,
  (extract(epoch FROM e.end_at - e.start_at) / 60)::int, f.cnt, f.name, NULL, 'confirmed', 'walk_in',
  os.participation_fee * f.cnt, os.participation_fee * f.cnt, os.participation_fee * f.cnt, os.participation_fee
FROM (VALUES
  ('00000000-0000-4000-e000-000000000001'::uuid, 6, '試験ゲスト（満席分）'),
  ('00000000-0000-4000-e000-000000000002'::uuid, 7, '試験ゲスト（残り1分）'),
  ('00000000-0000-4000-e000-000000000005'::uuid, 2, '試験ゲスト（2名）')
) AS f(event_id, cnt, name)
JOIN public.schedule_events e ON e.id = f.event_id
JOIN public.organization_scenarios os ON os.id = e.organization_scenario_id;

-- 貸切グループ（3 状態）-------------------------------------------------------------
-- 画面と同じ RPC を、お客様1・管理者としてログインした扱い（JWT の sub を設定）で呼ぶ
CREATE FUNCTION pg_temp.seed_act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aud', 'authenticated')::text, false),
    set_config('request.jwt.claim.sub', p_user::text, false);
$$;

SELECT pg_temp.seed_act_as('00000000-0000-4000-b000-000000000011');

-- (1) 人集め中: 候補日 2 つ・二号店希望
SELECT public.create_private_group_atomic(
  '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000202', '試験貸切・人集め中',
  ARRAY['00000000-0000-4000-a000-000000000102']::uuid[],
  jsonb_build_array(
    jsonb_build_object('date', ((now() AT TIME ZONE 'Asia/Tokyo')::date + 20)::text, 'time_slot', '夜間', 'start_time', '18:00', 'end_time', '21:30'),
    jsonb_build_object('date', ((now() AT TIME ZONE 'Asia/Tokyo')::date + 21)::text, 'time_slot', '午後', 'start_time', '13:00', 'end_time', '16:30')
  ), NULL);

-- (2) 申込済み・店舗確認待ち: グループを作って貸切リクエストを送る
SELECT public.create_private_group_atomic(
  '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000201', '試験貸切・店舗確認待ち',
  ARRAY['00000000-0000-4000-a000-000000000101']::uuid[],
  jsonb_build_array(
    jsonb_build_object('date', ((now() AT TIME ZONE 'Asia/Tokyo')::date + 24)::text, 'time_slot', '午後', 'start_time', '13:00', 'end_time', '17:00'),
    jsonb_build_object('date', ((now() AT TIME ZONE 'Asia/Tokyo')::date + 25)::text, 'time_slot', '夜間', 'start_time', '18:00', 'end_time', '22:00')
  ), NULL);

SELECT public.create_private_booking_request(
  '00000000-0000-4000-a000-000000000201', '00000000-0000-4000-d000-000000000011', '試験 一子',
  'customer1@mmq.test', '09000000011', 6,
  jsonb_build_object(
    'requestedStores', jsonb_build_array(jsonb_build_object('storeId', '00000000-0000-4000-a000-000000000101')),
    'candidates', (
      SELECT jsonb_agg(jsonb_build_object('date', c.date::text, 'timeSlot', c.time_slot,
        'startTime', c.start_time, 'endTime', c.end_time) ORDER BY c.order_num)
      FROM public.private_group_candidate_dates c
      JOIN public.private_groups g ON g.id = c.group_id
      WHERE g.name = '試験貸切・店舗確認待ち')),
  '試験データ: 店舗確認待ちの貸切リクエスト', NULL,
  (SELECT id FROM public.private_groups WHERE name = '試験貸切・店舗確認待ち'));

-- (3) 確定: グループ → 貸切リクエスト → 管理者が承認
SELECT public.create_private_group_atomic(
  '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000203', '試験貸切・確定',
  ARRAY['00000000-0000-4000-a000-000000000102']::uuid[],
  jsonb_build_array(
    jsonb_build_object('date', ((now() AT TIME ZONE 'Asia/Tokyo')::date + 16)::text, 'time_slot', '午後', 'start_time', '13:00', 'end_time', '16:00')
  ), NULL);

SELECT public.create_private_booking_request(
  '00000000-0000-4000-a000-000000000203', '00000000-0000-4000-d000-000000000011', '試験 一子',
  'customer1@mmq.test', '09000000011', 4,
  jsonb_build_object(
    'requestedStores', jsonb_build_array(jsonb_build_object('storeId', '00000000-0000-4000-a000-000000000102')),
    'candidates', (
      SELECT jsonb_agg(jsonb_build_object('date', c.date::text, 'timeSlot', c.time_slot,
        'startTime', c.start_time, 'endTime', c.end_time) ORDER BY c.order_num)
      FROM public.private_group_candidate_dates c
      JOIN public.private_groups g ON g.id = c.group_id
      WHERE g.name = '試験貸切・確定')),
  '試験データ: 確定済みの貸切', NULL,
  (SELECT id FROM public.private_groups WHERE name = '試験貸切・確定'));

SELECT pg_temp.seed_act_as('00000000-0000-4000-b000-000000000001');

SELECT public.approve_private_booking(
  r.id, (r.candidate_datetimes->'candidates'->0->>'date')::date,
  (r.candidate_datetimes->'candidates'->0->>'startTime')::time,
  (r.candidate_datetimes->'candidates'->0->>'endTime')::time,
  '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-c000-000000000001',
  r.candidate_datetimes, '試験作品・事前の手紙', '試験 一子')
FROM public.reservations r
JOIN public.private_groups g ON g.reservation_id = r.id
WHERE g.name = '試験貸切・確定';

SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);
