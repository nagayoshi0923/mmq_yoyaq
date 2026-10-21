-- 公演の作成と担当（GM・スタッフ参加・追加席）を 1 つの取引で保存する（2026-10-22 hotfix、PR #1210）。
-- これまでは公演を担当空で作成し、別の取引で sync_event_staff_participations を呼んでいたため、
-- 担当の保存が失敗すると「GM 空の公演」だけが残った。この関数は作成と担当保存の両方が成功したときだけ確定し、
-- どちらかが失敗すれば公演ごと取り消す。担当の保存は既存の sync_event_staff_participations をそのまま使う
-- （権限・二重保存の防止・expectedStaff の競合検知・定員・席予約の規則は変えない）。
-- 担当もスタッフ参加も無い作成（GM 未指定）は従来どおり API の通常の作成を使い、この関数を通らない。
-- 作成履歴（schedule_event_history の create）も同じ取引で、確定した公演の内容で記録する。
-- 以前は画面が保存後に非同期で記録していたため、保存直後の別の編集の内容が作成値として残ったり、
-- 保存直後に画面を離れると作成履歴が欠けたりし得た（Codex 再レビュー 2e24bbf の 3）。
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_event_staff_participations' AND md5(p.prosrc)='560ca354cb5989fe0bae21630753cc7d') THEN
  RAISE EXCEPTION '現行定義が変更されています: sync_event_staff_participations';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_schedule_event_with_staff') THEN
  RAISE EXCEPTION '同名の関数が既にあります: create_schedule_event_with_staff';
 END IF;
END $preflight$;

CREATE FUNCTION public.create_schedule_event_with_staff(p_event jsonb, p_gms text[], p_gm_roles jsonb, p_entries jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_org uuid := public.get_user_organization_id();
 v_cols text;
 v_id uuid;
 v_result jsonb;
 v_event public.schedule_events;
 v_actor_staff uuid;
 v_actor_name text;
 -- api/_lib/schedule/writeHelpers.ts の SCHEDULE_CREATABLE_FIELDS から担当（gms・gm_roles）を除いたもの
 c_allowed CONSTANT text[] := ARRAY['date','store_id','venue','scenario','scenario_master_id','organization_scenario_id',
  'category','start_time','end_time','capacity','notes','time_slot','is_reservation_enabled','is_tentative','venue_rental_fee',
  'reservation_name','is_reservation_name_overwritten','is_private_request','reservation_id'];
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin')) THEN
  RAISE EXCEPTION '公演を作成する権限がありません' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR p_gms IS NULL OR jsonb_typeof(p_gm_roles) IS DISTINCT FROM 'object'
  OR jsonb_typeof(coalesce(p_entries,'[]'::jsonb)) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION '公演または担当の形式が不正です' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=nullif(p_event->>'store_id','')::uuid AND organization_id=v_org) THEN
  RAISE EXCEPTION '他組織の店舗は使用できません' USING ERRCODE='42501';
 END IF;
 SELECT string_agg(quote_ident(k), ',' ORDER BY k) INTO v_cols FROM jsonb_object_keys(p_event) k WHERE k = ANY(c_allowed);
 -- 組織はログイン中の組織に固定し、担当は空で作ってから下の同期で入れる（同期の競合検知の前提をそろえる）
 EXECUTE format('INSERT INTO public.schedule_events (organization_id, gms, gm_roles, %1$s) SELECT $1, ARRAY[]::text[], ''{}''::jsonb, %1$s FROM jsonb_populate_record(NULL::public.schedule_events, $2) RETURNING id', v_cols)
  INTO v_id USING v_org, p_event;
 v_result := public.sync_event_staff_participations(v_id, coalesce(p_entries,'[]'::jsonb), '[]'::jsonb, p_gms, p_gm_roles,
  jsonb_build_object('gms','[]'::jsonb,'gm_roles','{}'::jsonb));
 IF (v_result->>'success') = 'false' THEN
  RAISE EXCEPTION '%', coalesce(v_result->>'error','担当を保存できませんでした') USING ERRCODE='40001';
 END IF;
 -- 作成履歴: 画面の履歴（src/lib/api/eventHistoryApi.ts の作成記録）と同じ形。値は担当まで確定した後の公演。
 -- 担当の一括保存の履歴（同じ取引・now()）より前に並ぶよう、時刻を 1 マイクロ秒だけ前にする。
 SELECT * INTO v_event FROM public.schedule_events WHERE id=v_id;
 SELECT s.id, s.name INTO v_actor_staff, v_actor_name FROM public.staff s WHERE s.user_id=auth.uid() AND s.organization_id=v_org LIMIT 1;
 INSERT INTO public.schedule_event_history(schedule_event_id, organization_id, changed_by_user_id, changed_by_staff_id, changed_by_name,
  action_type, changes, old_values, new_values, event_date, store_id, time_slot, created_at)
 SELECT v_id, v_org, auth.uid(), v_actor_staff, coalesce(v_actor_name, (SELECT u.email FROM public.users u WHERE u.id=auth.uid()), '不明'),
  'create', '{}'::jsonb, NULL,
  (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(to_jsonb(v_event)) e WHERE e.key = ANY(ARRAY['id','organization_id','date','venue','store_id',
    'scenario','scenario_master_id','gms','gm_roles','start_time','end_time','category','capacity','max_participants','current_participants','notes',
    'is_cancelled','is_tentative','is_reservation_enabled','is_private_request','reservation_name','time_slot','venue_rental_fee'])),
  v_event.date, v_event.store_id, v_event.time_slot, now() - interval '1 microsecond';
 RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.create_schedule_event_with_staff(jsonb, text[], jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_schedule_event_with_staff(jsonb, text[], jsonb, jsonb) TO authenticated, service_role;
