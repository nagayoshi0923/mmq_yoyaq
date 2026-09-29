-- 不具合再現用テストデータ（ローカル専用・実在の顧客/店舗情報は含まない）
-- アカウント: local-repro/README.md 参照（パスワードは README 記載の共通値）


-- 組織・店舗・作品 -------------------------------------------------------
INSERT INTO public.organizations (id, name, slug, contact_email, is_active, booking_site_status)
VALUES ('00000000-0000-4000-a000-000000000001', 'テスト劇団', 'repro-org', 'admin@repro.test', true, 'approved');

INSERT INTO public.stores (id, organization_id, name, short_name, address, status, capacity, rooms, display_order, ownership_type)
VALUES
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', 'テスト店舗A', 'テA', '東京都テスト区1-1', 'active', 8, 1, 1, 'corporate'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000001', 'テスト店舗B', 'テB', '東京都テスト区2-2', 'active', 8, 1, 2, 'corporate');

INSERT INTO public.scenario_masters (id, title, author, player_count_min, player_count_max, official_duration, master_status, submitted_by_organization_id, is_shared)
VALUES ('00000000-0000-4000-a000-000000000201', 'テスト作品', 'テスト作者', 4, 7, 240, 'approved', '00000000-0000-4000-a000-000000000001', false);

INSERT INTO public.organization_scenarios (id, organization_id, scenario_master_id, slug, duration, participation_fee, org_status, accepts_private_booking, web_published, gm_count, available_stores)
VALUES ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000201', 'test-scenario', 240, 4500, 'available', true, true, 1,
        ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']);

-- 認証ユーザー ------------------------------------------------------------
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('repro-local-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
FROM (VALUES
  ('00000000-0000-4000-b000-000000000001', 'admin@repro.test'),
  ('00000000-0000-4000-b000-000000000002', 'gm@repro.test'),
  ('00000000-0000-4000-b000-000000000011', 'customer1@repro.test'),
  ('00000000-0000-4000-b000-000000000012', 'customer2@repro.test')
) AS u(id, email);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
FROM auth.users;

-- スタッフ（管理者・GM） ---------------------------------------------------
INSERT INTO public.staff (id, name, email, user_id, organization_id, role, status, stores)
VALUES
  ('00000000-0000-4000-c000-000000000001', 'テスト管理者', 'admin@repro.test', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-a000-000000000001', ARRAY['管理者'], 'active',
   ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']),
  ('00000000-0000-4000-c000-000000000002', 'テストGM', 'gm@repro.test', '00000000-0000-4000-b000-000000000002',
   '00000000-0000-4000-a000-000000000001', ARRAY['GM'], 'active',
   ARRAY['00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']);

UPDATE public.users SET role = 'admin', organization_id = '00000000-0000-4000-a000-000000000001'
WHERE id = '00000000-0000-4000-b000-000000000001';
UPDATE public.users SET role = 'staff', organization_id = '00000000-0000-4000-a000-000000000001'
WHERE id = '00000000-0000-4000-b000-000000000002';

-- お客さん（顧客プロフィール） ----------------------------------------------
INSERT INTO public.customers (user_id, organization_id, name, nickname, email, phone, prefecture, birth_date)
VALUES
  ('00000000-0000-4000-b000-000000000011', NULL, 'テスト幹事', 'テスト幹事', 'customer1@repro.test', '090-0000-0011', '東京都', '1990-01-01'),
  ('00000000-0000-4000-b000-000000000012', NULL, 'テスト参加者', 'テスト参加者', 'customer2@repro.test', '090-0000-0012', '東京都', '1990-01-01');
