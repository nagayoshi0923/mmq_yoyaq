-- 候補日時 1 件を保存してよいかの判定（保存時の共通の検査）。入らなければ理由付きで例外を投げる。
-- 呼び出し元: private_group_add_candidate_dates（候補の追加）／create_private_group_atomic（グループ作成時の候補）。
-- 画面の空き表示（private_booking_candidate_slot_availability）と同じ店舗ごとの判定 private_booking_slot_store_fit を使う。
-- p_slot は morning / afternoon / evening。p_start / p_end は HH:MM（形式は呼び出し元で確認済み）。
CREATE OR REPLACE FUNCTION public.private_booking_assert_candidate(
 p_org uuid, p_scenario_id uuid, p_store_ids uuid[], p_date date, p_slot text, p_start text, p_end text
) RETURNS void
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 sc record; v_stores uuid[]; custom_holidays jsonb; holiday boolean; slot_label text; start_min integer; end_min integer;
 valid boolean; start_ok boolean; all_not_allowed boolean; why text; max_gap integer; gap_need integer; fixed_start integer; has_store boolean;
BEGIN
 IF p_slot IS NULL OR p_slot NOT IN ('morning','afternoon','evening') THEN
  RAISE EXCEPTION '候補日時の形式が正しくありません' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_stores FROM unnest(coalesce(p_store_ids,'{}'::uuid[])) id WHERE id IS NOT NULL;
 IF cardinality(v_stores)=0 THEN RAISE EXCEPTION '希望店舗を選択してください' USING ERRCODE='22023'; END IF;
 SELECT s.* INTO sc FROM public.organization_scenarios_with_master s WHERE s.organization_id=p_org
  AND (s.scenario_master_id=p_scenario_id OR s.id=p_scenario_id)
  ORDER BY (s.id=p_scenario_id) DESC LIMIT 1;
 IF NOT FOUND OR coalesce(sc.duration,0)<=0 THEN RAISE EXCEPTION '作品の所要時間を確認できません' USING ERRCODE='22023'; END IF;
 PERFORM public.assert_private_booking_candidate_date(p_org,p_scenario_id,p_date);
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO custom_holidays FROM public.organization_settings os WHERE os.organization_id=p_org;
 holiday:=extract(dow FROM p_date) IN (0,6) OR public.is_booking_calendar_holiday(p_date) OR coalesce(custom_holidays ? p_date::text,false);
 slot_label:=CASE p_slot WHEN 'morning' THEN '午前' WHEN 'afternoon' THEN '午後' ELSE '夜' END;
 start_min:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 end_min:=extract(hour FROM p_end::time)::integer*60+extract(minute FROM p_end::time)::integer;
 -- 1つの店舗で、画面が返した開始時刻が前後の公演・受付停止・営業時間の隙間に収まり、終了がその店舗の所要時間と合うこと。
 -- 他店の条件を混ぜない。土日祝の扱い（店舗の特別営業日を含む）は店舗ごとに store_fit が決める。
 SELECT coalesce(bool_or(c.fits AND c.start_min+c.minutes=end_min AND c.start_min+c.minutes<=1380),false),
  coalesce(bool_or(c.fits),false),
  coalesce(bool_and(c.why='slot_not_allowed'),false),
  CASE WHEN bool_or(c.why='fixed_start') THEN 'fixed_start' WHEN bool_or(c.why='conflict') THEN 'conflict' WHEN bool_or(c.why='blocked') THEN 'blocked' ELSE 'closed' END,
  max(c.gap_minutes) FILTER (WHERE c.why='conflict'),
  min(c.minutes) FILTER (WHERE c.why='conflict'),
  -- 作品の開始時刻が決まっている枠（2026-10-15 社長決定: ずらさない）
  min(c.standard_min) FILTER (WHERE c.fixed)
  INTO valid, start_ok, all_not_allowed, why, max_gap, gap_need, fixed_start
 FROM public.private_booking_slot_store_fit(p_org,p_scenario_id,to_jsonb(sc),v_stores,p_date,holiday,p_slot,start_min) c;
 IF valid THEN RETURN; END IF;
 IF start_ok THEN
  -- 開始は入るが終了が所要時間と合わない（画面を開いた後に所要時間が変わった）
  RAISE EXCEPTION '公演時間が更新されているか、営業時間内に収まりません。候補日を選び直してください' USING ERRCODE='40001';
 END IF;
 IF all_not_allowed THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=ANY(v_stores) AND s.organization_id=p_org AND s.status='active'
  AND s.ownership_type IS DISTINCT FROM 'office'
  AND CASE WHEN coalesce(cardinality(sc.available_stores),0)>0 THEN s.id::text=ANY(sc.available_stores) ELSE NOT coalesce(s.is_temporary,false) END) INTO has_store;
 RAISE EXCEPTION '選択した候補日時は現在受付できません（%/% %: %）。空き状況を更新して選び直してください',
  extract(month FROM p_date),extract(day FROM p_date),slot_label,
  CASE WHEN NOT has_store THEN 'この作品を上演できる店舗が希望店舗にありません'
   WHEN why='fixed_start' THEN 'この作品の開始時刻は '||to_char(make_time(fixed_start/60,fixed_start%60,0),'HH24:MI')||' です'
   WHEN why='conflict' AND fixed_start IS NOT NULL THEN 'この作品の開始時刻 '||to_char(make_time(fixed_start/60,fixed_start%60,0),'HH24:MI')||' では前後の公演と重なります'
   WHEN why='conflict' THEN '他の公演と重なります'||CASE WHEN max_gap>0 AND max_gap<gap_need THEN '（空き '||public.private_booking_minutes_text(max_gap)||'・必要 '||public.private_booking_minutes_text(gap_need)||'）' ELSE '' END
   WHEN why='blocked' THEN '受付停止中です' ELSE '営業時間外です' END
  USING ERRCODE='22023';
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_assert_candidate(uuid,uuid,uuid[],date,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_assert_candidate(uuid,uuid,uuid[],date,text,text,text) TO service_role;
