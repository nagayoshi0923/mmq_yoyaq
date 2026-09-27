-- 希望店舗と利用できない候補日の整理を一括保存する。既存データの一括変更はしない。
CREATE OR REPLACE FUNCTION public.private_group_set_preferred_stores(p_group_id uuid,p_store_ids uuid[],p_expected_store_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE; allowed text[]; selected uuid[]; cd record; store uuid;
 slot text; start_at timestamp; end_at timestamp; available boolean; removed integer:=0; res_status text;
BEGIN
 IF public.private_group_actor_role(p_group_id) IS NULL THEN RAISE EXCEPTION '希望店舗を変更する権限がありません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF g.status NOT IN ('gathering','date_adjusting') THEN RAISE EXCEPTION '店舗の返答待ち、確定後、取消後は希望店舗を変更できません' USING ERRCODE='22023'; END IF;
 IF g.reservation_id IS NOT NULL THEN
  SELECT status INTO res_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE;
  IF res_status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION '予約申請中は希望店舗を変更できません' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_expected_store_ids IS NULL OR coalesce(g.preferred_store_ids,'{}'::uuid[]) IS DISTINCT FROM p_expected_store_ids THEN
  RAISE EXCEPTION '希望店舗が変更されています。画面を更新して選び直してください' USING ERRCODE='40001';
 END IF;
 IF coalesce(cardinality(p_store_ids),0)=0 OR array_position(p_store_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION '店舗を1つ以上選択してください' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT s ORDER BY s) INTO selected FROM unnest(p_store_ids) s;
 SELECT s.available_stores INTO allowed FROM public.organization_scenarios s WHERE s.organization_id=g.organization_id
  AND (s.scenario_master_id=g.scenario_master_id OR s.id=g.scenario_master_id)
  ORDER BY (s.id=g.scenario_master_id) DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '組織内の作品設定を確認できません' USING ERRCODE='22023'; END IF;
 FOREACH store IN ARRAY selected LOOP
  PERFORM 1 FROM public.stores s WHERE s.id=store AND s.organization_id=g.organization_id AND s.status='active'
   AND s.ownership_type IS DISTINCT FROM 'office'
   AND (CASE WHEN coalesce(cardinality(allowed),0)>0 THEN store::text=ANY(allowed) ELSE NOT coalesce(s.is_temporary,false) END) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION '選択できない店舗が含まれています。店舗一覧を再読み込みしてください' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR cd IN SELECT * FROM public.private_group_candidate_dates WHERE group_id=g.id AND status IS DISTINCT FROM 'rejected' ORDER BY id FOR UPDATE LOOP
  slot:=CASE cd.time_slot WHEN 'morning' THEN 'morning' WHEN '朝' THEN 'morning' WHEN '午前' THEN 'morning' WHEN 'afternoon' THEN 'afternoon' WHEN '昼' THEN 'afternoon' WHEN '午後' THEN 'afternoon' WHEN 'evening' THEN 'evening' WHEN '夜' THEN 'evening' WHEN '夜間' THEN 'evening' END;
  IF slot IS NULL OR cd.start_time IS NULL OR cd.end_time IS NULL THEN RAISE EXCEPTION '候補日時を確認できません' USING ERRCODE='22023'; END IF;
  start_at:=cd.date+cd.start_time::time;
  end_at:=cd.date+cd.end_time::time+CASE WHEN cd.end_time::time<cd.start_time::time THEN interval '1 day' ELSE interval '0 days' END;
  IF start_at=end_at THEN RAISE EXCEPTION '候補日時を確認できません' USING ERRCODE='22023'; END IF;
  -- 全店舗を1つのSELECTの同じスナップショットで確認する。
  -- 店舗間の公演移動の前後を混ぜて「全店満席」と誤認しない。
  SELECT EXISTS(
   SELECT 1 FROM unnest(selected) AS choice(store_id)
   WHERE NOT EXISTS(SELECT 1 FROM public.schedule_blocked_slots b WHERE b.organization_id=g.organization_id AND b.store_id=choice.store_id::text AND b.date=cd.date AND b.time_slot=slot)
   AND NOT EXISTS(SELECT 1 FROM public.schedule_events e WHERE e.organization_id=g.organization_id AND e.store_id=choice.store_id AND e.is_cancelled=false
    AND e.date BETWEEN cd.date-2 AND cd.date+2
    AND e.date+e.start_time < end_at+make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,NULL,NULL,e.id))
    AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END > start_at-make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,choice.store_id,g.scenario_master_id,NULL)))
  ) INTO available;
  IF NOT available THEN
   DELETE FROM public.private_group_candidate_dates WHERE id=cd.id AND group_id=g.id;
   removed:=removed+1;
  END IF;
 END LOOP;
 UPDATE public.private_groups SET preferred_store_ids=selected,updated_at=now() WHERE id=g.id;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.private_group_set_preferred_stores(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_set_preferred_stores(uuid,uuid[],uuid[]) TO authenticated,service_role;
