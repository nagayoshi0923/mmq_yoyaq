-- マイページ › クーポンで予約後に既存の予約へクーポンを当てる操作（use_customer_coupon）は公演当日（Asia/Tokyo）だけ（migration 20261020190000）。
-- 当日は使える・夕方の公演（requested_datetime が日本時間で翌日にずれて入っていても）当日なら使える・
-- 翌日 0:30 / 前日 23:30 / 先の日付 / 過去の日付は「公演当日にお使いください」で断る（使用履歴も金額も変わらない）・
-- 同じ予約に使用済みなら日付にかかわらず成功で何もしない・
-- 予約時にクーポンを付ける経路（create_reservation_with_lock_v2）は先の日付の公演でも今までどおり使える。全部巻き戻す。
BEGIN;
-- 下準備は引き金（通知・対象公演の確認）を通さずに入れる。確かめたい関数の呼び出しは引き金を通す。
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('eeeeeeee-0000-4000-8000-000000000001', '当日使用テスト', 'coupon-use-same-day-test', true);
INSERT INTO auth.users(id, email) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'coupon-use-same-day@example.invalid');
INSERT INTO public.users(id, email) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'coupon-use-same-day@example.invalid') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.customers(id, organization_id, user_id, name, email)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000c1', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000a1', '当日使用テスト', 'coupon-use-same-day@example.invalid');
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES ('eeeeeeee-0000-4000-8000-0000000000b1', 'eeeeeeee-0000-4000-8000-000000000001', '当日使用テスト店', 'テスト店');
INSERT INTO public.scenario_masters(id, title) VALUES ('eeeeeeee-0000-4000-8000-0000000000d1', '当日使用テスト作品');
INSERT INTO public.organization_scenarios(id, organization_id, scenario_master_id, participation_fee, duration)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000d2', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000d1', 4000, 180);
INSERT INTO public.coupon_campaigns(id, organization_id, name, discount_amount, max_uses_per_customer, same_scenario_once)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000e1', 'eeeeeeee-0000-4000-8000-000000000001', '当日使用テスト', 500, 20, false);

-- 公演（日本時間の日付と開始時刻）。requested_datetime は予約作成の関数と同じく「日付＋開始時刻」をそのまま入れる
-- （手元・本番とも DB の時間帯は UTC なので、夕方以降の公演は日本時間にすると翌日になる）。
CREATE TEMP TABLE cases(label text, n int, day date, starts time, used boolean);
INSERT INTO cases VALUES
 ('today',         1, (now() AT TIME ZONE 'Asia/Tokyo')::date,     '12:00', false),
 ('today_evening', 2, (now() AT TIME ZONE 'Asia/Tokyo')::date,     '19:00', false),
 ('tomorrow0030',  3, (now() AT TIME ZONE 'Asia/Tokyo')::date + 1, '00:30', false),
 ('yesterday2330', 4, (now() AT TIME ZONE 'Asia/Tokyo')::date - 1, '23:30', false),
 ('future',        5, date '2099-01-01',                            '13:00', false),
 ('past',          6, (now() AT TIME ZONE 'Asia/Tokyo')::date - 3, '13:00', false),
 ('already_used',  7, date '2099-01-01',                            '13:00', true),
 ('booking',       8, (now() AT TIME ZONE 'Asia/Tokyo')::date + 30, '13:00', false);
INSERT INTO public.schedule_events(id, organization_id, store_id, scenario_master_id, organization_scenario_id, category, date, start_time, end_time, venue, scenario, max_participants, time_slot)
 SELECT ('eeeeeeee-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000b1',
        'eeeeeeee-0000-4000-8000-0000000000d1', 'eeeeeeee-0000-4000-8000-0000000000d2', 'open', day, starts, starts + interval '3 hours', 'テスト店', '当日使用テスト作品', 8, '昼'
 FROM cases;
INSERT INTO public.reservations(id, organization_id, customer_id, schedule_event_id, title, requested_datetime, duration, participant_count,
                                base_price, total_price, discount_amount, final_price, status)
 SELECT ('eeeeeeee-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000c1',
        ('eeeeeeee-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '当日使用テスト ' || label, (day + starts)::timestamp, 180, 1,
        4000, 4000, 0, 4000, 'confirmed'
 FROM cases WHERE label <> 'booking';
-- クーポンは引き金を通して入れる（利用条件の控え rules_snapshot が付く）
SET LOCAL session_replication_role = origin;
INSERT INTO public.customer_coupons(id, campaign_id, customer_id, organization_id, uses_remaining, status)
 VALUES ('eeeeeeee-0000-4000-8000-0000000000f1', 'eeeeeeee-0000-4000-8000-0000000000e1', 'eeeeeeee-0000-4000-8000-0000000000c1', 'eeeeeeee-0000-4000-8000-000000000001', 20, 'active');
SET LOCAL session_replication_role = replica;
INSERT INTO public.coupon_usages(id, customer_coupon_id, reservation_id, discount_amount)
 VALUES ('eeeeeeee-0000-4000-8000-000000000307', 'eeeeeeee-0000-4000-8000-0000000000f1', 'eeeeeeee-0000-4000-8000-000000000207', 500);
SET LOCAL session_replication_role = origin;

-- 予約後に当ててみる。成功なら結果、断られたら文言・SQLSTATE・HINT を残す
CREATE TEMP TABLE results(label text, result jsonb, error text, state text, hint text);
CREATE FUNCTION pg_temp.apply(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_result jsonb; v_msg text; v_state text; v_hint text;
BEGIN
  v_result := public.use_customer_coupon('eeeeeeee-0000-4000-8000-0000000000a1', 'eeeeeeee-0000-4000-8000-0000000000f1',
    (SELECT ('eeeeeeee-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid FROM cases WHERE label = p_label));
  INSERT INTO results VALUES (p_label, v_result, NULL, NULL, NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  INSERT INTO results VALUES (p_label, NULL, v_msg, v_state, v_hint);
END $$;

SELECT pg_temp.apply(label) FROM cases WHERE label <> 'booking' ORDER BY n;

DO $$
DECLARE v record;
BEGIN
  -- 当日（昼・夕方）は使えて、使用履歴ができ、予約の金額から割引される
  FOR v IN SELECT r.*, c.n FROM results r JOIN cases c USING (label) WHERE label IN ('today', 'today_evening') LOOP
    ASSERT v.result IS NOT NULL AND (v.result->>'success')::boolean AND v.result->>'already_used' IS NULL, v.label || ': ' || coalesce(v.error, v.result::text);
    ASSERT (SELECT count(*) FROM public.coupon_usages WHERE reservation_id = ('eeeeeeee-0000-4000-8000-0000000002' || lpad(v.n::text, 2, '0'))::uuid) = 1, v.label || ' の使用履歴が無い';
    ASSERT (SELECT final_price < 4000 FROM public.reservations WHERE id = ('eeeeeeee-0000-4000-8000-0000000002' || lpad(v.n::text, 2, '0'))::uuid), v.label || ' が割引されていない';
  END LOOP;

  -- 当日でなければ「公演当日にお使いください」（P0028 / not_performance_day）で断り、使用履歴も金額も変わらない
  FOR v IN SELECT r.*, c.n FROM results r JOIN cases c USING (label)
           WHERE label IN ('tomorrow0030', 'yesterday2330', 'future', 'past') LOOP
    ASSERT v.result IS NULL, v.label || ' が通った: ' || coalesce(v.result::text, '');
    ASSERT v.error = '公演当日にお使いください', v.label || ': ' || coalesce(v.error, '');
    ASSERT v.state = 'P0028', v.label || ': ' || coalesce(v.state, '');
    ASSERT v.hint = 'not_performance_day', v.label || ': ' || coalesce(v.hint, '');
    ASSERT (SELECT count(*) FROM public.coupon_usages WHERE reservation_id = ('eeeeeeee-0000-4000-8000-0000000002' || lpad(v.n::text, 2, '0'))::uuid) = 0, v.label || ' に使用履歴ができた';
    ASSERT (SELECT final_price = 4000 AND discount_amount = 0 FROM public.reservations WHERE id = ('eeeeeeee-0000-4000-8000-0000000002' || lpad(v.n::text, 2, '0'))::uuid), v.label || ' の金額が変わった';
  END LOOP;

  -- 同じ予約に使用済みなら先の日付でも成功で何もしない（二度押し・再送）
  ASSERT (SELECT (result->>'success')::boolean AND (result->>'already_used')::boolean FROM results WHERE label = 'already_used'),
    (SELECT coalesce(error, result::text) FROM results WHERE label = 'already_used');
  ASSERT (SELECT count(*) FROM public.coupon_usages WHERE reservation_id = 'eeeeeeee-0000-4000-8000-000000000207') = 1, '使用済みの予約に履歴が増えた';
END $$;

-- 予約時にクーポンを付ける経路は、30 日先の公演でも今までどおり使える（本人として予約を作る）
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-0000000000a1', true);
CREATE TEMP TABLE booked AS
 SELECT public.create_reservation_with_lock_v2('eeeeeeee-0000-4000-8000-000000000108', 1, 'eeeeeeee-0000-4000-8000-0000000000c1',
   '当日使用テスト', 'coupon-use-same-day@example.invalid', '09000000000', NULL, NULL, NULL, 'eeeeeeee-0000-4000-8000-0000000000f1') AS id;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.coupon_usages u JOIN booked b ON b.id = u.reservation_id
          WHERE u.customer_coupon_id = 'eeeeeeee-0000-4000-8000-0000000000f1' AND u.discount_amount > 0) = 1, '予約時のクーポンが付いていない';
  ASSERT (SELECT r.discount_amount > 0 AND r.final_price < r.total_price FROM public.reservations r JOIN booked b ON b.id = r.id), '予約時のクーポンで割引されていない';
  RAISE NOTICE 'PASS: 予約後にクーポンを当てるのは公演当日だけ（翌日 0:30・前日 23:30・先・過去は断る、使用済みは冪等、予約時の適用は先の日付でも可）';
END $$;
ROLLBACK;
