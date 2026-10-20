-- 2026-10-20 本番 #1140（スタッフ報告）: カレンダー・リストの「貸切申込」から、180 日より先の日でも貸切を申し込めた件。
-- 作品ページは画面で 180 日に止めていたが、DB の保存時の検査（assert_private_booking_candidate_date）に上限日が無かった。
-- 社長の追加指示（2026-10-20）: 上限は固定値にせず設定で変えられるようにし、全経路に効かせる。
--   優先順位は MMQ の既定（180）→ 組織 → 作品 → 公演（後のものが上書き）。既存の運営設定の仕組み
--   （operating_setting_overrides と resolve_operating_setting）に、キー private_booking_horizon_days として乗せる。
--
-- 変更:
--   1. get_operating_setting_default: MMQ の既定 private_booking_horizon_days = 180 を足す。
--   2. resolve_operating_setting: キーを許可リストに足す（店舗では指定しない）。
--   3. get_effective_private_booking_horizon_days(組織, 作品, 公演): 実際に効く日数（1〜180）。未ログインでも読める。
--      作品・公演の指定が無い入口（公開カレンダー・リスト）は、組織の値と公開中の作品の個別指定のうち最長。
--   4. assert_private_booking_candidate_date: 今日（日本時間）+ 日数 より先の日は「申し込めるのは今日から N 日先までです」（P0058）で弾く。
--      この関数は候補の追加・グループ作成（private_booking_assert_candidate と候補日のトリガー）、日時付き申込（reservations のトリガー）、
--      空き判定、作品一覧の日付理由のすべてが通るので、保存と表示の両方に効く。
--   5. private_booking_candidate_slot_availability: P0058 を理由 too_far にし、detail に文面を入れる。
--      private_booking_scenario_date_reasons（ある環境だけ）: P0058 を too_far にする。
--      この 2 つは staging と本番で本文が違うため、今の本文に同じ置き換えを行う形にしている（本番・staging で同じファイルを使う）。
--      もう一度流しても結果は同じ（置き換え済みなら何もしない）。staging の空き判定の migration を後から本番へ流したときは、
--      最後にこのファイルをもう一度流す。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md（I21・手順 1・例 R31〜R33）
-- 巻き戻し: supabase/rollbacks/20261020150000_private_booking_horizon_days.sql

-- 1. MMQ の既定
CREATE OR REPLACE FUNCTION public.get_operating_setting_default(p_key text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT '{"cancellation_policy":"","cancellation_policy_items":[{"id":"1","content":"キャンセルの際は必ず事前にご連絡ください"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"無断キャンセルの場合は100%のキャンセル料が発生します"}],"cancellation_deadline_hours":48,"cancellation_fees":[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}],"cancellation_fee_basis":"participant_total","private_cancellation_policy":"","private_cancellation_policy_items":[{"id":"1","content":"貸切予約には下記の貸切公演ポリシーが適用されます"},{"id":"2","content":"キャンセル料は下記の計算基準と料率に基づき算出されます"},{"id":"3","content":"日程変更は空き状況により可能な場合があります"}],"private_cancellation_deadline_hours":720,"private_cancellation_fees":[{"hours_before":168,"fee_percentage":50,"description":"7日前より公演価格全額の50%"},{"hours_before":72,"fee_percentage":100,"description":"3日前より公演価格全額の100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断キャンセル100%"}],"private_cancellation_fee_basis":"performance_total","organizer_cancel_reasons":[{"id":"1","content":"最少催行人数に満たない場合"},{"id":"2","content":"自然災害、感染症の流行など不可抗力の場合"},{"id":"3","content":"店舗の都合によるやむを得ない事情がある場合"}],"organizer_cancel_refund_note":"参加料金は全額返金いたします。","cancellation_judgment_rules":[{"id":"1","timing":"前日 23:59","condition":"定員の過半数に満たない場合","result":"中止"},{"id":"2","timing":"前日 23:59","condition":"過半数以上だが最低開催人数に満たない場合","result":"公演ごとの開催判断期限まで募集を延長"},{"id":"3","timing":"前日 23:59","condition":"最低開催人数に達した場合","result":"開催確定"},{"id":"4","timing":"公演ごとの開催判断期限（延長された場合）","condition":"最低開催人数に満たない場合","result":"中止"}],"cancellation_notice_note":"中止が決定した場合、ご登録のメールアドレスに自動でお知らせします。中止の場合、参加料金は一切発生しません。","reservation_change_deadline_hours":24,"reservation_change_note":"参加人数の変更は、マイページに表示された変更期限まで行えます。日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。この場合、キャンセル時期によってキャンセル料が発生する場合があります。","private_reservation_change_deadline_hours":168,"private_reservation_change_note":"貸切予約の変更は、表示された変更期限まで可能です。日程変更は空き状況によります。","refund_method_note":"当日現地決済のため、事前にお支払いいただく金額はありません。キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、別途ご連絡させていただきます。","payment_method_label":"現地決済","payment_method_description":"ご来店時にお支払いください","default_performance_duration":180,"preparation_minutes":60,"judgment_minutes_before":240,"coupon_usage_enabled":true,"survey_enabled":false,"survey_deadline_days":1,"survey_url":"","private_booking_horizon_days":180}'::jsonb->p_key; $function$
;

-- 2. 設定の解決（キーを足す）
CREATE OR REPLACE FUNCTION public.resolve_operating_setting(p_organization_id uuid, p_key text, p_default jsonb DEFAULT 'null'::jsonb, p_store_id uuid DEFAULT NULL::uuid, p_scenario_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid := p_store_id;
  v_scenario uuid := p_scenario_id;
  v_event public.schedule_events%ROWTYPE;
  v_value jsonb := COALESCE(public.get_operating_setting_default(p_key), p_default);
  v_source text := 'default';
  v_scope text;
  v_legacy jsonb;
  v_override jsonb;
  v_candidate jsonb;
  v_keys constant text[] := ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note','payment_method_label','payment_method_description','company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason','judgment_minutes_before','preparation_minutes','survey_enabled','survey_deadline_days','survey_url','coupon_usage_enabled','default_performance_duration','private_booking_horizon_days'];
BEGIN
  IF p_key IS NULL OR NOT p_key = ANY(v_keys) THEN
    RAISE EXCEPTION 'unknown setting key' USING ERRCODE = '22023';
  END IF;
  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.schedule_events WHERE id = p_event_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event not found' USING ERRCODE = '42501'; END IF;
    v_store := v_event.store_id;
    v_scenario := v_event.organization_scenario_id;
    IF v_scenario IS NULL AND COALESCE(v_event.scenario_master_id,v_event.scenario_id) IS NOT NULL THEN
      SELECT id INTO v_scenario FROM public.organization_scenarios
        WHERE organization_id = p_organization_id AND scenario_master_id = COALESCE(v_event.scenario_master_id,v_event.scenario_id);
    END IF;
    IF (p_store_id IS NOT NULL AND p_store_id IS DISTINCT FROM v_store)
      OR (p_scenario_id IS NOT NULL AND p_scenario_id IS DISTINCT FROM v_scenario) THEN
      RAISE EXCEPTION 'event context mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_store IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_store AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'store not found' USING ERRCODE = '42501';
  END IF;
  IF v_scenario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_scenarios WHERE id = v_scenario AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'scenario not found' USING ERRCODE = '42501';
  END IF;
  FOREACH v_scope IN ARRAY ARRAY['organization','store','scenario','performance'] LOOP
    IF (v_scope = 'store' AND v_store IS NULL) OR (v_scope = 'scenario' AND v_scenario IS NULL)
      OR (v_scope = 'performance' AND p_event_id IS NULL) THEN CONTINUE; END IF;
    IF p_key IN ('company_name','company_phone','company_email','company_address','default_performance_duration')
      AND v_scope IN ('scenario','performance') THEN CONTINUE; END IF;
    -- 貸切を受け付ける範囲は MMQ の既定 → 組織 → 作品 → 公演 の順（店舗では指定しない。2026-10-20 社長指示）
    IF p_key = 'private_booking_horizon_days' AND v_scope = 'store' THEN CONTINUE; END IF;
    v_legacy := NULL;
    IF v_scope = 'organization' THEN
      SELECT to_jsonb(e)->p_key INTO v_legacy FROM public.email_settings e
        WHERE e.organization_id = p_organization_id AND e.store_id IS NULL ORDER BY e.id LIMIT 1;
    ELSIF v_scope = 'store' THEN
      SELECT to_jsonb(r)->p_key INTO v_legacy FROM public.reservation_settings r
        WHERE r.organization_id = p_organization_id AND r.store_id = v_store;
      IF v_legacy IS NULL THEN
        SELECT to_jsonb(e)->p_key INTO v_legacy FROM public.email_settings e
          WHERE e.organization_id = p_organization_id AND e.store_id = v_store;
      END IF;
      IF p_key = 'default_performance_duration' THEN
        SELECT to_jsonb(p.default_duration) INTO v_legacy FROM public.performance_schedule_settings p
          WHERE p.store_id = v_store AND (p.organization_id = p_organization_id OR p.organization_id IS NULL);
      END IF;
    ELSIF v_scope = 'scenario' THEN
      IF p_key = 'preparation_minutes' THEN
        SELECT to_jsonb(60 + s.extra_preparation_time) INTO v_legacy FROM public.organization_scenarios s
          WHERE s.organization_id = p_organization_id AND s.id = v_scenario;
      ELSE
        SELECT to_jsonb(s)->p_key INTO v_legacy FROM public.organization_scenarios s
          WHERE s.organization_id = p_organization_id AND s.id = v_scenario;
      END IF;
    ELSIF v_scope = 'performance' THEN
      v_legacy := to_jsonb(v_event)->p_key;
    END IF;
    SELECT o.settings INTO v_override FROM public.operating_setting_overrides o
      WHERE o.organization_id = p_organization_id
      AND o.store_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'store' THEN v_store END)
      AND o.organization_scenario_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'scenario' THEN v_scenario END)
      AND o.schedule_event_id IS NOT DISTINCT FROM (CASE WHEN v_scope = 'performance' THEN p_event_id END);
    IF p_key IN ('company_name','company_phone','company_email','company_address','reminder_enabled','reminder_schedule','reservation_confirmation_template','cancellation_template','reminder_template','private_reminder_template','booking_change_template','private_request_template','private_confirm_template','private_rejection_template','waitlist_notify_template','waitlist_registration_template','performance_cancellation_template','performance_confirmation_template','event_cancellation_template','performance_extension_template','store_cancellation_template','private_rejection_reason')
      AND jsonb_typeof(v_legacy) = 'string' AND btrim(v_legacy #>> '{}') = '' THEN v_legacy := NULL; END IF;
    v_candidate := CASE WHEN v_override ? p_key THEN v_override->p_key ELSE v_legacy END;
    IF v_candidate IS NOT NULL AND v_candidate <> 'null'::jsonb THEN
      v_value := v_candidate;
      v_source := v_scope;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('value', v_value, 'source', v_source);
END;
$function$
;

-- 3. 実際に効く日数
-- 貸切を受け付ける範囲（今日から何日先の公演日まで申し込めるか）。I21。
-- 設定の優先順位: MMQ の既定（get_operating_setting_default、180）→ 組織 → 作品 → 公演（後のものが上書き。店舗では指定しない）。
-- 値は operating_setting_overrides のキー private_booking_horizon_days（設定画面: 設定 › 貸切予約の受付締切、作品編集、公演の個別設定。管理者だけ）。
-- p_scenario_id は作品マスタの id でも組織の作品 id でもよい。p_event_id があれば公演から作品をたどる。
-- 作品も公演も無い（作品未選択の入口: 公開カレンダー・リスト）ときは、個別指定で受け付ける作品を隠さないよう、
-- 組織の値と、公開中の作品の個別指定のうち最も長い日数を返す（作品を選んだあとに必ずその作品の値で判定し直す。受付締切と同じ考え方）。
-- 判定（保存・空き判定）は assert_private_booking_candidate_date がこの関数を作品付きで呼ぶ。画面は src/lib/privateBookingHorizon.ts。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md
CREATE OR REPLACE FUNCTION public.get_effective_private_booking_horizon_days(
 p_organization_id uuid, p_scenario_id uuid DEFAULT NULL, p_event_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_scenario uuid; v_value jsonb; v_days integer; v_max integer;
BEGIN
 IF p_organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id) THEN RETURN 180; END IF;
 IF p_event_id IS NOT NULL THEN
  v_value := public.resolve_operating_setting(p_organization_id,'private_booking_horizon_days','180'::jsonb,NULL,NULL,p_event_id)->'value';
 ELSE
  IF p_scenario_id IS NOT NULL THEN
   SELECT s.id INTO v_scenario FROM public.organization_scenarios s WHERE s.organization_id=p_organization_id
    AND (s.id=p_scenario_id OR s.scenario_master_id=p_scenario_id
     OR s.scenario_master_id=(SELECT legacy.scenario_master_id FROM public.scenarios legacy WHERE legacy.id=p_scenario_id AND legacy.organization_id=p_organization_id))
   ORDER BY (s.id=p_scenario_id) DESC, s.created_at LIMIT 1;
  END IF;
  v_value := public.resolve_operating_setting(p_organization_id,'private_booking_horizon_days','180'::jsonb,NULL,v_scenario,NULL)->'value';
 END IF;
 v_days := CASE WHEN jsonb_typeof(v_value)='number' AND (v_value#>>'{}')::numeric BETWEEN 1 AND 180
  AND (v_value#>>'{}')::numeric=trunc((v_value#>>'{}')::numeric) THEN (v_value#>>'{}')::integer ELSE 180 END;
 IF p_scenario_id IS NULL AND p_event_id IS NULL THEN
  SELECT max((o.settings->>'private_booking_horizon_days')::integer) INTO v_max
  FROM public.operating_setting_overrides o JOIN public.organization_scenarios s ON s.id=o.organization_scenario_id
  WHERE o.organization_id=p_organization_id AND o.store_id IS NULL AND o.schedule_event_id IS NULL
   AND s.organization_id=p_organization_id AND s.org_status='available'
   AND jsonb_typeof(o.settings->'private_booking_horizon_days')='number'
   AND (o.settings->>'private_booking_horizon_days') ~ '^[0-9]{1,3}$'
   AND (o.settings->>'private_booking_horizon_days')::integer BETWEEN 1 AND 180;
  v_days := greatest(v_days, coalesce(v_max, v_days));
 END IF;
 RETURN v_days;
END $function$;
REVOKE ALL ON FUNCTION public.get_effective_private_booking_horizon_days(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_private_booking_horizon_days(uuid,uuid,uuid) TO anon,authenticated,service_role;

-- 4. 保存・表示の共通の日付検査
-- RPC と直接 INSERT/UPDATE の双方で、保存時点の実効締切・申し込める日の上限・作品の公演期間・貸切募集期間を強制する。
-- 申し込める日の上限は「今日（日本時間）から設定の日数後まで」（I21。MMQ 既定 180 日 → 組織 → 作品 → 公演の順に上書き）。超えたら P0058。
CREATE OR REPLACE FUNCTION public.assert_private_booking_candidate_date(p_org uuid, p_scenario uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE days INTEGER; horizon INTEGER; today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE; period RECORD;
BEGIN
 IF p_org IS NULL OR p_scenario IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'PRIVATE_BOOKING_CONTEXT_REQUIRED' USING ERRCODE='P0045'; END IF;
 days := public.get_effective_private_booking_deadline_days(p_org,NULL,p_scenario);
 IF p_date < today + days THEN
   RAISE EXCEPTION 'PRIVATE_BOOKING_DEADLINE_PASSED' USING ERRCODE='P0045';
 END IF;
 -- 申し込める日の上限（設定「貸切を受け付ける範囲」。作品の値まで反映。2026-10-20 本番 #1140）
 horizon := public.get_effective_private_booking_horizon_days(p_org,p_scenario,NULL);
 IF p_date > today + horizon THEN
   RAISE EXCEPTION '申し込めるのは今日から % 日先までです', horizon USING ERRCODE='P0058', HINT='PRIVATE_BOOKING_TOO_FAR';
 END IF;
 -- 作品編集の「貸切募集期間」（申し込める期間）と「公演期間」（公演できる日の範囲）。未設定は制限なし。
 SELECT os.booking_start_date,os.booking_end_date,os.available_from,os.available_until INTO period
 FROM public.organization_scenarios os
 WHERE os.organization_id=p_org AND (os.id=p_scenario OR os.scenario_master_id=p_scenario OR os.scenario_master_id=(SELECT legacy.scenario_master_id FROM public.scenarios legacy WHERE legacy.id=p_scenario AND legacy.organization_id=p_org))
 ORDER BY CASE WHEN os.id=p_scenario THEN 0 ELSE 1 END,os.created_at LIMIT 1;
 IF FOUND THEN
   IF (period.booking_start_date IS NOT NULL AND today < period.booking_start_date)
      OR (period.booking_end_date IS NOT NULL AND today > period.booking_end_date) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_NOT_ACCEPTED' USING ERRCODE='P0044';
   END IF;
   IF (period.available_from IS NOT NULL AND p_date < period.available_from)
      OR (period.available_until IS NOT NULL AND p_date > period.available_until) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD' USING ERRCODE='P0054';
   END IF;
 END IF;
END;
$function$;

-- 5. 表示側: P0058 を理由 too_far にする（今の本文に同じ置き換えを行う。置き換え済みなら何もしない）
DO $$
DECLARE def text; fn regprocedure;
BEGIN
 fn := 'public.private_booking_candidate_slot_availability(uuid,uuid,uuid[],date,date)'::regprocedure;
 def := pg_get_functiondef(fn);
 IF position('P0058' IN def)=0 THEN
  IF position(E'   WHEN SQLSTATE ''P0054'' THEN day_reason:=''outside_period'';\n' IN def)=0
   OR position('   IF day_reason IS NOT NULL THEN reason:=day_reason;' IN def)=0 THEN
   RAISE EXCEPTION 'private_booking_candidate_slot_availability の本文が想定と違います。置き換えずに止めます';
  END IF;
  def := replace(def, E'   WHEN SQLSTATE ''P0054'' THEN day_reason:=''outside_period'';\n',
   E'   WHEN SQLSTATE ''P0054'' THEN day_reason:=''outside_period'';\n   WHEN SQLSTATE ''P0058'' THEN day_reason:=''too_far'';\n');
  def := replace(def, '   IF day_reason IS NOT NULL THEN reason:=day_reason;',
   '   IF day_reason IS NOT NULL THEN reason:=day_reason; IF day_reason=''too_far'' THEN detail:=''申し込めるのは今日から ''||public.get_effective_private_booking_horizon_days(p_organization_id,p_scenario_id,NULL)||'' 日先までです''; END IF;');
  EXECUTE def;
 END IF;

 IF to_regprocedure('public.private_booking_scenario_date_reasons(uuid,date,uuid[])') IS NOT NULL THEN
  fn := 'public.private_booking_scenario_date_reasons(uuid,date,uuid[])'::regprocedure;
  def := pg_get_functiondef(fn);
  IF position('P0058' IN def)=0 THEN
   IF position(E'   WHEN SQLSTATE ''P0054'' THEN reason := ''outside_period'';\n' IN def)=0 THEN
    RAISE EXCEPTION 'private_booking_scenario_date_reasons の本文が想定と違います。置き換えずに止めます';
   END IF;
   def := replace(def, E'   WHEN SQLSTATE ''P0054'' THEN reason := ''outside_period'';\n',
    E'   WHEN SQLSTATE ''P0054'' THEN reason := ''outside_period'';\n   WHEN SQLSTATE ''P0058'' THEN reason := ''too_far'';\n');
   EXECUTE def;
  END IF;
 END IF;
END $$;
