-- クーポンの「もぎる（来店確認）」は公演当日（Asia/Tokyo）だけ押せる（migration 20261020180000）。
-- 当日は押せる・先の日付（翌日 0:30 / 2099 年）は断る・前の日付（前日 23:30 / 数日前）は断る・
-- 来店時にその場で使う経路（venue_use）も同じ・既に確認済みなら日付にかかわらず二度押しは成功で何もしない。全部巻き戻す。
BEGIN;
-- 下準備は引き金（通知・対象公演の確認）を通さずに入れる。確かめたいのは redeem_coupon_usage だけ。
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('dddddddd-0000-4000-8000-000000000001', 'もぎる当日テスト', 'redeem-same-day-test', true);
INSERT INTO auth.users(id, email) VALUES ('dddddddd-0000-4000-8000-0000000000a1', 'redeem-same-day@example.invalid');
INSERT INTO public.customers(id, organization_id, user_id, name)
 VALUES ('dddddddd-0000-4000-8000-0000000000c1', 'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-0000000000a1', 'もぎるテスト');
INSERT INTO public.coupon_campaigns(id, organization_id, name, discount_amount)
 VALUES ('dddddddd-0000-4000-8000-0000000000e1', 'dddddddd-0000-4000-8000-000000000001', 'もぎる当日テスト', 500);
INSERT INTO public.customer_coupons(id, campaign_id, customer_id, organization_id, uses_remaining, status)
 VALUES ('dddddddd-0000-4000-8000-0000000000f1', 'dddddddd-0000-4000-8000-0000000000e1', 'dddddddd-0000-4000-8000-0000000000c1', 'dddddddd-0000-4000-8000-000000000001', 5, 'active');

-- 公演日時: 今日の 12:00（JST）・翌日 0:30・2099 年・前日 23:30・3 日前・2099 年（確認済み）
CREATE TEMP TABLE cases(label text, usage_id uuid, starts_at timestamptz, redeemed_at timestamptz);
INSERT INTO cases VALUES
 ('today',        'dddddddd-0000-4000-8000-000000000101', (((now() AT TIME ZONE 'Asia/Tokyo')::date + time '12:00') AT TIME ZONE 'Asia/Tokyo'), NULL),
 ('tomorrow0030', 'dddddddd-0000-4000-8000-000000000102', (((now() AT TIME ZONE 'Asia/Tokyo')::date + 1 + time '00:30') AT TIME ZONE 'Asia/Tokyo'), NULL),
 ('y2099',        'dddddddd-0000-4000-8000-000000000103', timestamptz '2099-01-01 13:00+09', NULL),
 ('yesterday2330','dddddddd-0000-4000-8000-000000000104', (((now() AT TIME ZONE 'Asia/Tokyo')::date - 1 + time '23:30') AT TIME ZONE 'Asia/Tokyo'), NULL),
 ('past3days',    'dddddddd-0000-4000-8000-000000000105', now() - interval '3 days', NULL),
 ('venue_future', 'dddddddd-0000-4000-8000-000000000106', timestamptz '2099-01-01 13:00+09', NULL),
 ('already',      'dddddddd-0000-4000-8000-000000000107', timestamptz '2099-01-01 13:00+09', timestamptz '2026-10-01 10:00+09');
INSERT INTO public.reservations(id, organization_id, customer_id, title, requested_datetime, duration, status)
 SELECT ('dddddddd-0000-4000-8000-0000000002' || right(usage_id::text, 2))::uuid, 'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-0000000000c1',
        'もぎる当日テスト ' || label, starts_at, 180, 'confirmed'
 FROM cases;
INSERT INTO public.coupon_usages(id, customer_coupon_id, reservation_id, discount_amount, redeemed_at, redeemed_source)
 SELECT usage_id, 'dddddddd-0000-4000-8000-0000000000f1', ('dddddddd-0000-4000-8000-0000000002' || right(usage_id::text, 2))::uuid, 500,
        redeemed_at, CASE WHEN redeemed_at IS NOT NULL THEN 'customer_present' END
 FROM cases;
SET LOCAL session_replication_role = origin;

-- 押してみる。成功なら結果、断られたら文言・SQLSTATE・HINT を残す
CREATE TEMP TABLE results(label text, result jsonb, error text, state text, hint text);
CREATE FUNCTION pg_temp.press(p_label text, p_source text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_result jsonb; v_msg text; v_state text; v_hint text;
BEGIN
  v_result := public.redeem_coupon_usage('dddddddd-0000-4000-8000-0000000000a1', (SELECT usage_id FROM cases WHERE label = p_label), p_source);
  INSERT INTO results VALUES (p_label, v_result, NULL, NULL, NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  INSERT INTO results VALUES (p_label, NULL, v_msg, v_state, v_hint);
END $$;

SELECT pg_temp.press('today', 'customer_present');
SELECT pg_temp.press('tomorrow0030', 'customer_present');
SELECT pg_temp.press('y2099', 'customer_present');
SELECT pg_temp.press('yesterday2330', 'customer_present');
SELECT pg_temp.press('past3days', 'customer_present');
SELECT pg_temp.press('venue_future', 'venue_use');
SELECT pg_temp.press('already', 'customer_present');

DO $$
DECLARE v record;
BEGIN
  -- 当日は押せて、印（時刻・押した会員・経路）が付く
  ASSERT (SELECT (result->>'success')::boolean AND NOT (result->>'already_redeemed')::boolean FROM results WHERE label = 'today'),
    (SELECT coalesce(error, result::text) FROM results WHERE label = 'today');
  ASSERT (SELECT redeemed_at IS NOT NULL AND redeemed_by_member = 'dddddddd-0000-4000-8000-0000000000c1' AND redeemed_source = 'customer_present'
          FROM public.coupon_usages WHERE id = 'dddddddd-0000-4000-8000-000000000101'), '当日の印が付いていない';

  -- 先の日付・前の日付は「公演当日に押してください」（P0028 / not_performance_day）で断り、印は付かない
  FOR v IN SELECT r.*, c.usage_id FROM results r JOIN cases c USING (label)
           WHERE label IN ('tomorrow0030', 'y2099', 'yesterday2330', 'past3days', 'venue_future') LOOP
    ASSERT v.result IS NULL, v.label || ' が通った: ' || coalesce(v.result::text, '');
    ASSERT v.error = '公演当日に押してください', v.label || ': ' || coalesce(v.error, '');
    ASSERT v.state = 'P0028', v.label || ': ' || coalesce(v.state, '');
    ASSERT v.hint = 'not_performance_day', v.label || ': ' || coalesce(v.hint, '');
    ASSERT (SELECT redeemed_at IS NULL FROM public.coupon_usages WHERE id = v.usage_id), v.label || ' に印が付いた';
  END LOOP;

  -- 既に確認済みなら日付が先でも成功で何もしない（時刻を書き換えない）
  ASSERT (SELECT (result->>'success')::boolean AND (result->>'already_redeemed')::boolean FROM results WHERE label = 'already'),
    (SELECT coalesce(error, result::text) FROM results WHERE label = 'already');
  ASSERT (SELECT redeemed_at = timestamptz '2026-10-01 10:00+09' FROM public.coupon_usages WHERE id = 'dddddddd-0000-4000-8000-000000000107'), '確認済みの時刻が変わった';
END $$;

-- 当日に押したものをもう一度押しても成功で何もしない
SELECT pg_temp.press('today', 'customer_present');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM results WHERE label = 'today' AND (result->>'already_redeemed')::boolean) = 1, '当日の二度押しが冪等でない';
  RAISE NOTICE 'PASS: もぎるは公演当日だけ（先の日付・前の日付・venue_use は断る、確認済みは冪等）';
END $$;
ROLLBACK;
