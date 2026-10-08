-- 0804 rollback: 安全な認可/履歴/ACLは保持し、旧関数定義を復元。
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

-- 申込前の主催者による候補の取り下げ。候補・回答・申請位置の履歴は物理削除しない。
CREATE OR REPLACE FUNCTION public.private_group_withdraw_candidate(p_group_id uuid, p_candidate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE; candidate public.private_group_candidate_dates%ROWTYPE; linked_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501'; END IF;
  -- 申込RPCと同じグループ行を先にロックし、申込と取り下げを直列化する。
  SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR g.organizer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION '候補日を削除する権限がありません' USING ERRCODE='42501';
  END IF;
  IF g.status IS NULL OR g.status NOT IN ('gathering','date_adjusting') THEN
    RAISE EXCEPTION '申込済み、確定済み、取消済みの候補日は削除できません' USING ERRCODE='22023';
  END IF;
  IF g.reservation_id IS NOT NULL THEN
    SELECT status INTO linked_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE NOWAIT;
    IF linked_status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION '処理中の予約があるため候補日を削除できません。画面を更新してください' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT * INTO candidate FROM public.private_group_candidate_dates WHERE id=p_candidate_id AND group_id=g.id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION '候補日が見つかりません。画面を更新してください' USING ERRCODE='22023'; END IF;
  IF candidate.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'candidate_id',candidate.id,'replayed',true);
  END IF;
  -- rejected は既存の申込RPCが送信対象から除外する値。withdrawn_at で店舗の却下と区別する。
  UPDATE public.private_group_candidate_dates SET status='rejected',withdrawn_at=now() WHERE id=candidate.id AND group_id=g.id;
  RETURN jsonb_build_object('success',true,'candidate_id',candidate.id,'replayed',false);
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION '別の操作が処理中です。画面を更新してから削除してください' USING ERRCODE='40001';
END $$;
REVOKE ALL ON FUNCTION public.private_group_withdraw_candidate(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_withdraw_candidate(uuid,uuid) TO authenticated,service_role;

