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

-- 古い画面で編集中だった回答の保存で、取り下げ後の履歴を上書きしない。
CREATE OR REPLACE FUNCTION public.guard_withdrawn_private_group_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE withdrawn timestamptz;
BEGIN
  PERFORM 1 FROM public.private_groups WHERE id=NEW.group_id FOR SHARE NOWAIT;
  SELECT withdrawn_at INTO withdrawn FROM public.private_group_candidate_dates
    WHERE id=NEW.candidate_date_id AND group_id=NEW.group_id FOR SHARE NOWAIT;
  IF withdrawn IS NOT NULL THEN
    RAISE EXCEPTION '候補日が削除されています。画面を更新してから回答してください' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION '候補日が更新中です。画面を更新してから回答してください' USING ERRCODE='40001';
END $$;
REVOKE ALL ON FUNCTION public.guard_withdrawn_private_group_response() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_withdrawn_private_group_response
  BEFORE INSERT OR UPDATE ON public.private_group_date_responses
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawn_private_group_response();
