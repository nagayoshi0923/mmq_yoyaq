-- 管理用の処理を、お客様・未ログインの人から呼べないようにする（2026-10-06 の権限調査で発覚）。
-- 「予約の一括削除」などが authenticated（ログインしたお客様を含む）・anon に実行を許されており、
-- 組織が結び付いたお客様でも自分の組織の予約をまとめて消せる書き方だった（本番で、何も消えない入力で呼べることを確認）。
-- 金額の再計算（引数 2 つの版）はサーバーがスタッフ本人の権限で呼ぶため、ここでは止めず、中身を 20261006180000 で直す。
-- いずれも画面からは使っておらず（サーバー・定期処理は service_role で呼ぶ）、表の決まり・表示用の表・他の関数からも使っていない。
REVOKE EXECUTE ON FUNCTION public.admin_clear_reservations_scenario_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_reservations_by_source(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_event_reservations(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_fix_inventory_consistency(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_inventory_consistency_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_reservations_scenario_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_source(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_reservations(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_cancellation_fee(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_fix_inventory_consistency(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_inventory_consistency_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO service_role;
