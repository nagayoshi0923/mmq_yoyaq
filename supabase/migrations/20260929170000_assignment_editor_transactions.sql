-- QW-20260917-001: 編集画面の複数書込を同じトランザクションにまとめる。
-- service_role専用。認可・プロフィール項目の許可は既存APIでも検査する。
CREATE FUNCTION public.apply_staff_assignment_edit(p_org uuid,p_staff uuid,p_edit jsonb,p_confirm boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_rows jsonb; incoming jsonb; old_flags jsonb; expected_flags jsonb; removed jsonb;
BEGIN
  IF jsonb_typeof(p_edit->'records') IS DISTINCT FROM 'array' OR jsonb_typeof(p_edit->'baseline') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid assignment edit' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM organization_scenarios WHERE organization_id=p_org ORDER BY scenario_master_id FOR KEY SHARE;
  PERFORM 1 FROM staff WHERE id=p_staff AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='23503'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') INTO current_rows FROM staff_scenario_assignments a WHERE organization_id=p_org AND staff_id=p_staff;
  SELECT coalesce(jsonb_agg(jsonb_build_array(r.scenario_master_id,coalesce(r.can_main_gm,false),coalesce(r.can_sub_gm,false),coalesce(r.is_experienced,false)) ORDER BY r.scenario_master_id),'[]') INTO old_flags
    FROM jsonb_to_recordset(current_rows) r(scenario_master_id uuid,can_main_gm boolean,can_sub_gm boolean,is_experienced boolean);
  SELECT coalesce(jsonb_agg(jsonb_build_array(r.scenario_master_id,r.can_main_gm,r.can_sub_gm,r.is_experienced) ORDER BY r.scenario_master_id),'[]') INTO expected_flags
    FROM jsonb_to_recordset(p_edit->'baseline') r(scenario_master_id uuid,can_main_gm boolean,can_sub_gm boolean,is_experienced boolean);
  IF old_flags IS DISTINCT FROM expected_flags THEN RAISE EXCEPTION 'Assignments changed' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_edit->'records') j WHERE
    jsonb_typeof(j->'can_main_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(j->'can_sub_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(j->'is_experienced') IS DISTINCT FROM 'boolean')
    OR (SELECT count(*) FROM jsonb_array_elements(p_edit->'records')) <> (SELECT count(DISTINCT j->>'scenarioId') FROM jsonb_array_elements(p_edit->'records') j) THEN
    RAISE EXCEPTION 'Invalid or duplicate assignment' USING ERRCODE='22023';
  END IF;
  -- 組織から外れた旧行は無変更なら保持。新規追加・変更は認めない。
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_edit->'records') j WHERE NOT EXISTS(
    SELECT 1 FROM organization_scenarios o WHERE o.organization_id=p_org AND o.scenario_master_id=(j->>'scenarioId')::uuid)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_rows) a WHERE a->>'scenario_master_id'=j->>'scenarioId'
      AND a->'can_main_gm'=j->'can_main_gm' AND a->'can_sub_gm'=j->'can_sub_gm' AND a->'is_experienced'=j->'is_experienced')) THEN
    RAISE EXCEPTION 'Scenario unavailable' USING ERRCODE='23503';
  END IF;
  SELECT coalesce(jsonb_agg(a->>'scenario_master_id'),'[]') INTO removed FROM jsonb_array_elements(current_rows) a
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_edit->'records') j WHERE j->>'scenarioId'=a->>'scenario_master_id');
  IF NOT coalesce(p_confirm,false) AND (jsonb_array_length(removed)>0 OR jsonb_array_length(p_edit->'records')=0) THEN
    RAISE EXCEPTION 'Assignment decrease requires confirmation' USING ERRCODE='P0101',DETAIL=jsonb_build_object(
      'error','ASSIGNMENT_DECREASE_REJECTED','existing_count',jsonb_array_length(current_rows),
      'incoming_count',jsonb_array_length(p_edit->'records'),'removed_scenario_ids',removed,
      'removed_scenario_names',(SELECT coalesce(jsonb_agg(coalesce(o.title,r.id) ORDER BY r.ord),'[]')
        FROM jsonb_array_elements_text(removed) WITH ORDINALITY r(id,ord)
        LEFT JOIN organization_scenarios_with_master o ON o.organization_id=p_org AND o.scenario_master_id=r.id::uuid))::text;
  END IF;
  SELECT coalesce(jsonb_agg(j),'[]') INTO incoming FROM jsonb_array_elements(p_edit->'records') j WHERE EXISTS(
    SELECT 1 FROM organization_scenarios o WHERE o.organization_id=p_org AND o.scenario_master_id=(j->>'scenarioId')::uuid);
  PERFORM replace_staff_assignments_atomic(p_org,p_staff,incoming,current_rows);
END $$;

CREATE FUNCTION public.save_staff_editor_atomic(p_org uuid,p_staff uuid,p_profile jsonb,p_edit jsonb,p_confirm boolean DEFAULT false,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid:=coalesce(p_staff,gen_random_uuid()); cols text; vals text; saved public.staff; previous_ids uuid[];
BEGIN
  IF p_org IS NULL OR jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN (
    'name','line_name','x_account','discord_user_id','discord_channel_id','role','stores','ng_days','want_to_learn',
    'notes','phone','email','user_id','availability','experience','status','avatar_url','avatar_color')) THEN
    RAISE EXCEPTION 'Invalid staff fields' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM organization_scenarios WHERE organization_id=p_org ORDER BY scenario_master_id FOR KEY SHARE;
  SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k) INTO cols,vals FROM jsonb_object_keys(p_profile) k;
  IF cols IS NULL THEN RAISE EXCEPTION 'Empty staff fields' USING ERRCODE='22023'; END IF;
  IF p_staff IS NULL THEN
    EXECUTE format('INSERT INTO public.staff(id,organization_id,%s) SELECT $1,$2,%s FROM jsonb_populate_record(NULL::public.staff,$3) r RETURNING *',cols,vals)
      INTO saved USING target,p_org,p_profile;
  ELSE
    PERFORM 1 FROM staff WHERE id=target AND organization_id=p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='23503'; END IF;
  END IF;
  SELECT coalesce(array_agg(scenario_master_id),'{}') INTO previous_ids FROM staff_scenario_assignments WHERE organization_id=p_org AND staff_id=target;
  PERFORM apply_staff_assignment_edit(p_org,target,p_edit,p_confirm);
  INSERT INTO staff_scenario_assignment_history(organization_id,staff_id,scenario_master_id,action,changed_by,source)
    SELECT p_org,target,a.scenario_master_id,'added',p_actor,'api' FROM staff_scenario_assignments a
      WHERE a.organization_id=p_org AND a.staff_id=target AND NOT(a.scenario_master_id=ANY(previous_ids))
    UNION ALL
    SELECT p_org,target,old.id,'removed',p_actor,'api' FROM unnest(previous_ids) old(id)
      WHERE NOT EXISTS(SELECT 1 FROM staff_scenario_assignments a WHERE a.organization_id=p_org AND a.staff_id=target AND a.scenario_master_id=old.id)
      AND EXISTS(SELECT 1 FROM scenario_masters m WHERE m.id=old.id);
  IF p_staff IS NOT NULL THEN
    EXECUTE format('UPDATE public.staff s SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.staff,$3) r) WHERE s.id=$1 AND s.organization_id=$2 RETURNING s.*',cols,vals)
      INTO saved USING target,p_org,p_profile;
  ELSE SELECT * INTO saved FROM staff WHERE id=target AND organization_id=p_org; END IF;
  RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION public.save_scenario_gm_changes_atomic(p_org uuid,p_scenario uuid,p_changes jsonb,p_expected jsonb,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; affected uuid[]; result jsonb; previous_ids uuid[];
BEGIN
  IF p_org IS NULL OR p_scenario IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_changes->'removed') IS DISTINCT FROM 'array' OR jsonb_typeof(p_changes->'upserts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid GM changes' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM organization_scenarios WHERE organization_id=p_org AND scenario_master_id=p_scenario FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scenario unavailable' USING ERRCODE='23503'; END IF;
  SELECT array_agg(id) INTO affected FROM (
    SELECT value::uuid id FROM jsonb_array_elements_text(p_changes->'removed')
    UNION SELECT (value->>'staff_id')::uuid FROM jsonb_array_elements(p_changes->'upserts')
  ) s;
  IF EXISTS(SELECT 1 FROM unnest(affected) requested(id) WHERE requested.id IS NULL OR NOT EXISTS(SELECT 1 FROM staff WHERE staff.id=requested.id AND organization_id=p_org)) THEN
    RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='23503';
  END IF;
  PERFORM 1 FROM staff WHERE organization_id=p_org AND id=ANY(affected) ORDER BY id FOR UPDATE;
  IF assignment_state(p_org,NULL,p_scenario) IS DISTINCT FROM normalize_assignment_state(p_expected) THEN
    RAISE EXCEPTION 'Assignments changed' USING ERRCODE='40001';
  END IF;
  SELECT coalesce(array_agg(staff_id),'{}') INTO previous_ids FROM staff_scenario_assignments WHERE organization_id=p_org AND scenario_master_id=p_scenario;
  UPDATE staff_scenario_assignments SET can_main_gm=false,can_sub_gm=false,is_experienced=true
    WHERE organization_id=p_org AND scenario_master_id=p_scenario AND staff_id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_changes->'removed'));
  FOR item IN SELECT value FROM jsonb_array_elements(p_changes->'upserts') LOOP
    IF jsonb_typeof(item->'can_main_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'can_sub_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'is_experienced') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid GM flags' USING ERRCODE='22023';
    END IF;
    INSERT INTO staff_scenario_assignments AS a(organization_id,staff_id,scenario_master_id,can_main_gm,can_sub_gm,is_experienced,notes)
      VALUES(p_org,(item->>'staff_id')::uuid,p_scenario,(item->>'can_main_gm')::boolean,(item->>'can_sub_gm')::boolean,(item->>'is_experienced')::boolean,item->>'notes')
      ON CONFLICT(staff_id,scenario_master_id) DO UPDATE SET can_main_gm=excluded.can_main_gm,can_sub_gm=excluded.can_sub_gm,is_experienced=excluded.is_experienced;
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') INTO result FROM staff_scenario_assignments a WHERE organization_id=p_org AND scenario_master_id=p_scenario;
  INSERT INTO staff_scenario_assignment_history(organization_id,staff_id,scenario_master_id,action,changed_by,source)
    SELECT p_org,a.staff_id,p_scenario,'added',p_actor,'api' FROM staff_scenario_assignments a
      WHERE a.organization_id=p_org AND a.scenario_master_id=p_scenario AND NOT(a.staff_id=ANY(previous_ids));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_staff_assignment_edit(uuid,uuid,jsonb,boolean),public.save_staff_editor_atomic(uuid,uuid,jsonb,jsonb,boolean,uuid),public.save_scenario_gm_changes_atomic(uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_staff_editor_atomic(uuid,uuid,jsonb,jsonb,boolean,uuid),public.save_scenario_gm_changes_atomic(uuid,uuid,jsonb,jsonb,uuid) TO service_role;
