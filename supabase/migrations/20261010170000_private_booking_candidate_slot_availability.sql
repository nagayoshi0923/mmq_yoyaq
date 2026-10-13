-- 候補日カレンダーの空き判定を DB と一本化する（画面の表示と保存で同じ判定を使う）
-- 正本: supabase/rpcs/private_booking_candidate_slot_availability.sql / supabase/rpcs/private_group_add_candidate_dates.sql
-- 保存 RPC の判定は変えない（店舗ごとの判定を内部関数に切り出しただけ）。弾いたときの文面に理由を添える。

-- 貸切の候補日時（日付 × 朝・昼・夜）が選べるかの判定。画面の表示と保存（private_group_add_candidate_dates）で同じ判定を使う。
-- 1) private_booking_slot_store_checks: 店舗ごとの判定（営業枠・受付停止・他公演との重なり）。保存 RPC と同じ SQL。内部用。
-- 2) private_booking_candidate_slot_availability: 作品ページ（グループ作成前）用。組織・作品・希望店舗・期間で返す。
-- 3) private_group_candidate_slot_availability: グループ用。参加者（会員・ゲスト）とスタッフだけ呼べる。2) を内部で使う。
-- reason: no_store_for_scenario（この作品を上演できる希望店舗がない）/ conflict（他の公演と重なる）/ blocked（受付停止）/
--         closed（営業時間外）/ slot_not_allowed（この作品で選べない時間帯）/ past_deadline（受付締切後）/
--         not_recruiting（募集期間外）/ outside_period（公演期間外）/ already_added（追加済み、グループ用のみ）

CREATE OR REPLACE FUNCTION public.private_booking_slot_store_checks(
 p_org uuid, p_scenario_id uuid, p_title text, p_available_stores text[], p_slot_start_times jsonb,
 p_store_ids uuid[], p_date date, p_holiday boolean, p_minutes integer, p_slot text, p_start_min integer
) RETURNS TABLE(store_id uuid, start_min integer, hours_ok boolean, blocked boolean, paused boolean, conflict boolean)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
 -- p_start_min を渡すとその開始時刻で判定する（保存時）。NULL なら店舗ごとに「枠の最早開始」と
 -- 「前の公演の終了＋準備時間」を開始候補として判定する（表示時）。
 -- 1つの店舗で営業枠と準備時間を含む空きの両方が成立すること。他店の条件を混ぜない。
 SELECT s.id, cand.start_min,
  (p_holiday OR p_slot='evening'
    OR (p_slot='morning' AND weekday.evening_deadline-p_minutes<weekday.afternoon_start)
    OR (p_slot='afternoon' AND weekday.evening_deadline-p_minutes>=weekday.afternoon_start AND cand.start_min+p_minutes<=weekday.evening_deadline))
   AND cand.start_min>=lb.lower_bound
   AND cand.start_min<band.end_minutes
   AND cand.start_min+p_minutes<=band.closing_minutes,
  EXISTS(SELECT 1 FROM public.schedule_blocked_slots b WHERE b.organization_id=p_org AND b.store_id=s.id::text AND b.date=p_date AND b.time_slot=p_slot),
  EXISTS(SELECT 1 FROM public.store_recruitment_pauses pz WHERE pz.organization_id=p_org AND pz.store_id=s.id AND pz.pause_type='private'
   AND p_date BETWEEN coalesce(pz.starts_on,p_date) AND coalesce(pz.ends_on,p_date)),
  EXISTS(SELECT 1 FROM public.schedule_events e WHERE e.organization_id=p_org AND e.store_id=s.id AND e.is_cancelled=false
   AND e.date BETWEEN p_date-2 AND p_date+2
   AND e.date+e.start_time<p_date+make_interval(mins=>cand.start_min+p_minutes)+make_interval(mins=>public.resolve_preparation_minutes(p_org,NULL,NULL,e.id))
   AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END>p_date+make_interval(mins=>cand.start_min)-make_interval(mins=>lb.prep))
 FROM public.stores s
 LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=p_org
 -- 作品ごとの開始時刻を店舗の開始時刻へ上書きする（画面と同じ。店舗の特別営業日は土日祝の値、#698）
 CROSS JOIN LATERAL (SELECT public.apply_scenario_slot_start_times(to_jsonb(h),p_slot_start_times,
   p_holiday OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(to_jsonb(h)->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text)) AS hours) eff
 CROSS JOIN LATERAL public.private_booking_store_day_slots(p_date,eff.hours,p_holiday,cardinality(p_store_ids)=1) band
 CROSS JOIN LATERAL (
  SELECT coalesce(max(x.start_minutes) FILTER (WHERE x.slot_key='evening'),1140)
    - public.resolve_preparation_minutes(p_org,s.id,p_scenario_id,NULL) AS evening_deadline,
   coalesce(max(x.start_minutes) FILTER (WHERE x.slot_key='afternoon'),780) AS afternoon_start
  FROM public.private_booking_store_day_slots(p_date,eff.hours,p_holiday,cardinality(p_store_ids)=1) x
 ) weekday
 CROSS JOIN LATERAL (
  SELECT public.resolve_preparation_minutes(p_org,s.id,p_scenario_id,NULL) AS prep,
   CASE WHEN p_slot='evening' AND greatest(band.start_minutes,CASE WHEN p_holiday AND (p_title LIKE '%戦塵のレガストリア%' OR p_title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END)+p_minutes>1380 THEN 1380-p_minutes
    ELSE greatest(band.start_minutes,CASE WHEN p_slot='evening' AND p_holiday AND (p_title LIKE '%戦塵のレガストリア%' OR p_title LIKE '%BeatSpecter%') THEN 1170 ELSE 0 END) END AS lower_bound
 ) lb
 CROSS JOIN LATERAL (
  SELECT p_start_min AS start_min WHERE p_start_min IS NOT NULL
  UNION SELECT lb.lower_bound WHERE p_start_min IS NULL
  UNION SELECT ceil(extract(epoch FROM e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END
     +make_interval(mins=>lb.prep)-p_date::timestamp)/60)::integer
   FROM public.schedule_events e WHERE p_start_min IS NULL AND e.organization_id=p_org AND e.store_id=s.id AND e.is_cancelled=false
    AND e.date BETWEEN p_date-2 AND p_date
 ) cand
 WHERE s.id=ANY(p_store_ids) AND s.organization_id=p_org AND s.status='active'
  AND s.ownership_type IS DISTINCT FROM 'office'
  AND CASE WHEN coalesce(cardinality(p_available_stores),0)>0 THEN s.id::text=ANY(p_available_stores) ELSE NOT coalesce(s.is_temporary,false) END
  AND band.slot_key=p_slot
  AND cand.start_min>=lb.lower_bound AND cand.start_min<1440
$function$;
REVOKE ALL ON FUNCTION public.private_booking_slot_store_checks(uuid,uuid,text,text[],jsonb,uuid[],date,boolean,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_booking_slot_store_checks(uuid,uuid,text,text[],jsonb,uuid[],date,boolean,integer,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.private_booking_candidate_slot_availability(
 p_organization_id uuid, p_scenario_id uuid, p_store_ids uuid[], p_from date, p_to date
) RETURNS TABLE(date date, time_slot text, available boolean, reason text, start_time text, end_time text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 sc record; v_stores uuid[]; custom_holidays jsonb; d date; slot text; holiday boolean; minutes integer;
 day_reason text; has_store boolean; best integer; any_open boolean; any_unblocked boolean; allowed text[];
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
  END;
  -- 以下は private_group_add_candidate_dates と同じ判定
  holiday:=extract(dow FROM d) IN (0,6) OR public.is_booking_calendar_holiday(d) OR coalesce(custom_holidays ? d::text,false);
  minutes:=CASE WHEN holiday AND coalesce(sc.weekend_duration,0)>0 THEN sc.weekend_duration ELSE sc.duration END;
  allowed:=CASE WHEN holiday THEN sc.private_booking_time_slots_weekend ELSE sc.private_booking_time_slots END;
  FOREACH slot IN ARRAY ARRAY['morning','afternoon','evening'] LOOP
   date:=d; time_slot:=slot; available:=false; reason:=NULL; start_time:=NULL; end_time:=NULL;
   IF day_reason IS NOT NULL THEN reason:=day_reason;
   ELSIF NOT has_store THEN reason:='no_store_for_scenario';
   ELSIF coalesce(cardinality(allowed),0)>0 AND NOT EXISTS(SELECT 1 FROM unnest(allowed) value WHERE value=ANY(CASE slot
     WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)) THEN
    reason:='slot_not_allowed';
   ELSE
    -- 保存時の「終了が当日 23:00 まで」に合わせる
    SELECT min(c.start_min) FILTER (WHERE c.hours_ok AND NOT c.blocked AND NOT c.paused AND NOT c.conflict),
     bool_or(c.hours_ok), bool_or(c.hours_ok AND NOT c.blocked AND NOT c.paused)
     INTO best, any_open, any_unblocked
    FROM public.private_booking_slot_store_checks(p_organization_id,p_scenario_id,sc.title,sc.available_stores,sc.private_booking_slot_start_times,
     v_stores,d,holiday,minutes,slot,NULL) c
    WHERE c.start_min+minutes<=1380;
    IF best IS NOT NULL THEN
     available:=true; start_time:=to_char(make_time(best/60,best%60,0),'HH24:MI'); end_time:=to_char(make_time((best+minutes)/60,(best+minutes)%60,0),'HH24:MI');
    ELSE
     reason:=CASE WHEN coalesce(any_unblocked,false) THEN 'conflict' WHEN coalesce(any_open,false) THEN 'blocked' ELSE 'closed' END;
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
) RETURNS TABLE(date date, time_slot text, available boolean, reason text, start_time text, end_time text)
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
  a.start_time,a.end_time
 FROM public.private_booking_candidate_slot_availability(g.organization_id,coalesce(g.scenario_master_id,g.scenario_id),coalesce(g.preferred_store_ids,'{}'::uuid[]),p_from,p_to) a
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=a.date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE a.time_slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) AS hit) added;
END $function$;
REVOKE ALL ON FUNCTION public.private_group_candidate_slot_availability(uuid,date,date,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_candidate_slot_availability(uuid,date,date,uuid,text) TO anon,authenticated,service_role;

-- QW-20260917-001: 候補日時・通知・通信再試行記録を一括保存。
-- 変数 v_start_at / v_end_at は schedule_events の start_at / end_at 列と衝突させない。
-- 店舗ごとの空き判定は private_booking_slot_store_checks（private_booking_candidate_slot_availability.sql）と共有する。
CREATE OR REPLACE FUNCTION public.private_group_add_candidate_dates(p_group_id uuid, p_request_id uuid, p_expected_scenario_id uuid, p_expected_store_ids uuid[], p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 g public.private_groups%ROWTYPE; sc record; receipt public.private_group_candidate_add_requests%ROWTYPE;
 current_stores uuid[]; expected_stores uuid[]; payload jsonb; item jsonb; ids uuid[]:='{}'; candidate_id uuid;
 candidate_date date; v_start_at timestamp; v_end_at timestamp; slot text; slot_label text;
 minutes integer; start_min integer; end_min integer; next_order integer; res_status text;
 holiday boolean; custom_holidays jsonb; valid_store boolean; any_unblocked boolean; any_open boolean; has_store boolean; author_member uuid; notice_dates jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
 -- 他の予約処理が予約→グループ順にロックする場合は待ち合わせず再読込を促す。
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR public.private_group_actor_role(p_group_id) IS NULL THEN
  RAISE EXCEPTION '候補日を追加する権限がありません' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_expected_scenario_id IS NULL OR p_expected_store_ids IS NULL
  OR array_position(p_expected_store_ids,NULL) IS NOT NULL
  OR jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION '候補日の入力を確認してください' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '候補日は1〜100件選択してください' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO expected_stores FROM unnest(p_expected_store_ids) id;
 payload:=jsonb_build_object('scenario_id',p_expected_scenario_id,'store_ids',expected_stores,'candidates',p_candidates);
 SELECT * INTO receipt FROM public.private_group_candidate_add_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.group_id IS DISTINCT FROM g.id OR receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION '同じ送信番号で異なる候補日を保存できません' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('success',true,'candidate_ids',receipt.candidate_ids,'replayed',true);
 END IF;
 IF g.status NOT IN ('gathering','date_adjusting') OR g.status IS NULL THEN
  RAISE EXCEPTION '店舗の返答待ち、確定後、取消後は候補日を追加できません' USING ERRCODE='22023';
 END IF;
 IF g.reservation_id IS NOT NULL THEN
  SELECT status INTO res_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE NOWAIT;
  IF res_status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION '予約申請中は候補日を追加できません' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO current_stores FROM unnest(g.preferred_store_ids) id;
 IF coalesce(g.scenario_master_id,g.scenario_id) IS DISTINCT FROM p_expected_scenario_id OR current_stores IS DISTINCT FROM expected_stores THEN
  RAISE EXCEPTION '作品または希望店舗が変更されています。画面を更新して選び直してください' USING ERRCODE='40001';
 END IF;
 IF cardinality(current_stores)=0 THEN RAISE EXCEPTION '希望店舗を選択してください' USING ERRCODE='22023'; END IF;
 SELECT s.* INTO sc FROM public.organization_scenarios_with_master s WHERE s.organization_id=g.organization_id
  AND (s.scenario_master_id=p_expected_scenario_id OR s.id=p_expected_scenario_id)
  ORDER BY (s.id=p_expected_scenario_id) DESC LIMIT 1;
 IF NOT FOUND OR coalesce(sc.duration,0)<=0 THEN RAISE EXCEPTION '作品の所要時間を確認できません' USING ERRCODE='22023'; END IF;
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO custom_holidays FROM public.organization_settings os WHERE os.organization_id=g.organization_id;
 SELECT coalesce(max(order_num),0)+1 INTO next_order FROM public.private_group_candidate_dates WHERE group_id=g.id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
   OR coalesce(item->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR coalesce(item->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR coalesce(item->>'time_slot','') NOT IN ('morning','afternoon','evening') THEN
   RAISE EXCEPTION '候補日時の形式が正しくありません' USING ERRCODE='22023';
  END IF;
  candidate_date:=(item->>'date')::date; slot:=item->>'time_slot';
  slot_label:=CASE slot WHEN 'morning' THEN '午前' WHEN 'afternoon' THEN '午後' ELSE '夜' END;
  PERFORM public.assert_private_booking_candidate_date(g.organization_id,p_expected_scenario_id,candidate_date);
  holiday:=extract(dow FROM candidate_date) IN (0,6) OR public.is_booking_calendar_holiday(candidate_date) OR coalesce(custom_holidays ? candidate_date::text,false);
  minutes:=CASE WHEN holiday AND coalesce(sc.weekend_duration,0)>0 THEN sc.weekend_duration ELSE sc.duration END;
  v_start_at:=candidate_date+(item->>'start_time')::time; v_end_at:=v_start_at+make_interval(mins=>minutes);
  IF v_end_at::date<>candidate_date OR v_end_at::time>'23:00'::time OR v_end_at::time<>(item->>'end_time')::time THEN
   RAISE EXCEPTION '公演時間が更新されているか、営業時間内に収まりません。候補日を選び直してください' USING ERRCODE='40001';
  END IF;
  IF coalesce(cardinality(CASE WHEN holiday THEN sc.private_booking_time_slots_weekend ELSE sc.private_booking_time_slots END),0)>0 AND NOT EXISTS(
   SELECT 1 FROM unnest(CASE WHEN holiday THEN sc.private_booking_time_slots_weekend ELSE sc.private_booking_time_slots END) value WHERE value=ANY(CASE slot
    WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
  ) THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=candidate_date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) THEN
   RAISE EXCEPTION '同じ日付・時間帯の候補は既に追加されています' USING ERRCODE='23505';
  END IF;
  start_min:=extract(hour FROM v_start_at)::integer*60+extract(minute FROM v_start_at)::integer;
  end_min:=start_min+minutes;
  -- 1つの店舗で営業枠と準備時間を含む空きの両方が成立すること。他店の条件を混ぜない。
  -- 判定は画面の空き表示（private_booking_candidate_slot_availability）と同じ関数を使う。
  SELECT coalesce(bool_or(c.hours_ok AND NOT c.blocked AND NOT c.conflict),false),
   coalesce(bool_or(c.hours_ok AND NOT c.blocked),false), coalesce(bool_or(c.hours_ok),false)
   INTO valid_store, any_unblocked, any_open
  FROM public.private_booking_slot_store_checks(g.organization_id,p_expected_scenario_id,sc.title,sc.available_stores,sc.private_booking_slot_start_times,
   current_stores,candidate_date,holiday,minutes,slot,start_min) c;
  IF NOT valid_store THEN
   SELECT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=ANY(current_stores) AND s.organization_id=g.organization_id AND s.status='active'
    AND s.ownership_type IS DISTINCT FROM 'office'
    AND CASE WHEN coalesce(cardinality(sc.available_stores),0)>0 THEN s.id::text=ANY(sc.available_stores) ELSE NOT coalesce(s.is_temporary,false) END) INTO has_store;
   RAISE EXCEPTION '選択した候補日時は現在受付できません（%/% %: %）。空き状況を更新して選び直してください',
    extract(month FROM candidate_date),extract(day FROM candidate_date),slot_label,
    CASE WHEN NOT has_store THEN 'この作品を上演できる店舗が希望店舗にありません' WHEN any_unblocked THEN '他の公演と重なります'
     WHEN any_open THEN '受付停止中です' ELSE '営業時間外です' END
    USING ERRCODE='22023';
  END IF;
  INSERT INTO public.private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num)
   VALUES(g.id,candidate_date,CASE WHEN slot='evening' THEN '夜間' ELSE slot_label END,item->>'start_time',item->>'end_time',next_order) RETURNING id INTO candidate_id;
  ids:=array_append(ids,candidate_id); next_order:=next_order+1;
  notice_dates:=notice_dates||jsonb_build_array(jsonb_build_object('date',candidate_date,'time_slot',slot_label));
 END LOOP;
 SELECT id INTO author_member FROM public.private_group_members WHERE group_id=g.id AND user_id=auth.uid() AND status='joined' ORDER BY id LIMIT 1;
 INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(g.id,author_member,
  jsonb_build_object('type','system','action','candidate_dates_added','count',cardinality(ids),'dates',notice_dates)::text);
 INSERT INTO public.private_group_candidate_add_requests(request_id,group_id,actor_id,payload,candidate_ids)
  VALUES(p_request_id,g.id,auth.uid(),payload,ids);
 RETURN jsonb_build_object('success',true,'candidate_ids',ids,'replayed',false);
END $function$;

REVOKE ALL ON FUNCTION public.private_group_add_candidate_dates(uuid,uuid,uuid,uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_add_candidate_dates(uuid,uuid,uuid,uuid[],jsonb) TO authenticated,service_role;
