-- 日時から選ぶ貸切（カレンダー・リストの「貸切申込」→ /{org}/private-booking-select）の作品一覧用。
-- 選んだ日に、作品ごとの日付だけで決まる理由（受付締切・貸切募集期間・公演期間）で申し込めない作品を返す。
-- 判定は保存と同じ assert_private_booking_candidate_date。店舗・時間帯の空き（公演との重なり・受付停止など）は、
-- 作品を選んだあとに private_booking_candidate_slot_availability で確かめる（作品数 × 店舗数の判定を一覧では行わない）。
-- 返すのは申し込めない作品だけ。reason は private_booking_candidate_slot_availability と同じ
--   past_deadline（受付締切後）/ not_recruiting（貸切募集期間外）/ outside_period（公演期間外）。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md
CREATE OR REPLACE FUNCTION public.private_booking_scenario_date_reasons(p_organization_id uuid, p_date date, p_scenario_ids uuid[])
 RETURNS TABLE(scenario_id uuid, reason text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id uuid;
BEGIN
 IF p_organization_id IS NULL OR p_date IS NULL OR coalesce(cardinality(p_scenario_ids), 0) > 400 THEN
  RAISE EXCEPTION '条件を確認してください' USING ERRCODE = '22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND o.is_active) THEN
  RAISE EXCEPTION '受付状況を確認できません' USING ERRCODE = '42501';
 END IF;
 -- 公開中の作品だけ（画面の一覧と同じ）。id は作品マスタの id（organization_scenarios_with_master.id）
 FOR v_id IN SELECT DISTINCT s.id FROM public.organization_scenarios_with_master s
  WHERE s.organization_id = p_organization_id AND s.status = 'available' AND s.id = ANY(coalesce(p_scenario_ids, '{}'::uuid[]))
 LOOP
  scenario_id := v_id; reason := NULL;
  BEGIN
   PERFORM public.assert_private_booking_candidate_date(p_organization_id, v_id, p_date);
  EXCEPTION WHEN SQLSTATE 'P0045' THEN reason := 'past_deadline';
   WHEN SQLSTATE 'P0044' THEN reason := 'not_recruiting';
   WHEN SQLSTATE 'P0054' THEN reason := 'outside_period';
  END;
  IF reason IS NOT NULL THEN RETURN NEXT; END IF;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_scenario_date_reasons(uuid, date, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_booking_scenario_date_reasons(uuid, date, uuid[]) TO anon, authenticated, service_role;
