-- 検証環境（ステージング）だけ: 点検用の 3 アカウントのアプリ側の情報を作り直す。
-- mirror-prod-to-staging.sh が public を本番の写しで上書きすると、検証環境で作った
-- users / customers / staff が消える（auth.users は写しの対象外なので残る）。
-- 毎日の点検（予約・キャンセル・貸切・削除）で使うので、写しの直後に作り直す。
--
--   顧客A  qa-customer-a-20261001@example.invalid  お客様
--   顧客B  qa-customer-b-20261001@example.invalid  お客様（貸切グループの招待相手）
--   スタッフ qa-staff-20261001@example.invalid      クインズワルツの管理者（テスト予約の削除に管理者が要る）
--
-- 名前・電話は架空。宛先は @example.invalid なので、検証環境の守り（outbound-guard）を
-- 通っても誰にも届かない。auth.users に無いアカウントは作らない（本番には存在しない）。
-- 2026-11-13 社長承認（MMQ毎日点検の検証環境整備）。

DO $$
DECLARE
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';  -- クインズワルツ
  v_a uuid;
  v_b uuid;
  v_staff uuid;
BEGIN
  SELECT id INTO v_a FROM auth.users WHERE email = 'qa-customer-a-20261001@example.invalid';
  SELECT id INTO v_b FROM auth.users WHERE email = 'qa-customer-b-20261001@example.invalid';
  SELECT id INTO v_staff FROM auth.users WHERE email = 'qa-staff-20261001@example.invalid';

  IF v_a IS NOT NULL THEN
    INSERT INTO public.users (id, email, role, organization_id, display_name)
    VALUES (v_a, 'qa-customer-a-20261001@example.invalid', 'customer', NULL, 'QA顧客A')
    ON CONFLICT (id) DO UPDATE SET role = 'customer', organization_id = NULL, display_name = 'QA顧客A';
    INSERT INTO public.customers (user_id, name, nickname, phone, email, email_verified, organization_id, birth_date, prefecture, notification_settings)
    SELECT v_a, 'QA顧客A', 'QA-A', '09000000001', 'qa-customer-a-20261001@example.invalid', true, NULL, DATE '2000-01-01', '東京都',
           '{"email_notifications":true,"campaign_notifications":false,"reminder_notifications":true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_a);
  END IF;

  IF v_b IS NOT NULL THEN
    INSERT INTO public.users (id, email, role, organization_id, display_name)
    VALUES (v_b, 'qa-customer-b-20261001@example.invalid', 'customer', NULL, 'QA顧客B')
    ON CONFLICT (id) DO UPDATE SET role = 'customer', organization_id = NULL, display_name = 'QA顧客B';
    INSERT INTO public.customers (user_id, name, nickname, phone, email, email_verified, organization_id, birth_date, prefecture, notification_settings)
    SELECT v_b, 'QA顧客B', 'QA-B', '09000000002', 'qa-customer-b-20261001@example.invalid', true, NULL, DATE '2000-01-01', '東京都',
           '{"email_notifications":true,"campaign_notifications":false,"reminder_notifications":true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = v_b);
  END IF;

  IF v_staff IS NOT NULL THEN
    INSERT INTO public.users (id, email, role, organization_id, display_name)
    VALUES (v_staff, 'qa-staff-20261001@example.invalid', 'admin', v_org, 'QAスタッフ')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', organization_id = v_org, display_name = 'QAスタッフ';
    INSERT INTO public.staff (name, role, status, email, user_id, organization_id, stores)
    SELECT 'QAスタッフ', ARRAY['staff', 'admin'], 'active', 'qa-staff-20261001@example.invalid', v_staff, v_org, ARRAY[]::text[]
    WHERE NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id = v_staff);
  END IF;
END $$;
