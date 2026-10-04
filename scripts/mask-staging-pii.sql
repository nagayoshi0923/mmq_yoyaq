-- =============================================================================
-- ステージングDBのお客様情報を伏せる（mirror-prod-to-staging.sh から、リストア直後・
-- トリガー無効のまま同じトランザクション内で読み込む）。
--
-- 対象: お客様・参加者・問い合わせ者・作者の 名前 / メール / 電話番号 / 住所。
-- メールは同じ元アドレスが同じ偽アドレスになる（表をまたいだ紐付けと一意制約を保つ）。
-- 偽アドレスは届かないドメイン example.invalid。ステージングから実在の人へ送信されない。
-- 店舗・会社のメールは対象外。Discord の送信先とスタッフのメールは、えいきち以外を外す（末尾）。
-- =============================================================================

CREATE FUNCTION pg_temp.mask_email(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v
              ELSE 'masked+' || left(md5(lower(btrim(v))), 12) || '@example.invalid' END
$$;

CREATE FUNCTION pg_temp.mask_name(v text, label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v
              ELSE label || '-' || left(md5(v), 6) END
$$;

CREATE FUNCTION pg_temp.mask_phone(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v ELSE '000-0000-0000' END
$$;

UPDATE customers SET
  name = pg_temp.mask_name(name, 'テスト顧客'),
  nickname = pg_temp.mask_name(nickname, 'テスト'),
  email = pg_temp.mask_email(email),
  phone = pg_temp.mask_phone(phone),
  address = NULL;

UPDATE reservations SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  display_customer_name = pg_temp.mask_name(display_customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email),
  customer_phone = pg_temp.mask_phone(customer_phone),
  participant_names = CASE WHEN participant_names IS NULL THEN NULL
    ELSE ARRAY(SELECT '参加者' || i FROM generate_subscripts(participant_names, 1) AS i) END;

UPDATE private_booking_requests SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email),
  customer_phone = pg_temp.mask_phone(customer_phone);

UPDATE private_group_members SET
  guest_name = pg_temp.mask_name(guest_name, 'テスト参加者'),
  guest_email = pg_temp.mask_email(guest_email),
  guest_phone = pg_temp.mask_phone(guest_phone);

UPDATE private_group_members_pii SET
  guest_name = pg_temp.mask_name(guest_name, 'テスト参加者'),
  guest_email = pg_temp.mask_email(guest_email),
  guest_phone = pg_temp.mask_phone(guest_phone);

UPDATE private_group_invitations SET invited_email = pg_temp.mask_email(invited_email);

UPDATE waitlist SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email),
  customer_phone = pg_temp.mask_phone(customer_phone);

UPDATE booking_email_queue SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email);

UPDATE email_logs SET
  to_name = pg_temp.mask_name(to_name, 'テスト顧客'),
  to_email = pg_temp.mask_email(to_email);

UPDATE private_booking_rejection_deliveries SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email);

UPDATE private_group_survey_deliveries SET
  customer_name = pg_temp.mask_name(customer_name, 'テスト顧客'),
  customer_email = pg_temp.mask_email(customer_email);

UPDATE performance_recruitment_notices SET customer_email = pg_temp.mask_email(customer_email);

UPDATE contact_inquiries SET
  name = pg_temp.mask_name(name, '問い合わせ者'),
  email = pg_temp.mask_email(email),
  contact_email = pg_temp.mask_email(contact_email);

UPDATE schedule_events SET reservation_name = pg_temp.mask_name(reservation_name, 'テスト予約')
  WHERE reservation_name IS NOT NULL;

-- 作者の連絡先（ステージングからライセンス報告が実在の作者へ届かないように）
UPDATE authors SET email = pg_temp.mask_email(email);
UPDATE scenario_masters SET author_email = pg_temp.mask_email(author_email);
UPDATE scenarios SET author_email = pg_temp.mask_email(author_email);
UPDATE license_report_history SET author_email = pg_temp.mask_email(author_email);

-- 外部への送信先（Discord）を外す（2026-10-04）。
-- ステージングの自動判定（毎分の追加募集・開催判断）や通知が、本番の写しの送信先を使って
-- 実在のスタッフの Discord（業務連絡・個人チャンネル）へ届いていた（本番では開催の公演に「中止」と届いた）。
-- ステージングの通知は社長（えいきち）にだけ届く決まりなので、えいきち以外の送信先を外す。
-- 環境変数の Bot は残るが、送信先のチャンネルが無ければ送られない。
UPDATE organization_settings SET
  discord_webhook_url = NULL,
  discord_channel_id = NULL,
  discord_private_booking_channel_id = NULL,
  discord_shift_channel_id = NULL,
  discord_business_channel_id = NULL,
  discord_bot_token = NULL;
UPDATE notification_settings SET discord_webhook_url = NULL, discord_shift_channel_id = NULL;
UPDATE staff SET discord_channel_id = NULL, discord_user_id = NULL, discord_id = NULL
  WHERE name IS DISTINCT FROM 'えいきち';
UPDATE license_partner_stores SET discord_channel_id = NULL;
-- スタッフのメールも、えいきち以外は届かない偽アドレスにする（自動の中止メールは、メールの無いスタッフ予約へ
-- スタッフ名簿のメールを使って送るため、ステージングから実在のスタッフへ届きうる）
UPDATE staff SET email = pg_temp.mask_email(email) WHERE name IS DISTINCT FROM 'えいきち' AND email IS NOT NULL;
-- 本番から写した送信待ちは送らない
UPDATE discord_notification_queue SET status = 'completed', last_error = 'staging_mirror_no_send'
  WHERE status IN ('pending', 'sending', 'failed');
