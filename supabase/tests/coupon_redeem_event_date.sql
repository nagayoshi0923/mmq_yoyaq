-- クーポンの「もぎる（来店確認）」の公演当日の判定は、公演の日付（schedule_events.date）を正とする（migration 20261020220000）。
-- requested_datetime が公演日時ではなく予約を作った時刻になっている予約（staging で 31 件。例 260919-8B88）でも、
-- 公演当日なら押せて、公演の前後の日は断る。公演の無い予約だけ requested_datetime の日本時間の日付で判定する。
-- あわせて、予約後のクーポン使用（use_customer_coupon、20261020190000）と同じ予約で同じ判定になること、
-- 補助関数 coupon_performance_day が use_customer_coupon の式と同じ日付を返すことを確かめる。全部巻き戻す。
BEGIN;
-- 下準備は引き金（通知・対象公演の確認）を通さずに入れる。確かめたい関数の呼び出しは引き金を通す。
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('cccccccc-0000-4000-8000-000000000001', 'もぎる公演日テスト', 'coupon-redeem-event-date-test', true);
INSERT INTO auth.users(id, email) VALUES ('cccccccc-0000-4000-8000-0000000000a1', 'coupon-redeem-event-date@example.invalid');
INSERT INTO public.users(id, email) VALUES ('cccccccc-0000-4000-8000-0000000000a1', 'coupon-redeem-event-date@example.invalid') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.customers(id, organization_id, user_id, name, email)
 VALUES ('cccccccc-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000a1', 'もぎる公演日テスト', 'coupon-redeem-event-date@example.invalid');
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES ('cccccccc-0000-4000-8000-0000000000b1', 'cccccccc-0000-4000-8000-000000000001', 'もぎる公演日テスト店', 'テスト店');
INSERT INTO public.scenario_masters(id, title) VALUES ('cccccccc-0000-4000-8000-0000000000d1', 'もぎる公演日テスト作品');
INSERT INTO public.organization_scenarios(id, organization_id, scenario_master_id, participation_fee, duration)
 VALUES ('cccccccc-0000-4000-8000-0000000000d2', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000d1', 4000, 180);
INSERT INTO public.coupon_campaigns(id, organization_id, name, discount_amount, max_uses_per_customer, same_scenario_once)
 VALUES ('cccccccc-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-000000000001', 'もぎる公演日テスト', 500, 50, false);

-- day が NULL の行は公演の無い予約。requested が予約の requested_datetime。
CREATE TEMP TABLE cases(label text, n int, day date, starts time, requested timestamptz, source text, expect_ok boolean);
INSERT INTO cases VALUES
 -- 予約を作った時刻（30 日前）が入っているが、公演は今日 → 押せる
 ('created_at_event_today',    1, (now() AT TIME ZONE 'Asia/Tokyo')::date,     '13:00', now() - interval '30 days', 'customer_present', true),
 -- 同じく来店時にその場で使う経路（venue_use）でも押せる
 ('created_at_event_today_venue', 2, (now() AT TIME ZONE 'Asia/Tokyo')::date,  '13:00', now() - interval '30 days', 'venue_use',        true),
 -- 予約を作ったのは今日だが、公演は明日 → 断る
 ('created_today_event_tomorrow', 3, (now() AT TIME ZONE 'Asia/Tokyo')::date + 1, '13:00', now(),                  'customer_present', false),
 -- 予約を作ったのは今日だが、公演は昨日 → 断る
 ('created_today_event_yesterday', 4, (now() AT TIME ZONE 'Asia/Tokyo')::date - 1, '13:00', now(),                 'customer_present', false),
 -- 今日の夕方の公演（requested_datetime は日付＋開始時刻を UTC で解釈した値で、日本時間では翌日になる）→ 押せる
 ('event_today_evening',       5, (now() AT TIME ZONE 'Asia/Tokyo')::date,     '19:00', NULL,                       'customer_present', true),
 -- 公演の無い予約は requested_datetime の日本時間の日付で判定する（今日 → 押せる、明日 → 断る）
 ('no_event_today',            6, NULL, NULL, (((now() AT TIME ZONE 'Asia/Tokyo')::date + time '12:00') AT TIME ZONE 'Asia/Tokyo'),     'customer_present', true),
 ('no_event_tomorrow',         7, NULL, NULL, (((now() AT TIME ZONE 'Asia/Tokyo')::date + 1 + time '12:00') AT TIME ZONE 'Asia/Tokyo'), 'customer_present', false);
UPDATE cases SET requested = (day + starts)::timestamp WHERE requested IS NULL;

INSERT INTO public.schedule_events(id, organization_id, store_id, scenario_master_id, organization_scenario_id, category, date, start_time, end_time, venue, scenario, max_participants, time_slot)
 SELECT ('cccccccc-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000b1',
        'cccccccc-0000-4000-8000-0000000000d1', 'cccccccc-0000-4000-8000-0000000000d2', 'open', day, starts, starts + interval '3 hours', 'テスト店', 'もぎる公演日テスト作品', 8, '昼'
 FROM cases WHERE day IS NOT NULL;
INSERT INTO public.reservations(id, organization_id, customer_id, schedule_event_id, title, requested_datetime, duration, participant_count,
                                base_price, total_price, discount_amount, final_price, status)
 SELECT ('cccccccc-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000c1',
        CASE WHEN day IS NOT NULL THEN ('cccccccc-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid END,
        'もぎる公演日テスト ' || label, requested, 180, 1, 4000, 4000, 0, 4000, 'confirmed'
 FROM cases;
-- クーポンは 2 枚。f1 は予約時に付けた扱い（使用履歴を直接入れ、来店時に「もぎる」）、f2 は予約後に「この予約に使う」で当てる。
SET LOCAL session_replication_role = origin;
INSERT INTO public.customer_coupons(id, campaign_id, customer_id, organization_id, uses_remaining, status)
 VALUES ('cccccccc-0000-4000-8000-0000000000f1', 'cccccccc-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000001', 50, 'active'),
        ('cccccccc-0000-4000-8000-0000000000f2', 'cccccccc-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000001', 50, 'active');
SET LOCAL session_replication_role = replica;
INSERT INTO public.coupon_usages(id, customer_coupon_id, reservation_id, discount_amount)
 SELECT ('cccccccc-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'cccccccc-0000-4000-8000-0000000000f1',
        ('cccccccc-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 500
 FROM cases;
SET LOCAL session_replication_role = origin;

-- 押してみる／当ててみる。成功なら結果、断られたら文言・SQLSTATE・HINT を残す
CREATE TEMP TABLE results(fn text, label text, result jsonb, error text, state text, hint text);
CREATE FUNCTION pg_temp.press(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_result jsonb; v_msg text; v_state text; v_hint text; c record;
BEGIN
  SELECT * INTO c FROM cases WHERE label = p_label;
  v_result := public.redeem_coupon_usage('cccccccc-0000-4000-8000-0000000000a1', ('cccccccc-0000-4000-8000-0000000003' || lpad(c.n::text, 2, '0'))::uuid, c.source);
  INSERT INTO results VALUES ('redeem', p_label, v_result, NULL, NULL, NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  INSERT INTO results VALUES ('redeem', p_label, NULL, v_msg, v_state, v_hint);
END $$;
CREATE FUNCTION pg_temp.apply(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_result jsonb; v_msg text; v_state text; v_hint text;
BEGIN
  v_result := public.use_customer_coupon('cccccccc-0000-4000-8000-0000000000a1', 'cccccccc-0000-4000-8000-0000000000f2',
    (SELECT ('cccccccc-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid FROM cases WHERE label = p_label));
  INSERT INTO results VALUES ('use', p_label, v_result, NULL, NULL, NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  INSERT INTO results VALUES ('use', p_label, NULL, v_msg, v_state, v_hint);
END $$;

SELECT pg_temp.press(label) FROM cases ORDER BY n;
SELECT pg_temp.apply(label) FROM cases ORDER BY n;

DO $$
DECLARE v record;
BEGIN
  -- 公演当日なら押せて、印（時刻・押した会員・経路）が付く
  FOR v IN SELECT r.*, c.n, c.source FROM results r JOIN cases c USING (label) WHERE r.fn = 'redeem' AND c.expect_ok LOOP
    ASSERT v.result IS NOT NULL AND (v.result->>'success')::boolean AND NOT (v.result->>'already_redeemed')::boolean,
      v.label || ' が押せない: ' || coalesce(v.error, v.result::text, '');
    ASSERT (SELECT redeemed_at IS NOT NULL AND redeemed_by_member = 'cccccccc-0000-4000-8000-0000000000c1' AND redeemed_source = v.source
            FROM public.coupon_usages WHERE id = ('cccccccc-0000-4000-8000-0000000003' || lpad(v.n::text, 2, '0'))::uuid), v.label || ' の印が付いていない';
  END LOOP;

  -- 公演の前後の日は「公演当日に押してください」（P0028 / not_performance_day）で断り、印は付かない
  FOR v IN SELECT r.*, c.n FROM results r JOIN cases c USING (label) WHERE r.fn = 'redeem' AND NOT c.expect_ok LOOP
    ASSERT v.result IS NULL, v.label || ' が通った: ' || coalesce(v.result::text, '');
    ASSERT v.error = '公演当日に押してください', v.label || ': ' || coalesce(v.error, '');
    ASSERT v.state = 'P0028', v.label || ': ' || coalesce(v.state, '');
    ASSERT v.hint = 'not_performance_day', v.label || ': ' || coalesce(v.hint, '');
    ASSERT (SELECT redeemed_at IS NULL FROM public.coupon_usages WHERE id = ('cccccccc-0000-4000-8000-0000000003' || lpad(v.n::text, 2, '0'))::uuid), v.label || ' に印が付いた';
  END LOOP;

  -- 予約後のクーポン使用（use_customer_coupon）と、同じ予約で「公演当日か」の判定が一致する
  -- （use 側は日付以外の確認で断られることもあるので、not_performance_day かどうかで比べる）
  FOR v IN SELECT c.label, rd.hint AS redeem_hint, us.hint AS use_hint, us.error AS use_error
           FROM cases c JOIN results rd ON rd.label = c.label AND rd.fn = 'redeem' JOIN results us ON us.label = c.label AND us.fn = 'use' LOOP
    ASSERT (v.redeem_hint IS NOT DISTINCT FROM 'not_performance_day') = (v.use_hint IS NOT DISTINCT FROM 'not_performance_day'),
      v.label || ': もぎる=' || coalesce(v.redeem_hint, '当日') || ' / この予約に使う=' || coalesce(v.use_hint, v.use_error, '当日');
  END LOOP;
  -- 公演のある予約は予約後の使用も通る（日付以外で断られていないことも確かめる）
  ASSERT (SELECT count(*) FROM results r JOIN cases c USING (label) WHERE r.fn = 'use' AND c.expect_ok AND c.day IS NOT NULL AND (r.result->>'success')::boolean) = 3,
    (SELECT string_agg(label || ':' || coalesce(error, result::text), ', ') FROM results WHERE fn = 'use');

  -- 補助関数は use_customer_coupon の式と同じ日付を返す
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.organization_id = 'cccccccc-0000-4000-8000-000000000001'
      AND public.coupon_performance_day(r.schedule_event_id, r.requested_datetime) IS DISTINCT FROM
          (SELECT COALESCE(se.date, (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date) FROM (SELECT 1) one LEFT JOIN public.schedule_events se ON se.id = r.schedule_event_id)
  ), '補助関数と use_customer_coupon の式で公演日が違う';
  ASSERT public.coupon_performance_day(NULL, NULL) IS NULL, '公演も日時も無いのに日付が返った';
END $$;

-- 当日に押したものをもう一度押しても成功で何もしない
DELETE FROM results WHERE fn = 'redeem';
SELECT pg_temp.press('created_at_event_today');
DO $$ BEGIN
  ASSERT (SELECT (result->>'already_redeemed')::boolean FROM results WHERE fn = 'redeem' AND label = 'created_at_event_today'), '当日の二度押しが冪等でない';
  -- 画面（authenticated / anon）から補助関数を直接は呼べない
  ASSERT NOT has_function_privilege('authenticated', 'public.coupon_performance_day(uuid, timestamptz)', 'EXECUTE'), 'authenticated が補助関数を呼べる';
  ASSERT NOT has_function_privilege('anon', 'public.coupon_performance_day(uuid, timestamptz)', 'EXECUTE'), 'anon が補助関数を呼べる';
  RAISE NOTICE 'PASS: もぎるの当日判定は公演の日付が正（作成時刻入りの予約も当日なら可・前後の日は断る、予約後の使用と同じ判定）';
END $$;
ROLLBACK;
