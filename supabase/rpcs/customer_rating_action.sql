-- メール変更後も認証UIDに紐づく本人の評価だけを操作する。RLS変更なし。
CREATE OR REPLACE FUNCTION public.customer_rating_action(p_customer_id uuid,p_action text,p_scenario_master_id uuid DEFAULT NULL,p_rating integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer_id AND user_id=actor) THEN
  RAISE EXCEPTION '本人の評価のみ操作できます' USING ERRCODE='42501';
 END IF;
 IF p_action='snapshot' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('scenario_master_id',r.scenario_master_id,'rating',r.rating,'updated_at',r.updated_at) ORDER BY r.updated_at DESC),'[]'::jsonb)
  INTO result FROM public.scenario_ratings r WHERE r.customer_id=p_customer_id;
  RETURN result;
 ELSIF p_action='upsert' THEN
  IF p_scenario_master_id IS NULL OR p_rating IS NULL OR p_rating<1 OR p_rating>5 THEN
   RAISE EXCEPTION '作品と1から5の評価を指定してください' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.scenario_ratings(customer_id,scenario_master_id,rating)
  VALUES(p_customer_id,p_scenario_master_id,p_rating)
  ON CONFLICT(customer_id,scenario_master_id) DO UPDATE SET rating=EXCLUDED.rating,updated_at=now();
  RETURN 'true'::jsonb;
 ELSIF p_action='clear_scenario' THEN
  IF p_scenario_master_id IS NULL THEN RAISE EXCEPTION '作品を指定してください' USING ERRCODE='22023'; END IF;
  DELETE FROM public.scenario_ratings r USING public.customers c
  WHERE r.customer_id=c.id AND c.user_id=actor AND r.scenario_master_id=p_scenario_master_id;
  RETURN 'true'::jsonb;
 END IF;
 RAISE EXCEPTION '未対応の操作です' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.customer_rating_action(uuid,text,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_rating_action(uuid,text,uuid,integer) TO authenticated;
