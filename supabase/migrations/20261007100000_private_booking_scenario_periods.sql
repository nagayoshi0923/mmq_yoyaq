-- #960 作品の「公演期間」「貸切募集期間」が貸切の受付処理で守られていなかった。
-- 画面に表示するだけで、候補日の追加・貸切リクエストの保存では見ていなかったため、期間外でも申し込めた。
-- 候補日の共通チェックに両方の期間を加える（グループの候補日追加・貸切リクエスト作成の両方で使われる）。
-- あわせて、予約サイトの日付選びで期間外の日を出さないよう、公演期間の2列を未ログインでも読めるようにする。

-- RPC と直接 INSERT/UPDATE の双方で、保存時点の実効締切・作品の公演期間・貸切募集期間を強制する。
CREATE OR REPLACE FUNCTION public.assert_private_booking_candidate_date(p_org UUID,p_scenario UUID,p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE days INTEGER; today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE; period RECORD;
BEGIN
 IF p_org IS NULL OR p_scenario IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'PRIVATE_BOOKING_CONTEXT_REQUIRED' USING ERRCODE='P0045'; END IF;
 days := public.get_effective_private_booking_deadline_days(p_org,NULL,p_scenario);
 IF p_date < today + days THEN
   RAISE EXCEPTION 'PRIVATE_BOOKING_DEADLINE_PASSED' USING ERRCODE='P0045';
 END IF;
 -- 作品編集の「貸切募集期間」（申し込める期間）と「公演期間」（公演できる日の範囲）。未設定は制限なし。
 SELECT os.booking_start_date,os.booking_end_date,os.available_from,os.available_until INTO period
 FROM public.organization_scenarios os
 WHERE os.organization_id=p_org AND (os.id=p_scenario OR os.scenario_master_id=p_scenario)
 ORDER BY CASE WHEN os.id=p_scenario THEN 0 ELSE 1 END,os.created_at LIMIT 1;
 IF FOUND THEN
   IF (period.booking_start_date IS NOT NULL AND today < period.booking_start_date)
      OR (period.booking_end_date IS NOT NULL AND today > period.booking_end_date) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_NOT_ACCEPTED' USING ERRCODE='P0044';
   END IF;
   IF (period.available_from IS NOT NULL AND p_date < period.available_from)
      OR (period.available_until IS NOT NULL AND p_date > period.available_until) THEN
     RAISE EXCEPTION 'PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD' USING ERRCODE='P0054';
   END IF;
 END IF;
END;
$$;

GRANT SELECT (available_from, available_until) ON public.organization_scenarios_with_master TO anon;
