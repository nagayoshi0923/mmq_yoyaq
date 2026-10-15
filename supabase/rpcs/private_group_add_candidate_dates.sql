-- QW-20260917-001: 候補日時・通知・通信再試行記録を一括保存。
-- 変数 v_start_at / v_end_at は schedule_events の start_at / end_at 列と衝突させない。
-- 候補 1 件ごとの検査は private_booking_assert_candidate（グループ作成 create_private_group_atomic と共通）。
-- その中の店舗ごとの空き判定は private_booking_slot_store_fit（private_booking_candidate_slot_availability.sql）と共有する。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
CREATE OR REPLACE FUNCTION public.private_group_add_candidate_dates(p_group_id uuid, p_request_id uuid, p_expected_scenario_id uuid, p_expected_store_ids uuid[], p_candidates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 g public.private_groups%ROWTYPE; receipt public.private_group_candidate_add_requests%ROWTYPE;
 current_stores uuid[]; expected_stores uuid[]; payload jsonb; item jsonb; ids uuid[]:='{}'; candidate_id uuid;
 candidate_date date; slot text; slot_label text; next_order integer; res_status text;
 author_member uuid; notice_dates jsonb:='[]';
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
  IF EXISTS(SELECT 1 FROM public.private_group_candidate_dates cd WHERE cd.group_id=g.id AND cd.date=candidate_date
   AND cd.status IS DISTINCT FROM 'rejected' AND cd.time_slot=ANY(CASE slot WHEN 'morning' THEN ARRAY['morning','午前','朝'] WHEN 'afternoon' THEN ARRAY['afternoon','午後','昼'] ELSE ARRAY['evening','夜','夜間'] END)) THEN
   RAISE EXCEPTION '同じ日付・時間帯の候補は既に追加されています' USING ERRCODE='23505';
  END IF;
  -- 締切・募集期間・作品の時間帯・店舗ごとの空き・所要時間を、画面の空き表示と同じ判定で確かめる（グループ作成時と共通）
  PERFORM public.private_booking_assert_candidate(g.organization_id,p_expected_scenario_id,current_stores,candidate_date,slot,item->>'start_time',item->>'end_time');
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
