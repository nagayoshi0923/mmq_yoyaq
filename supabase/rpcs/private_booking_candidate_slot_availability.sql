-- 貸切の候補日時（日付 × 朝・昼・夜）が選べるかの判定。画面の表示と保存（private_group_add_candidate_dates）で同じ判定を使う。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
-- 判定は「枠の名前」ではなく、その店舗のその日の前後の公演・受付停止・営業時間から逆算する（2026-10-11 社長決定）。
-- 1) private_booking_slot_store_fit: 店舗ごとの判定。占有区間の隙間に「所要時間」が入る開始時刻を探す。保存 RPC と共有。内部用。
--    占有区間 = 取り消されていない公演（前は公演側の準備時間、後ろはこの作品の準備時間ぶん広げる）
--             + 受付停止枠（その枠の時間帯全体）+ 営業時間外（その日の最初の枠の開始〜閉店の外）+ 貸切募集停止期間（全日）
--    開始時刻の範囲は「前の占有の終わり」〜「次の占有の始まり − 所要時間」（午前・午後・夜すべて同じ一般則）。
--    枠に属する条件は「公演が枠の時間帯（標準開始〜枠の終わり）と重なり、枠の終わりより前に始まる」こと。終了は閉店（最大 23:00）まで。
--    開始時刻は標準開始（作品・店舗の設定後）が入ればそれ、入らなければ標準に最も近い時刻（15 分刻み）。
--    例: 夜 19:00 標準・所要 5 時間・閉店 23:00 で前に公演が無ければ 18:00 に繰り上げる（旧「1380−所要時間」の特例と同じ結果）。
--    ただし作品にその枠の貸切開始時刻（organization_scenarios.private_booking_slot_start_times）があれば、その時刻を絶対とし、
--    入らなければずらさずに選べないとする（2026-10-15 社長決定。fixed=true）。
--    店舗の特別営業日（special_open_days）は店舗ごとに土日祝の扱いにし、開始時刻だけでなく所要時間・作品の貸切時間枠・
--    作品名の特例もすべて土日祝の値で判定する（I5。2026-10-15 Codex staging 点検）。
-- 2) private_booking_candidate_slot_availability: 作品ページ（グループ作成前）用。組織・作品・希望店舗・期間で返す。
-- 3) private_group_candidate_slot_availability: グループ用。参加者（会員・ゲスト）とスタッフだけ呼べる。2) を内部で使う。
-- 保存時の検査は private_booking_assert_candidate（supabase/rpcs/private_booking_assert_candidate.sql）。候補追加とグループ作成が共用する。
-- reason: no_store_for_scenario（この作品を上演できる希望店舗がない）/ conflict（他の公演と重なる）/ blocked（受付停止）/
--         closed（営業時間外）/ slot_not_allowed（この作品で選べない時間帯）/ past_deadline（受付締切後）/
--         not_recruiting（募集期間外）/ outside_period（公演期間外）/ too_far（申し込める範囲より先。設定 I21、detail に文面）/
--         already_added（追加済み、グループ用のみ）/
--         start_fixed（作品の開始時刻が決まっていて、その時刻では前後の公演と重なる）
-- detail: conflict で隙間はあるが所要時間が入らないとき「空き 2 時間・必要 5 時間」。
--         start_fixed のとき「この作品の開始時刻 14:30 では前後の公演と重なります」。adjusted: 標準開始からずらした時刻。

-- 分を「2 時間」「1 時間 30 分」「45 分」にする
CREATE OR REPLACE FUNCTION public.private_booking_minutes_text(p_minutes integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT CASE WHEN p_minutes IS NULL THEN NULL WHEN p_minutes<60 THEN p_minutes||' 分'
  WHEN p_minutes%60=0 THEN (p_minutes/60)||' 時間' ELSE (p_minutes/60)||' 時間 '||(p_minutes%60)||' 分' END
$function$;
REVOKE ALL ON FUNCTION public.private_booking_minutes_text(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_minutes_text(integer) TO service_role;

-- 隙間（p_free）のうち、開始が [p_lo, p_hi_excl) に入り所要 p_minutes が収まる開始時刻を 1 つ選ぶ。
-- 標準 p_standard が入ればそれ。入らなければ最も近い時刻（15 分刻み。丸めで外れるときは端の時刻）。無ければ NULL。
CREATE OR REPLACE FUNCTION public.private_booking_pick_start(p_free int4multirange, p_minutes integer, p_lo integer, p_hi_excl integer, p_standard integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT x.c FROM (
  SELECT CASE WHEN p_standard BETWEEN r.lo AND r.hi THEN p_standard
    WHEN p_standard<r.lo THEN CASE WHEN ((r.lo+14)/15)*15<=r.hi THEN ((r.lo+14)/15)*15 ELSE r.lo END
    ELSE CASE WHEN (r.hi/15)*15>=r.lo THEN (r.hi/15)*15 ELSE r.hi END END AS c
  FROM (SELECT greatest(lower(g),p_lo) AS lo, least(upper(g)-p_minutes,p_hi_excl-1) AS hi FROM unnest(p_free) g) r
  WHERE r.lo<=r.hi
 ) x ORDER BY abs(x.c-p_standard), x.c LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.private_booking_pick_start(int4multirange,integer,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_pick_start(int4multirange,integer,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.private_booking_slot_store_fit(
 p_org uuid, p_scenario_id uuid, p_scenario jsonb, p_store_ids uuid[], p_date date, p_holiday boolean, p_slot text, p_start_min integer
) RETURNS TABLE(store_id uuid, start_min integer, standard_min integer, fits boolean, why text, gap_minutes integer, fixed boolean, minutes integer)
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
 -- p_scenario: 作品の行（organization_scenarios_with_master を to_jsonb したもの）。title / available_stores /
 --   private_booking_slot_start_times / duration / weekend_duration / private_booking_time_slots(_weekend) を読む。
 -- p_holiday: 組織として土日祝か（土日・祝日・独自休日）。店舗の特別営業日（special_open_days）は店舗ごとにここで足す。
 --   土日祝の扱いになった店舗は、所要時間・作品の貸切時間枠・作品の開始時刻・作品名の特例をすべて土日祝の値で判定する（I5）。
 -- p_start_min を渡すとその開始時刻で判定する（保存時）。NULL なら店舗ごとに開始時刻を選ぶ（表示時）。
 -- fixed: 作品にこの枠の貸切開始時刻がある（2026-10-15 社長決定: その時刻を絶対とし、ずらさない）。
 --   表示時は標準開始（＝作品の開始時刻）だけを試し、保存時は標準開始以外を why=fixed_start で弾く。
 -- fits: すべての占有を除いて入る。why（入らないとき）: slot_not_allowed=作品の貸切時間枠に無い /
 --   closed=営業時間だけで入らない / conflict=受付停止を無視しても公演と重なって入らない /
 --   blocked=それ以外（受付停止・募集停止のために入らない）。
 -- gap_minutes: すべての占有を除いた隙間のうち、この枠の時間帯にかかる隙間の最大長（理由の補足用）。
 -- minutes: この店舗で使う所要時間（土日祝の扱いなら土日祝の所要時間）。
 -- 1つの店舗で全条件が成立すること。他店の条件を混ぜない。
DECLARE
 st record; eff jsonb; slots jsonb; band record; day_open integer; lb integer; prep integer; special boolean;
 free_hours int4multirange; free_unblocked int4multirange; free_events int4multirange; free_all int4multirange;
 occ int4multirange; cand int4range; hours_ok boolean; unblocked_ok boolean; events_ok boolean;
 weekend boolean; lo integer; hi_excl integer; allowed text[]; slot_times jsonb; title text; available text[];
 weekday_minutes integer; weekend_minutes integer;
BEGIN
 title:=coalesce(p_scenario->>'title','');
 slot_times:=p_scenario->'private_booking_slot_start_times';
 available:=CASE WHEN jsonb_typeof(p_scenario->'available_stores')='array'
  THEN ARRAY(SELECT jsonb_array_elements_text(p_scenario->'available_stores')) ELSE '{}'::text[] END;
 weekday_minutes:=nullif(p_scenario->>'duration','')::integer;
 weekend_minutes:=nullif(p_scenario->>'weekend_duration','')::integer;
 FOR st IN SELECT s.id, to_jsonb(h) AS hours FROM public.stores s
  LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=p_org
  WHERE s.id=ANY(p_store_ids) AND s.organization_id=p_org AND s.status='active'
   AND s.ownership_type IS DISTINCT FROM 'office'
   AND CASE WHEN coalesce(cardinality(available),0)>0 THEN s.id::text=ANY(available) ELSE NOT coalesce(s.is_temporary,false) END
  ORDER BY s.id
 LOOP
  store_id:=st.id; start_min:=NULL; standard_min:=NULL; fits:=false; why:='closed'; gap_minutes:=NULL; fixed:=false;
  hours_ok:=false; unblocked_ok:=false; events_ok:=false;
  -- 店舗の特別営業日は土日祝の扱い（I5: 日曜の営業設定と土日祝の作品設定を使う。#698）
  weekend:=p_holiday OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(st.hours->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text);
  minutes:=CASE WHEN weekend AND coalesce(weekend_minutes,0)>0 THEN weekend_minutes ELSE weekday_minutes END;
  -- 作品の貸切時間枠（平日／土日祝で別。空なら制限なし。I10）
  allowed:=CASE WHEN jsonb_typeof(p_scenario->(CASE WHEN weekend THEN 'private_booking_time_slots_weekend' ELSE 'private_booking_time_slots' END))='array'
   THEN ARRAY(SELECT jsonb_array_elements_text(p_scenario->(CASE WHEN weekend THEN 'private_booking_time_slots_weekend' ELSE 'private_booking_time_slots' END))) END;
  IF coalesce(cardinality(allowed),0)>0 AND NOT EXISTS(SELECT 1 FROM unnest(allowed) value WHERE value=ANY(CASE p_slot
    WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)) THEN
   why:='slot_not_allowed'; RETURN NEXT; CONTINUE;
  END IF;
  IF coalesce(minutes,0)<=0 THEN RETURN NEXT; CONTINUE; END IF;
  special:=p_slot='evening' AND weekend AND (title LIKE '%戦塵のレガストリア%' OR title LIKE '%BeatSpecter%');
  -- 作品ごとの開始時刻を店舗の開始時刻へ上書きする
  eff:=public.apply_scenario_slot_start_times(st.hours,slot_times,weekend);
  -- 作品にこの枠の開始時刻があるか（apply_scenario_slot_start_times と同じ読み方）
  fixed:=jsonb_typeof(slot_times)='object'
   AND left(btrim(coalesce(slot_times->(CASE WHEN weekend THEN 'weekend' ELSE 'weekday' END)->>p_slot,'')),5) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO slots FROM public.private_booking_store_day_slots(p_date,eff,weekend,cardinality(p_store_ids)=1) x;
  SELECT (x->>'start_minutes')::integer AS start_minutes,(x->>'end_minutes')::integer AS end_minutes,(x->>'closing_minutes')::integer AS closing_minutes
   INTO band FROM jsonb_array_elements(slots) x WHERE x->>'slot_key'=p_slot;
  IF NOT FOUND THEN RETURN NEXT; CONTINUE; END IF;
  prep:=public.resolve_preparation_minutes(p_org,st.id,p_scenario_id,NULL);
  -- 標準開始。戦塵のレガストリア／BeatSpecter の土日祝の夜は 19:30（それより前には始めない。
  -- ただし 19:30 開始で 23:00 を超えるときは従来どおり 23:00 終わりまで繰り上げてよい）。
  standard_min:=greatest(band.start_minutes,CASE WHEN special THEN 1170 ELSE 0 END);
  -- 開始の下限: 公演が枠の時間帯にかかること（特例はさらに 19:30 または 23:00−所要時間）
  lb:=greatest(band.start_minutes-minutes+1,CASE WHEN special THEN least(standard_min,1380-minutes) ELSE 0 END);
  SELECT min((x->>'start_minutes')::integer) INTO day_open FROM jsonb_array_elements(slots) x;
  free_hours:=CASE WHEN day_open<band.closing_minutes THEN int4multirange(int4range(day_open,band.closing_minutes)) ELSE '{}'::int4multirange END;
  -- 受付停止はその枠の時間帯全体。貸切募集停止期間は全日。
  IF EXISTS(SELECT 1 FROM public.store_recruitment_pauses pz WHERE pz.organization_id=p_org AND pz.store_id=st.id AND pz.pause_type='private'
   AND p_date BETWEEN coalesce(pz.starts_on,p_date) AND coalesce(pz.ends_on,p_date)) THEN
   free_unblocked:='{}'::int4multirange;
  ELSE
   SELECT range_agg(int4range((x->>'start_minutes')::integer,(x->>'end_minutes')::integer)) INTO occ
   FROM public.schedule_blocked_slots b JOIN jsonb_array_elements(slots) x ON x->>'slot_key'=b.time_slot
   WHERE b.organization_id=p_org AND b.store_id=st.id::text AND b.date=p_date;
   free_unblocked:=free_hours-coalesce(occ,'{}'::int4multirange);
  END IF;
  -- 公演は前に公演側の準備時間、後ろにこの作品の準備時間を足す。日をまたぐ公演も当日 0 時からの分で扱う。
  SELECT range_agg(int4range(r.s-public.resolve_preparation_minutes(p_org,NULL,NULL,r.id),r.e+prep)) INTO occ
  FROM (SELECT e.id,(e.date-p_date)*1440+extract(hour FROM e.start_time)::integer*60+extract(minute FROM e.start_time)::integer AS s,
    (e.date-p_date)*1440+CASE WHEN e.end_time<e.start_time THEN 1440 ELSE 0 END+extract(hour FROM e.end_time)::integer*60+extract(minute FROM e.end_time)::integer AS e
   FROM public.schedule_events e WHERE e.organization_id=p_org AND e.store_id=st.id AND e.is_cancelled=false
    AND e.date BETWEEN p_date-2 AND p_date+2) r
  WHERE r.e>=r.s;
  free_events:=free_hours-coalesce(occ,'{}'::int4multirange);
  free_all:=free_unblocked-coalesce(occ,'{}'::int4multirange);
  SELECT max(upper(g)-lower(g)) INTO gap_minutes FROM unnest(free_all) g WHERE lower(g)<band.end_minutes AND upper(g)>band.start_minutes;
  -- 開始時刻を探す範囲。作品の開始時刻があれば標準開始の 1 点だけ（ずらさない）
  lo:=CASE WHEN fixed THEN standard_min ELSE lb END;
  hi_excl:=CASE WHEN fixed THEN standard_min+1 ELSE band.end_minutes END;
  IF p_start_min IS NOT NULL THEN
   IF p_start_min>=lo AND p_start_min<hi_excl THEN
    cand:=int4range(p_start_min,p_start_min+minutes);
    hours_ok:=free_hours@>cand; unblocked_ok:=free_unblocked@>cand; events_ok:=free_events@>cand; fits:=free_all@>cand;
   END IF;
   IF fits THEN start_min:=p_start_min; END IF;
  ELSE
   hours_ok:=public.private_booking_pick_start(free_hours,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   unblocked_ok:=public.private_booking_pick_start(free_unblocked,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   events_ok:=public.private_booking_pick_start(free_events,minutes,lo,hi_excl,standard_min) IS NOT NULL;
   start_min:=public.private_booking_pick_start(free_all,minutes,lo,hi_excl,standard_min);
   fits:=start_min IS NOT NULL;
  END IF;
  why:=CASE WHEN fits THEN NULL WHEN fixed AND p_start_min IS NOT NULL AND p_start_min<>standard_min THEN 'fixed_start'
   WHEN NOT hours_ok THEN 'closed' WHEN unblocked_ok AND NOT events_ok THEN 'conflict' ELSE 'blocked' END;
  RETURN NEXT;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_slot_store_fit(uuid,uuid,jsonb,uuid[],date,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_slot_store_fit(uuid,uuid,jsonb,uuid[],date,boolean,text,integer) TO service_role;

-- 返す列が増えたため作り直す（グループ用が作品用を呼ぶので先に外す）
DROP FUNCTION IF EXISTS public.private_group_candidate_slot_availability(uuid,date,date,uuid,text);
DROP FUNCTION IF EXISTS public.private_booking_candidate_slot_availability(uuid,uuid,uuid[],date,date);
DROP FUNCTION IF EXISTS public.private_booking_slot_store_checks(uuid,uuid,text,text[],jsonb,uuid[],date,boolean,integer,text,integer);

CREATE OR REPLACE FUNCTION public.private_booking_candidate_slot_availability(
 p_organization_id uuid, p_scenario_id uuid, p_store_ids uuid[], p_from date, p_to date
) RETURNS TABLE(date date, time_slot text, available boolean, reason text, start_time text, end_time text, detail text, adjusted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 sc record; scj jsonb; v_stores uuid[]; custom_holidays jsonb; d date; slot text; holiday boolean;
 day_reason text; has_store boolean; best_start integer; best_std integer; best_minutes integer; why text; max_gap integer; gap_need integer; fixed_start integer;
BEGIN
 IF p_organization_id IS NULL OR p_scenario_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>62
  OR coalesce(cardinality(p_store_ids),0)>50 OR array_position(p_store_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION '空き状況の条件を確認してください' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.is_active) THEN
  RAISE EXCEPTION '空き状況を確認できません' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_stores FROM unnest(coalesce(p_store_ids,'{}'::uuid[])) id;
 SELECT s.* INTO sc FROM public.organization_scenarios_with_master s WHERE s.organization_id=p_organization_id
  AND (s.scenario_master_id=p_scenario_id OR s.id=p_scenario_id)
  ORDER BY (s.id=p_scenario_id) DESC LIMIT 1;
 IF NOT FOUND OR coalesce(sc.duration,0)<=0 THEN RAISE EXCEPTION '作品の所要時間を確認できません' USING ERRCODE='22023'; END IF;
 scj:=to_jsonb(sc);
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO custom_holidays FROM public.organization_settings os WHERE os.organization_id=p_organization_id;
 custom_holidays:=coalesce(custom_holidays,'[]'::jsonb);
 SELECT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=ANY(v_stores) AND s.organization_id=p_organization_id AND s.status='active'
  AND s.ownership_type IS DISTINCT FROM 'office'
  AND CASE WHEN coalesce(cardinality(sc.available_stores),0)>0 THEN s.id::text=ANY(sc.available_stores) ELSE NOT coalesce(s.is_temporary,false) END) INTO has_store;
 FOR d IN SELECT generate_series(p_from,p_to,interval '1 day')::date LOOP
  day_reason:=NULL;
  BEGIN
   PERFORM public.assert_private_booking_candidate_date(p_organization_id,p_scenario_id,d);
  EXCEPTION WHEN SQLSTATE 'P0045' THEN day_reason:='past_deadline';
   WHEN SQLSTATE 'P0044' THEN day_reason:='not_recruiting';
   WHEN SQLSTATE 'P0054' THEN day_reason:='outside_period';
   WHEN SQLSTATE 'P0058' THEN day_reason:='too_far';
  END;
  -- 以下は保存（private_booking_assert_candidate）と同じ判定。土日祝の扱い（特別営業日を含む）は店舗ごとに store_fit が決める。
  holiday:=extract(dow FROM d) IN (0,6) OR public.is_booking_calendar_holiday(d) OR coalesce(custom_holidays ? d::text,false);
  FOREACH slot IN ARRAY ARRAY['morning','afternoon','evening'] LOOP
   date:=d; time_slot:=slot; available:=false; reason:=NULL; start_time:=NULL; end_time:=NULL; detail:=NULL; adjusted:=false;
   IF day_reason IS NOT NULL THEN reason:=day_reason; IF day_reason='too_far' THEN detail:='申し込めるのは今日から '||public.get_effective_private_booking_horizon_days(p_organization_id,p_scenario_id,NULL)||' 日先までです'; END IF;
   ELSIF NOT has_store THEN reason:='no_store_for_scenario';
   ELSE
    -- 標準開始で入る店舗があればその時刻（複数なら早いほう）、無ければ最も早く始められる店舗の時刻。終了はその店舗の所要時間で決める
    SELECT (array_agg(c.start_min ORDER BY (c.start_min=c.standard_min) DESC, c.start_min, c.store_id) FILTER (WHERE c.fits))[1],
     (array_agg(c.standard_min ORDER BY (c.start_min=c.standard_min) DESC, c.start_min, c.store_id) FILTER (WHERE c.fits))[1],
     (array_agg(c.minutes ORDER BY (c.start_min=c.standard_min) DESC, c.start_min, c.store_id) FILTER (WHERE c.fits))[1],
     -- 理由は店舗ごとの理由のうち conflict → blocked → closed → slot_not_allowed の順に採る
     -- （作品の貸切時間枠は特別営業日の店舗だけ土日祝の設定になるため、店舗ごとの理由として扱う）
     CASE WHEN bool_or(c.why='conflict') THEN 'conflict' WHEN bool_or(c.why='blocked') THEN 'blocked'
      WHEN bool_or(c.why='closed') THEN 'closed' WHEN bool_or(c.why='slot_not_allowed') THEN 'slot_not_allowed' ELSE 'closed' END,
     max(c.gap_minutes) FILTER (WHERE c.why='conflict'),
     min(c.minutes) FILTER (WHERE c.why='conflict'),
     -- 作品の開始時刻が決まっていて公演と重なった店舗の開始時刻（2026-10-15 社長決定）
     min(c.standard_min) FILTER (WHERE c.why='conflict' AND c.fixed)
     INTO best_start, best_std, best_minutes, why, max_gap, gap_need, fixed_start
    FROM public.private_booking_slot_store_fit(p_organization_id,p_scenario_id,scj,v_stores,d,holiday,slot,NULL) c;
    IF best_start IS NOT NULL THEN
     available:=true; adjusted:=best_start<>best_std;
     start_time:=to_char(make_time(best_start/60,best_start%60,0),'HH24:MI');
     end_time:=to_char(make_time((best_start+best_minutes)/60,(best_start+best_minutes)%60,0),'HH24:MI');
    ELSE
     reason:=why;
     IF reason='conflict' AND fixed_start IS NOT NULL THEN
      reason:='start_fixed';
      detail:='この作品の開始時刻 '||to_char(make_time(fixed_start/60,fixed_start%60,0),'HH24:MI')||' では前後の公演と重なります';
     ELSIF reason='conflict' AND max_gap>0 AND max_gap<gap_need THEN
      detail:='空き '||public.private_booking_minutes_text(max_gap)||'・必要 '||public.private_booking_minutes_text(gap_need);
     END IF;
    END IF;
   END IF;
   RETURN NEXT;
  END LOOP;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_candidate_slot_availability(uuid,uuid,uuid[],date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_booking_candidate_slot_availability(uuid,uuid,uuid[],date,date) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.private_group_candidate_slot_availability(
 p_group_id uuid, p_from date, p_to date, p_member_id uuid DEFAULT NULL, p_guest_token text DEFAULT NULL
) RETURNS TABLE(date date, time_slot text, available boolean, reason text, start_time text, end_time text, detail text, adjusted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE;
BEGIN
 -- 参加者（会員・ゲスト）・主催者・店舗スタッフだけ
 PERFORM public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 RETURN QUERY
 SELECT a.date,a.time_slot,
  a.available AND NOT added.hit,
  CASE WHEN added.hit THEN 'already_added' ELSE a.reason END,
  a.start_time,a.end_time,
  CASE WHEN added.hit THEN NULL ELSE a.detail END,
  a.adjusted AND NOT added.hit
 FROM public.private_booking_candidate_slot_availability(g.organization_id,coalesce(g.scenario_master_id,g.scenario_id),coalesce(g.preferred_store_ids,'{}'::uuid[]),p_from,p_to) a
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=a.date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE a.time_slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) AS hit) added;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_candidate_slot_availability(uuid,date,date,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_candidate_slot_availability(uuid,date,date,uuid,text) TO anon,authenticated,service_role;
