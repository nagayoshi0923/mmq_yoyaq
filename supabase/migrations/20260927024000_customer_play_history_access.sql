-- Phase 1: add the authorized entry point. Existing grants are retained until
-- all browser callers have migrated; revocation is a separate deployment step.
CREATE OR REPLACE FUNCTION public.customer_play_history_action(
  p_customer_id uuid,
  p_action text DEFAULT 'snapshot',
  p_record jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  actor_org uuid;
  customer_row public.customers%ROWTYPE;
  staff_allowed boolean := false;
  own_profile boolean;
  has_contact boolean := false;
  affected uuid;
  result jsonb;
  master_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE = '42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('snapshot','add_manual','update_manual_date','delete_manual','add_override','remove_override') THEN
    RAISE EXCEPTION '未対応の操作です' USING ERRCODE = '22023';
  END IF;
  -- Serializes the per-customer registration limit and permission check with
  -- writes. No customer data is changed by this lock.
  SELECT * INTO customer_row FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '顧客を操作できません' USING ERRCODE = '42501'; END IF;
  SELECT role::text, organization_id INTO actor_role, actor_org FROM public.users WHERE id = actor;
  own_profile := customer_row.user_id IS NOT DISTINCT FROM actor;
  staff_allowed := COALESCE(actor_role IN ('admin','staff'),false) AND actor_org IS NOT NULL
    AND NOT (
      EXISTS (SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
      AND NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org
        AND (status IS NULL OR status NOT IN ('inactive','resigned')))
    );
  IF staff_allowed THEN
    has_contact := customer_row.organization_id = actor_org
      OR public.customer_has_org_connection(p_customer_id, actor_org);
  END IF;
  IF NOT (own_profile OR COALESCE(actor_role = 'license_admin',false) OR (staff_allowed AND COALESCE(has_contact,false))) THEN
    RAISE EXCEPTION '顧客を操作できません' USING ERRCODE = '42501';
  END IF;
  -- An organization-owned profile may be readable from another organization
  -- through a booking, but that does not grant permission to change it.
  IF p_action <> 'snapshot' AND NOT (own_profile OR COALESCE(actor_role = 'license_admin',false)
    OR (staff_allowed AND (customer_row.organization_id = actor_org
      OR (customer_row.organization_id IS NULL AND COALESCE(has_contact,false))))) THEN
    RAISE EXCEPTION 'この顧客の体験済み履歴を変更する権限がありません' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'snapshot' THEN
    RETURN jsonb_build_object(
      'manual', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC, h.id DESC)
        FROM public.manual_play_history h WHERE h.customer_id=p_customer_id), '[]'::jsonb),
      'overrides', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC, o.id DESC)
        FROM public.customer_played_overrides o WHERE o.customer_id=p_customer_id), '[]'::jsonb)
    );
  END IF;
  IF p_action = 'add_manual' THEN
    IF COALESCE(length(btrim(p_record->>'scenario_title')),0)=0 THEN
      RAISE EXCEPTION '作品名を入力してください' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.manual_play_history WHERE customer_id=p_customer_id) >= 2000 THEN
      RAISE EXCEPTION '手動登録は最大2000件までです' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.manual_play_history(customer_id,scenario_title,scenario_master_id,played_at,venue,notes)
      VALUES(p_customer_id,btrim(p_record->>'scenario_title'),NULLIF(p_record->>'scenario_master_id','')::uuid,
        NULLIF(p_record->>'played_at','')::date,p_record->>'venue',p_record->>'notes')
      RETURNING to_jsonb(manual_play_history.*) INTO result;
    RETURN result;
  ELSIF p_action = 'update_manual_date' THEN
    UPDATE public.manual_play_history SET played_at=NULLIF(p_record->>'played_at','')::date,
      updated_at=now() WHERE id=(p_record->>'id')::uuid AND customer_id=p_customer_id
      RETURNING id INTO affected;
    RETURN jsonb_build_object('updated',affected IS NOT NULL);
  ELSIF p_action = 'delete_manual' THEN
    DELETE FROM public.manual_play_history WHERE id=(p_record->>'id')::uuid AND customer_id=p_customer_id RETURNING id INTO affected;
    RETURN jsonb_build_object('removed',affected IS NOT NULL);
  END IF;
  master_id := NULLIF(p_record->>'scenario_master_id','')::uuid;
  IF master_id IS NULL THEN RAISE EXCEPTION '作品IDが必要です' USING ERRCODE = '22023'; END IF;
  IF p_action = 'add_override' THEN
    INSERT INTO public.customer_played_overrides(customer_id,scenario_master_id,reason,created_by)
      VALUES(p_customer_id,master_id,p_record->>'reason',actor)
      ON CONFLICT(customer_id,scenario_master_id) DO NOTHING;
    RETURN jsonb_build_object('success',true);
  END IF;
  IF p_action = 'remove_override' THEN
    DELETE FROM public.customer_played_overrides WHERE customer_id=p_customer_id AND scenario_master_id=master_id RETURNING id INTO affected;
    RETURN jsonb_build_object('removed',affected IS NOT NULL);
  END IF;
  RAISE EXCEPTION '未対応の操作です' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.customer_play_history_action(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_play_history_action(uuid,text,jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.customer_play_history_action(uuid,text,jsonb) IS 'Personal played history; verified owner or active CRM staff with customer contact. No RLS policy changes.';
