-- 来店確認（もぎる）の記録は、DB を戻して当て直しても退避から書き戻せる（docs/ops/本番公開の戻し方_2026-10.md の (b)）。
-- 2026-10-21 Codex レビュー指摘 2: 20261020130000 の rollback が coupon_usages.redeemed_* を退避なしで消していた。
-- 流れ: 来店確認済み 4 件＋未確認 1 件を作る → 20261020220000〜20261020130000 の rollback を新しい順に流す
--       → 退避表に 4 件・ブラウザの役割から読めない → migration を古い順に当て直す（印は空）
--       → 書き戻しの UPDATE で 4 件が元の値に戻る。全部 1 つの取引で、最後に巻き戻す（手元 DB は変わらない）。
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
SET LOCAL session_replication_role = origin;
-- 同日の退避が既に手元にあると rollback が止まるので、その場合は先に知らせる。
DO $$
BEGIN
  IF to_regclass('rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD')) IS NOT NULL THEN
    RAISE EXCEPTION '手元 DB に今日の rollback_backup.coupon_usages_redeem_backup_* が既にあります。消すか別名へ移してから流してください';
  END IF;
END $$;

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

-- 2. 古い順に当て直す（migration の中身は変えない）
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
  RAISE WARNING 'OK: coupon_redeem_rollback_backup（来店確認 4 件が退避→当て直し→書き戻しで元どおり）';
END $$;
ROLLBACK;
