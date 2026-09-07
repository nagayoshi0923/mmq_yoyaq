-- 管理 API / AI Manager のサーバーからのみ実行。締切の既定値は設けない。
CREATE FUNCTION public.set_performance_recruitment_deadline(
  p_organization_id uuid, p_event_id uuid, p_deadline timestamptz, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.schedule_events%ROWTYPE;
  v_existing public.performance_recruitment_deadlines%ROWTYPE;
  v_start timestamptz;
  v_confirmed boolean;
BEGIN
  SELECT * INTO v_event FROM public.schedule_events
  WHERE id = p_event_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '対象の公演が見つかりません' USING ERRCODE = '22023'; END IF;
  v_start := (v_event.date + v_event.start_time) AT TIME ZONE 'Asia/Tokyo';
  IF v_event.category <> 'open' OR v_event.is_cancelled IS DISTINCT FROM false THEN
    RAISE EXCEPTION '中止していないオープン公演のみ延長できます' USING ERRCODE = '22023';
  END IF;
  IF p_deadline IS NULL OR p_deadline <= now() OR p_deadline >= v_start OR p_deadline < v_start - interval '4 hours' THEN
    RAISE EXCEPTION '締切は現在より後かつ公演4時間前以降、公演開始より前を指定してください' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION '延長理由を1〜2000文字で指定してください' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.performance_recruitment_deadlines WHERE schedule_event_id = p_event_id;
  IF FOUND THEN
    -- 再送は同じ結果を返す。顧客に案内した期限の黙示的な変更はしない。
    IF v_existing.status = 'active' AND v_existing.deadline = p_deadline
      AND v_existing.reason = btrim(p_reason) THEN
      RETURN jsonb_build_object('success', true, 'deadline', v_existing.deadline,
        'was_confirmed', v_existing.was_confirmed, 'replayed', true);
    END IF;
    RAISE EXCEPTION '既存の延長判断があります。期限の変更には顧客案内の再確認が必要です' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.performance_cancellation_logs
    WHERE schedule_event_id = p_event_id AND organization_id = p_organization_id
      AND result = 'confirmed') INTO v_confirmed;
  INSERT INTO public.performance_recruitment_deadlines
    (schedule_event_id, organization_id, deadline, reason, was_confirmed)
    VALUES (p_event_id, p_organization_id, p_deadline, btrim(p_reason), v_confirmed);
  UPDATE public.schedule_events SET is_recruitment_extended = true, updated_at = now()
    WHERE id = p_event_id AND organization_id = p_organization_id;
  RETURN jsonb_build_object('success', true, 'deadline', p_deadline,
    'was_confirmed', v_confirmed, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.set_performance_recruitment_deadline(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_performance_recruitment_deadline(uuid, uuid, timestamptz, text) TO service_role;
