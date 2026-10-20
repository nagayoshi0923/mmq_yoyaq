-- 来店確認（もぎる）の記録は、DB を戻して当て直しても退避から書き戻せる（docs/ops/本番公開の戻し方_2026-10.md の (b)）。
-- 2026-10-21 Codex レビュー指摘 2: 20261020130000 の rollback が coupon_usages.redeemed_* を退避なしで消していた。
-- 流れ: 来店確認済み 4 件＋未確認 1 件を作る → 20261020220000〜20261020130000 の rollback を新しい順に流す
--       → 退避表に 4 件・ブラウザの役割から読めない → migration を古い順に当て直す（印は空）
--       → 書き戻しの UPDATE で 4 件が元の値に戻る。全部 1 つの取引で、最後に巻き戻す（手元 DB は変わらない）。
-- 2026-10-21 Codex 第 2 回再レビュー R3: 店舗の公開名（stores.public_name、20261011210000 の rollback で列ごと消える）も、
--   手順書の手で残す SQL で写す → 20261011210000 まで戻す → 当て直す → 手順書の書き戻し SQL で値が戻ることを確かめる。
-- 各ファイルの BEGIN; / COMMIT; は外して読み込む（外側の取引を途中で確定させないため）。npm run test:rpcs から実行する。
\set ON_ERROR_STOP on
\set rb220 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020220000_coupon_redeem_use_event_date.sql`
\set rb210 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020210000_private_booking_request_full_candidate_check.sql`
\set rb190 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020190000_coupon_use_same_day.sql`
\set rb180 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020180000_coupon_usage_redeem_same_day.sql`
\set rb160 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020160000_private_group_photo_limit.sql`
\set rb150 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020150000_private_booking_horizon_days.sql`
\set rb140 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020140000_private_request_withdraw_keep_group.sql`
\set rb130 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020130000_coupon_usage_redeem.sql`
\set rb20261020120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020120000_private_group_create_requires_public_scenario.sql`
\set rb20261020110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020110000_private_group_dates_aligned_once.sql`
\set rb20261020100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261020100000_respect_store_available_slots.sql`
\set rb20261015110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261015110000_private_booking_create_validate_special_open_day.sql`
\set rb20261015100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261015100000_scenario_slot_start_is_absolute.sql`
\set rb20261013130002 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261013130002_stale_staff_retry_compatibility.sql`
\set rb20261013130001 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261013130001_release_retry_concurrency_no_sleep.sql`
\set rb20261013130000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261013130000_private_group_date_responses_skip_stale.sql`
\set rb20261013120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261013120000_throttle_failing_private_group_and_staff_writes.sql`
\set rb20261012140000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261012140000_drop_broken_legacy_rpcs.sql`
\set rb20261012130000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261012130000_operator_add_participants.sql`
\set rb20261012120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261012120000_participant_change_keeps_coupon.sql`
\set rb20261012110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261012110000_private_group_photo_storage_usage.sql`
\set rb20261012100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261012100000_private_group_join_bell_next_step.sql`
\set rb20261011220000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261011220000_customer_store_name_in_rpcs.sql`
\set rb20261011210000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/rollbacks/20261011210000_stores_public_name.sql`
\set m20261011210000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261011210000_stores_public_name.sql`
\set m20261011220000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261011220000_customer_store_name_in_rpcs.sql`
\set m20261012100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261012100000_private_group_join_bell_next_step.sql`
\set m20261012110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261012110000_private_group_photo_storage_usage.sql`
\set m20261012120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261012120000_participant_change_keeps_coupon.sql`
\set m20261012130000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261012130000_operator_add_participants.sql`
\set m20261012140000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261012140000_drop_broken_legacy_rpcs.sql`
\set m20261013120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261013120000_throttle_failing_private_group_and_staff_writes.sql`
\set m20261013130000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261013130000_private_group_date_responses_skip_stale.sql`
\set m20261013130001 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261013130001_release_retry_concurrency_no_sleep.sql`
\set m20261013130002 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261013130002_stale_staff_retry_compatibility.sql`
\set m20261015100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261015100000_scenario_slot_start_is_absolute.sql`
\set m20261015110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261015110000_private_booking_create_validate_special_open_day.sql`
\set m20261020100000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020100000_respect_store_available_slots.sql`
\set m20261020110000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020110000_private_group_dates_aligned_once.sql`
\set m20261020120000 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020120000_private_group_create_requires_public_scenario.sql`
\set m130 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020130000_coupon_usage_redeem.sql`
\set m140 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020140000_private_request_withdraw_keep_group.sql`
\set m150 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020150000_private_booking_horizon_days.sql`
\set m160 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020160000_private_group_photo_limit.sql`
\set m180 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020180000_coupon_usage_redeem_same_day.sql`
\set m190 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020190000_coupon_use_same_day.sql`
\set m210 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020210000_private_booking_request_full_candidate_check.sql`
\set m220 `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/migrations/20261020220000_coupon_redeem_use_event_date.sql`
BEGIN;
SET LOCAL client_min_messages = warning;
-- 下準備は引き金を通さずに入れる
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('eeeeeeee-0000-4000-8000-000000000001', 'もぎる退避テスト', 'redeem-backup-test', true);
INSERT INTO auth.users(id, email) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'redeem-backup@example.invalid');
INSERT INTO public.customers(id, organization_id, user_id, name)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000c1', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000a1', 'もぎる退避テスト');
INSERT INTO public.coupon_campaigns(id, organization_id, name, discount_amount)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000e1', 'eeeeeeee-0000-4000-8000-000000000001', 'もぎる退避テスト', 500);
INSERT INTO public.customer_coupons(id, campaign_id, customer_id, organization_id, uses_remaining, status)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000f1', 'eeeeeeee-0000-4000-8000-0000000000e1', 'eeeeeeee-0000-4000-8000-0000000000c1', 'eeeeeeee-0000-4000-8000-000000000001', 5, 'active');
-- 来店確認済み 4 件（時刻・経路はばらばら）と未確認 1 件
CREATE TEMP TABLE expected(usage_id uuid, redeemed_at timestamptz, redeemed_by_member uuid, redeemed_source text);
INSERT INTO expected VALUES
 ('eeeeeeee-0000-4000-8000-000000000101', timestamptz '2026-10-20 13:05+09', 'eeeeeeee-0000-4000-8000-0000000000c1', 'customer_present'),
 ('eeeeeeee-0000-4000-8000-000000000102', timestamptz '2026-10-20 18:30+09', 'eeeeeeee-0000-4000-8000-0000000000c1', 'customer_present'),
 ('eeeeeeee-0000-4000-8000-000000000103', timestamptz '2026-10-21 11:00+09', 'eeeeeeee-0000-4000-8000-0000000000c1', 'venue_use'),
 ('eeeeeeee-0000-4000-8000-000000000104', timestamptz '2026-10-21 19:45+09', NULL, 'customer_present'),
 ('eeeeeeee-0000-4000-8000-000000000105', NULL, NULL, NULL);
INSERT INTO public.reservations(id, organization_id, customer_id, title, requested_datetime, duration, status)
 SELECT ('eeeeeeee-0000-4000-8000-0000000002' || right(usage_id::text, 2))::uuid, 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000c1',
        'もぎる退避テスト', timestamptz '2026-10-20 13:00+09', 180, 'confirmed'
 FROM expected;
INSERT INTO public.coupon_usages(id, customer_coupon_id, reservation_id, discount_amount, redeemed_at, redeemed_by_member, redeemed_source)
 SELECT usage_id, 'eeeeeeee-0000-4000-8000-0000000000f1', ('eeeeeeee-0000-4000-8000-0000000002' || right(usage_id::text, 2))::uuid, 500,
        redeemed_at, redeemed_by_member, redeemed_source
 FROM expected;
-- 店舗の公開名（公開後に管理画面で入れた値のつもり）。同じ組織の別の店舗は公開名なし
INSERT INTO public.stores(id, organization_id, name, short_name, public_name) VALUES
 ('eeeeeeee-0000-4000-8000-000000000301', 'eeeeeeee-0000-4000-8000-000000000001', 'もぎる退避テスト 本店', '本店', '退避テスト 渋谷店'),
 ('eeeeeeee-0000-4000-8000-000000000302', 'eeeeeeee-0000-4000-8000-000000000001', 'もぎる退避テスト 二号店', '二号店', NULL);
SET LOCAL session_replication_role = origin;
-- 同日の退避が既に手元にあると rollback が止まるので、その場合は先に知らせる。
DO $$
BEGIN
  IF to_regclass('rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD')) IS NOT NULL THEN
    RAISE EXCEPTION '手元 DB に今日の rollback_backup.coupon_usages_redeem_backup_* が既にあります。消すか別名へ移してから流してください';
  END IF;
END $$;

-- 0. 手で残すもの: 店舗の公開名（手順書 (b) の SQL。退避表の日付だけ差し替える）
CREATE SCHEMA IF NOT EXISTS rollback_backup;
SELECT 'stores_public_name_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD') AS spn_backup \gset
SELECT to_regclass('rollback_backup.' || :'spn_backup') IS NULL AS spn_backup_free \gset
\if :spn_backup_free
\else
  \echo 手元 DB に今日の rollback_backup.stores_public_name_backup_* が既にあります。消すか別名へ移してから流してください
  \quit 3
\endif
CREATE TABLE rollback_backup.:"spn_backup" AS
  SELECT id, organization_id, public_name FROM public.stores WHERE public_name IS NOT NULL;
REVOKE ALL ON rollback_backup.:"spn_backup" FROM PUBLIC, anon, authenticated;

-- 1. 新しい順に戻す
:rb220
:rb210
:rb190
:rb180
:rb160
:rb150
:rb140
:rb130

DO $$
DECLARE v_dst text := 'rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_n int; v_bad int;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupon_usages' AND column_name LIKE 'redeemed%'),
    'rollback 後も来店確認の列が残っている';
  ASSERT to_regclass(v_dst) IS NOT NULL, '退避表ができていない';
  EXECUTE format('SELECT count(*) FROM %s WHERE usage_id::text LIKE ''eeeeeeee-%%''', v_dst) INTO v_n;
  ASSERT v_n = 4, format('退避は来店確認済みの 4 件のはず: %s', v_n);
  EXECUTE format('SELECT count(*) FROM %s b JOIN expected e USING (usage_id)
    WHERE b.redeemed_at IS DISTINCT FROM e.redeemed_at OR b.redeemed_by_member IS DISTINCT FROM e.redeemed_by_member
       OR b.redeemed_source IS DISTINCT FROM e.redeemed_source OR b.backed_up_at IS NULL', v_dst) INTO v_bad;
  ASSERT v_bad = 0, format('退避した値が元と違う: %s 件', v_bad);
  ASSERT NOT has_table_privilege('anon', v_dst, 'SELECT') AND NOT has_table_privilege('authenticated', v_dst, 'SELECT'),
    '退避表がブラウザの役割から読める';
  ASSERT (SELECT count(*) FROM public.coupon_usages WHERE id IN (SELECT usage_id FROM expected)) = 5, '使用履歴の行そのものが消えた';
END $$;

-- 1b. 店舗の公開名の列を消す 20261011210000 まで、さらに新しい順に戻す
:rb20261020120000
:rb20261020110000
:rb20261020100000
:rb20261015110000
:rb20261015100000
:rb20261013130002
:rb20261013130001
:rb20261013130000
:rb20261013120000
:rb20261012140000
:rb20261012130000
:rb20261012120000
:rb20261012110000
:rb20261012100000
:rb20261011220000
:rb20261011210000

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'public_name'),
    'rollback 後も stores.public_name が残っている';
END $$;

-- 2. 古い順に当て直す（migration の中身は変えない）
:m20261011210000
:m20261011220000
:m20261012100000
:m20261012110000
:m20261012120000
:m20261012130000
:m20261012140000
:m20261013120000
:m20261013130000
:m20261013130001
:m20261013130002
:m20261015100000
:m20261015110000
:m20261020100000
:m20261020110000
:m20261020120000
:m130
:m140
:m150
:m160
:m180
:m190
:m210
:m220

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.coupon_usages WHERE id IN (SELECT usage_id FROM expected) AND redeemed_at IS NOT NULL) = 0,
    '当て直した直後は来店確認の印が空のはず（だから退避が要る）';
  ASSERT (SELECT public_name FROM public.stores WHERE id = 'eeeeeeee-0000-4000-8000-000000000301') IS NULL,
    '当て直した直後は店舗の公開名が空のはず（だから退避が要る）';
END $$;

-- 3. 退避から書き戻す（手順書 (b) と同じ文。退避表の日付だけ差し替える）
DO $$
DECLARE v_dst text := 'rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_bad int;
BEGIN
  EXECUTE format('UPDATE public.coupon_usages u
     SET redeemed_at = b.redeemed_at,
         redeemed_by_member = (SELECT c.id FROM public.customers c WHERE c.id = b.redeemed_by_member),
         redeemed_source = b.redeemed_source
    FROM %s b
   WHERE b.usage_id = u.id AND u.redeemed_at IS NULL', v_dst);
  SELECT count(*) INTO v_bad FROM expected e JOIN public.coupon_usages u ON u.id = e.usage_id
   WHERE u.redeemed_at IS DISTINCT FROM e.redeemed_at OR u.redeemed_by_member IS DISTINCT FROM e.redeemed_by_member
      OR u.redeemed_source IS DISTINCT FROM e.redeemed_source;
  ASSERT v_bad = 0, format('書き戻した値が元と違う: %s 件', v_bad);
  ASSERT (SELECT count(*) FROM public.coupon_usages WHERE id IN (SELECT usage_id FROM expected) AND redeemed_at IS NOT NULL) = 4,
    '来店確認済みは 4 件に戻るはず';
END $$;
-- 店舗の公開名（手順書 (b) の 4 と同じ文。店舗 ID と組織が一致し、今が空のものだけ）
UPDATE public.stores s SET public_name = b.public_name
  FROM rollback_backup.:"spn_backup" b
 WHERE b.id = s.id AND b.organization_id = s.organization_id AND s.public_name IS NULL;
-- 照合（手順書 (b) の照合と同じ文）: 店が無い・組織が違う・値が違う が 0
CREATE TEMP TABLE spn_check AS
SELECT count(*) AS spn_total, count(*) FILTER (WHERE s.id IS NULL) AS spn_missing,
       count(*) FILTER (WHERE s.organization_id IS DISTINCT FROM b.organization_id) AS spn_org_mismatch,
       count(*) FILTER (WHERE s.id IS NOT NULL AND s.public_name IS DISTINCT FROM b.public_name) AS spn_value_mismatch
  FROM rollback_backup.:"spn_backup" b LEFT JOIN public.stores s ON s.id = b.id;
DO $$
BEGIN
  ASSERT (SELECT public_name FROM public.stores WHERE id = 'eeeeeeee-0000-4000-8000-000000000301') = '退避テスト 渋谷店', '店舗の公開名が戻っていない';
  ASSERT (SELECT public_name FROM public.stores WHERE id = 'eeeeeeee-0000-4000-8000-000000000302') IS NULL, '公開名の無かった店舗に値が入った';
  ASSERT (SELECT spn_total >= 1 AND spn_missing = 0 AND spn_org_mismatch = 0 AND spn_value_mismatch = 0 FROM spn_check),
    format('店舗の公開名の照合がずれている: %s', (SELECT row_to_json(c) FROM spn_check c));
  RAISE WARNING 'OK: coupon_redeem_rollback_backup（来店確認 4 件と店舗の公開名が退避→当て直し→書き戻しで元どおり）';
END $$;
ROLLBACK;
