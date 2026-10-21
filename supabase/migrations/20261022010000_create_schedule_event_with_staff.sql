-- 公演の作成（担当・作成履歴を含む）を 1 つの取引で確定する（2026-10-22 hotfix、PR #1210）。
-- これまでは公演を担当空で作成し、別の取引で sync_event_staff_participations を呼んでいたため、
-- 担当の保存が失敗すると「GM 空の公演」だけが残った。この関数は作成と担当保存の両方が成功したときだけ確定し、
-- どちらかが失敗すれば公演ごと取り消す。担当の保存は既存の sync_event_staff_participations をそのまま使う
-- （権限・二重保存の防止・expectedStaff の競合検知・定員・席予約の規則は変えない）。GM 未指定（担当もスタッフ参加も無い）の
-- 作成もこの関数で行い、その場合は担当の同期を呼ばない。
-- 作成履歴（schedule_event_history の create）も同じ取引で、確定した公演の内容で記録する（GM の有無によらない）。
-- 以前は画面が保存後に非同期で記録していたため、保存直後の別の編集の内容が作成値として残ったり、
-- 保存直後に画面を離れると作成履歴が欠けたりし得た（Codex 再レビュー 2e24bbf の 3、2fa19ac の P2-②）。
-- 作成要求には画面が作る要求 ID（UUID）を付け、同じ利用者・組織の同じ要求 ID の公演が既にあればそれを返す（作り直さない）。
-- 応答が届かず結果が分からなかった保存を同じ入力で保存し直しても、二重に作成しない（Codex 再レビュー 2fa19ac の P2-①）。
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_event_staff_participations' AND md5(p.prosrc)='560ca354cb5989fe0bae21630753cc7d') THEN
  RAISE EXCEPTION '現行定義が変更されています: sync_event_staff_participations';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_schedule_event_with_staff') THEN
  RAISE EXCEPTION '同名の関数が既にあります: create_schedule_event_with_staff';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='find_schedule_event_create_request') THEN
  RAISE EXCEPTION '同名の関数が既にあります: find_schedule_event_create_request';
 END IF;
 IF to_regclass('public.schedule_event_create_requests') IS NOT NULL THEN
  RAISE EXCEPTION '同名の表が既にあります: schedule_event_create_requests';
 END IF;
END $preflight$;

-- 作成要求 ID と作られた公演の対応。公演が消えれば対応も消える（同じ要求 ID で作り直せる）。
-- 照合（find_schedule_event_create_request）で「未作成」と答えた要求 ID は、取消済み（event_id なし・cancelled_at あり）として残し、
-- 後から届いた同じ要求 ID の作成を受け付けない（照合のあとに元の要求が遅れて届いて二重に作るのを防ぐ。Codex 再レビュー 929c857）。
-- 画面・API から直接は読み書きしない（下の関数だけが使う）。
CREATE TABLE public.schedule_event_create_requests (
 request_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 event_id uuid REFERENCES public.schedule_events(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz,
 CONSTRAINT schedule_event_create_requests_created_or_cancelled CHECK ((event_id IS NULL) = (cancelled_at IS NOT NULL))
);
CREATE INDEX schedule_event_create_requests_event_id_idx ON public.schedule_event_create_requests(event_id);
ALTER TABLE public.schedule_event_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_event_create_requests FROM PUBLIC, anon, authenticated;

-- 巻き戻し（rollbacks/ の同名ファイル）で rollback_backup へ退避した対応を、当て直しのときに書き戻す。
-- 書き戻すのは公演がまだある行と取消済みの行（消えた公演の要求 ID は、同じ ID で作り直せてよい）。退避が無ければ何もしない。
-- 書き戻した後、退避のうち公演が残っている行がすべて同じ対応で入ったことを確かめ、違えば取引ごと止める。
DO $restore$
DECLARE v_src text; v_backup bigint; v_restored bigint; v_total_restored bigint := 0; v_gone bigint; v_missing bigint;
BEGIN
 FOR v_src IN
  SELECT format('rollback_backup.%I', c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='rollback_backup' AND c.relkind='r' AND c.relname LIKE 'schedule\_event\_create\_requests\_backup\_%' ORDER BY c.relname DESC
 LOOP
  EXECUTE format('SELECT count(*) FROM %s', v_src) INTO v_backup;
  EXECUTE format('INSERT INTO public.schedule_event_create_requests(request_id, organization_id, user_id, event_id, created_at, cancelled_at)
   SELECT b.request_id, b.organization_id, b.user_id, b.event_id, b.created_at, b.cancelled_at FROM %s b
   WHERE b.event_id IS NULL OR EXISTS (SELECT 1 FROM public.schedule_events e WHERE e.id=b.event_id AND e.organization_id=b.organization_id)
   ON CONFLICT (request_id) DO NOTHING', v_src);
  GET DIAGNOSTICS v_restored = ROW_COUNT;
  EXECUTE format('SELECT count(*) FROM %s b WHERE b.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schedule_events e WHERE e.id=b.event_id AND e.organization_id=b.organization_id)', v_src) INTO v_gone;
  EXECUTE format('SELECT count(*) FROM %s b WHERE (b.event_id IS NULL OR EXISTS (SELECT 1 FROM public.schedule_events e WHERE e.id=b.event_id AND e.organization_id=b.organization_id))
   AND NOT EXISTS (SELECT 1 FROM public.schedule_event_create_requests r WHERE r.request_id=b.request_id AND r.event_id IS NOT DISTINCT FROM b.event_id
    AND r.organization_id=b.organization_id AND r.user_id=b.user_id)', v_src) INTO v_missing;
  IF v_missing > 0 THEN
   RAISE EXCEPTION '退避 % の書き戻しが一致しません（公演が残っているのに戻らなかった対応 % 行）', v_src, v_missing;
  END IF;
  v_total_restored := v_total_restored + v_restored;
  RAISE NOTICE '書き戻しました: % → public.schedule_event_create_requests（退避 % 行・書き戻し % 行・公演が消えていて戻さない % 行）', v_src, v_backup, v_restored, v_gone;
 END LOOP;
END $restore$;

CREATE FUNCTION public.create_schedule_event_with_staff(p_request_id uuid, p_event jsonb, p_gms text[], p_gm_roles jsonb, p_entries jsonb)
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
 v_prior public.schedule_event_create_requests;
 -- api/_lib/schedule/writeHelpers.ts の SCHEDULE_CREATABLE_FIELDS から担当（gms・gm_roles）を除いたもの
 c_allowed CONSTANT text[] := ARRAY['date','store_id','venue','scenario','scenario_master_id','organization_scenario_id',
  'category','start_time','end_time','capacity','notes','time_slot','is_reservation_enabled','is_tentative','venue_rental_fee',
  'reservation_name','is_reservation_name_overwritten','is_private_request','reservation_id'];
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin')) THEN
  RAISE EXCEPTION '公演を作成する権限がありません' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR p_gms IS NULL OR jsonb_typeof(p_gm_roles) IS DISTINCT FROM 'object'
  OR jsonb_typeof(coalesce(p_entries,'[]'::jsonb)) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION '公演または担当の形式が不正です' USING ERRCODE='22023';
 END IF;
 -- 同じ要求 ID の同時の送信は順番に処理し、先に確定した公演を返す
 PERFORM pg_advisory_xact_lock(hashtextextended('mmq-event-create:'||p_request_id::text, 0));
 SELECT * INTO v_prior FROM public.schedule_event_create_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.organization_id IS DISTINCT FROM v_org OR v_prior.user_id IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION '要求 ID が別の利用者の作成と重なっています。画面を開き直してください' USING ERRCODE='22023';
  END IF;
  IF v_prior.event_id IS NULL THEN
   -- 照合で「未作成」と答えて閉じた要求。遅れて届いても作らない
   -- 独自の SQLSTATE（MMQC1）で返し、API は「取消済み（作成していない）」と区別して画面へ伝える
   RAISE EXCEPTION 'この保存は、後の保存で未作成と確認して取り消したため作成していません。スケジュールを再読み込みして確かめてください' USING ERRCODE='MMQC1';
  END IF;
  RETURN v_prior.event_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=nullif(p_event->>'store_id','')::uuid AND organization_id=v_org) THEN
  RAISE EXCEPTION '他組織の店舗は使用できません' USING ERRCODE='42501';
 END IF;
 SELECT string_agg(quote_ident(k), ',' ORDER BY k) INTO v_cols FROM jsonb_object_keys(p_event) k WHERE k = ANY(c_allowed);
 -- 組織はログイン中の組織に固定し、担当は空で作ってから下の同期で入れる（同期の競合検知の前提をそろえる）
 EXECUTE format('INSERT INTO public.schedule_events (organization_id, gms, gm_roles, %1$s) SELECT $1, ARRAY[]::text[], ''{}''::jsonb, %1$s FROM jsonb_populate_record(NULL::public.schedule_events, $2) RETURNING id', v_cols)
  INTO v_id USING v_org, p_event;
 IF cardinality(p_gms) > 0 OR jsonb_array_length(coalesce(p_entries,'[]'::jsonb)) > 0 THEN
  v_result := public.sync_event_staff_participations(v_id, coalesce(p_entries,'[]'::jsonb), '[]'::jsonb, p_gms, p_gm_roles,
   jsonb_build_object('gms','[]'::jsonb,'gm_roles','{}'::jsonb));
  IF (v_result->>'success') = 'false' THEN
   RAISE EXCEPTION '%', coalesce(v_result->>'error','担当を保存できませんでした') USING ERRCODE='40001';
  END IF;
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
 INSERT INTO public.schedule_event_create_requests(request_id, organization_id, user_id, event_id) VALUES (p_request_id, v_org, auth.uid(), v_id);
 RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.create_schedule_event_with_staff(uuid, jsonb, text[], jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_schedule_event_with_staff(uuid, jsonb, text[], jsonb, jsonb) TO authenticated, service_role;

-- 作成の結果が分からなかった要求 ID が、自分の作成として確定しているかを調べる（Codex 再レビュー 7658a64 の 1）。
-- 同じ要求 ID の作成が処理中なら、その取引が終わるまで待ってから答える。
-- 確定していれば公演 ID。無ければその要求 ID を取消済みとして記録してから NULL を返す（Codex 再レビュー 929c857）。
-- 以後、同じ要求 ID の作成が遅れて届いても作らないので、「未作成」の答えは確定になる。
CREATE FUNCTION public.find_schedule_event_create_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_org uuid := public.get_user_organization_id(); v_prior public.schedule_event_create_requests;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role::text IN ('admin','staff','license_admin')) THEN
  RAISE EXCEPTION '公演を確認する権限がありません' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION '要求 ID が必要です' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mmq-event-create:'||p_request_id::text, 0));
 SELECT * INTO v_prior FROM public.schedule_event_create_requests r WHERE r.request_id=p_request_id;
 IF FOUND THEN
  -- 他人の要求 ID なら何も教えない（取消もしない）
  IF v_prior.organization_id IS DISTINCT FROM v_org OR v_prior.user_id IS DISTINCT FROM auth.uid() THEN RETURN NULL; END IF;
  RETURN v_prior.event_id;
 END IF;
 INSERT INTO public.schedule_event_create_requests(request_id, organization_id, user_id, event_id, cancelled_at)
  VALUES (p_request_id, v_org, auth.uid(), NULL, now());
 RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.find_schedule_event_create_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_schedule_event_create_request(uuid) TO authenticated, service_role;
