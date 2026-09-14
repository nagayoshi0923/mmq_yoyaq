-- QW-20260914-004: 担当更新・シナリオ削除の途中失敗と古い画面からの上書きを防ぐ。
-- 既存の担当データは変更しない。新RPCはサーバーのservice_roleだけが実行する。
CREATE OR REPLACE FUNCTION public.normalize_assignment_state(p_rows jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.staff_id,r.scenario_master_id),'[]'::jsonb)
  FROM jsonb_to_recordset(p_rows) AS r(staff_id uuid,scenario_master_id uuid,
    can_main_gm boolean,can_sub_gm boolean,is_experienced boolean,notes text,assigned_at timestamptz);
$$;

CREATE OR REPLACE FUNCTION public.assignment_state(p_org uuid,p_staff uuid,p_scenario uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT public.normalize_assignment_state(coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb))
  FROM public.staff_scenario_assignments a WHERE a.organization_id=p_org
    AND (p_staff IS NULL OR a.staff_id=p_staff)
    AND (p_scenario IS NULL OR a.scenario_master_id=p_scenario);
$$;

CREATE OR REPLACE FUNCTION public.replace_staff_assignments_atomic(
  p_organization_id uuid,p_staff_id uuid,p_assignments jsonb,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_staff_id IS NULL OR jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid assignment request' USING ERRCODE='22023';
  END IF;
  -- 削除との競合を検知するため、組織の作品を安定した順序で保持する。
  PERFORM 1 FROM public.organization_scenarios WHERE organization_id=p_organization_id ORDER BY scenario_master_id FOR KEY SHARE;
  PERFORM 1 FROM public.staff WHERE id=p_staff_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='23503'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_assignments)) <>
     (SELECT count(DISTINCT value->>'scenarioId') FROM jsonb_array_elements(p_assignments)) THEN
    RAISE EXCEPTION 'Duplicate or missing scenario' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
    IF jsonb_typeof(item->'can_main_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'can_sub_gm') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'is_experienced') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid assignment flags' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=(item->>'scenarioId')::uuid) THEN
      RAISE EXCEPTION 'Scenario unavailable' USING ERRCODE='23503';
    END IF;
  END LOOP;
  IF public.assignment_state(p_organization_id,p_staff_id,NULL) IS DISTINCT FROM public.normalize_assignment_state(p_expected) THEN
    RAISE EXCEPTION 'Assignments changed' USING ERRCODE='40001';
  END IF;

  INSERT INTO public.staff_scenario_assignments AS target
    (organization_id,staff_id,scenario_master_id,can_main_gm,can_sub_gm,is_experienced,notes,assigned_at)
  SELECT p_organization_id,p_staff_id,(j.value->>'scenarioId')::uuid,
    (j.value->>'can_main_gm')::boolean,(j.value->>'can_sub_gm')::boolean,(j.value->>'is_experienced')::boolean,
    CASE WHEN j.value ? 'notes' THEN j.value->>'notes' ELSE old.notes END,coalesce(old.assigned_at,now())
  FROM jsonb_array_elements(p_assignments) j
  LEFT JOIN public.staff_scenario_assignments old ON old.organization_id=p_organization_id AND old.staff_id=p_staff_id AND old.scenario_master_id=(j.value->>'scenarioId')::uuid
  ON CONFLICT (staff_id,scenario_master_id) DO UPDATE SET
    can_main_gm=EXCLUDED.can_main_gm,can_sub_gm=EXCLUDED.can_sub_gm,is_experienced=EXCLUDED.is_experienced,notes=EXCLUDED.notes
  WHERE ROW(target.can_main_gm,target.can_sub_gm,target.is_experienced,target.notes)
    IS DISTINCT FROM ROW(EXCLUDED.can_main_gm,EXCLUDED.can_sub_gm,EXCLUDED.is_experienced,EXCLUDED.notes);

  DELETE FROM public.staff_scenario_assignments a WHERE a.organization_id=p_organization_id AND a.staff_id=p_staff_id
    AND EXISTS(SELECT 1 FROM public.organization_scenarios o WHERE o.organization_id=p_organization_id AND o.scenario_master_id=a.scenario_master_id)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_assignments) j WHERE (j.value->>'scenarioId')::uuid=a.scenario_master_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_scenario_assignments_atomic(
  p_organization_id uuid,p_scenario_master_id uuid,p_staff_ids uuid[],p_expected jsonb,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_organization_id IS NULL OR p_scenario_master_id IS NULL OR p_staff_ids IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid assignment request' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scenario unavailable' USING ERRCODE='23503'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_staff_ids) requested(staff_id) WHERE NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.id=requested.staff_id AND s.organization_id=p_organization_id)) THEN
    RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='23503';
  END IF;
  PERFORM 1 FROM public.staff s WHERE s.organization_id=p_organization_id AND
    (s.id=ANY(p_staff_ids) OR EXISTS(SELECT 1 FROM public.staff_scenario_assignments a WHERE a.organization_id=p_organization_id AND a.scenario_master_id=p_scenario_master_id AND a.staff_id=s.id)) ORDER BY s.id FOR UPDATE;
  IF public.assignment_state(p_organization_id,NULL,p_scenario_master_id) IS DISTINCT FROM public.normalize_assignment_state(p_expected) THEN
    RAISE EXCEPTION 'Assignments changed' USING ERRCODE='40001';
  END IF;
  UPDATE public.staff_scenario_assignments SET can_main_gm=false,can_sub_gm=false,is_experienced=true
    WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id AND (can_main_gm OR can_sub_gm) AND NOT(staff_id=ANY(p_staff_ids));
  INSERT INTO public.staff_scenario_assignments AS target
    (organization_id,staff_id,scenario_master_id,can_main_gm,can_sub_gm,is_experienced,notes)
    SELECT p_organization_id,id,p_scenario_master_id,true,true,false,p_notes FROM (SELECT DISTINCT unnest(p_staff_ids) id) s
    ON CONFLICT(staff_id,scenario_master_id) DO UPDATE SET can_main_gm=true,can_sub_gm=true,is_experienced=false
    WHERE NOT(target.can_main_gm OR target.can_sub_gm);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_organization_scenario_atomic(p_organization_id uuid,p_scenario_master_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scenario unavailable' USING ERRCODE='23503'; END IF;
  PERFORM 1 FROM public.staff s WHERE s.organization_id=p_organization_id AND EXISTS(
    SELECT 1 FROM public.staff_scenario_assignments a WHERE a.organization_id=p_organization_id AND a.scenario_master_id=p_scenario_master_id AND a.staff_id=s.id) ORDER BY s.id FOR UPDATE;
  UPDATE public.reservations SET scenario_master_id=NULL WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id;
  UPDATE public.schedule_events SET scenario_master_id=NULL WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id;
  DELETE FROM public.staff_scenario_assignments WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id;
  DELETE FROM public.performance_kits WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id;
  DELETE FROM public.organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id;
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_assignment_scenario_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.organization_scenarios WHERE organization_id=NEW.organization_id
    AND scenario_master_id=coalesce(NEW.scenario_master_id,NEW.scenario_id) FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scenario unavailable for assignment' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER assignment_scenario_membership_guard BEFORE INSERT OR UPDATE ON public.staff_scenario_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_scenario_membership();

-- これまでDELETEのみだった監査を追加・役割変更にも残す。
CREATE OR REPLACE FUNCTION public.audit_assignment_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
  INSERT INTO public.audit_logs(organization_id,action,resource_type,resource_id,table_name,record_id,old_values,new_values,metadata)
    VALUES(NEW.organization_id,TG_OP,'staff_scenario_assignments',NEW.scenario_master_id,'staff_scenario_assignments',
      NEW.staff_id::text||':'||NEW.scenario_master_id::text,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),
      jsonb_build_object('source','assignment_write_trigger'));
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_assignment_insert_update AFTER INSERT OR UPDATE ON public.staff_scenario_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_assignment_updates();

REVOKE ALL ON FUNCTION public.normalize_assignment_state(jsonb),public.assignment_state(uuid,uuid,uuid),
  public.replace_staff_assignments_atomic(uuid,uuid,jsonb,jsonb),public.replace_scenario_assignments_atomic(uuid,uuid,uuid[],jsonb,text),
  public.delete_organization_scenario_atomic(uuid,uuid),public.enforce_assignment_scenario_membership(),public.audit_assignment_updates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_assignment_state(jsonb),public.assignment_state(uuid,uuid,uuid),
  public.replace_staff_assignments_atomic(uuid,uuid,jsonb,jsonb),public.replace_scenario_assignments_atomic(uuid,uuid,uuid[],jsonb,text),
  public.delete_organization_scenario_atomic(uuid,uuid) TO service_role;
