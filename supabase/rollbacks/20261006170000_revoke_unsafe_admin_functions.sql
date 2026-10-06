-- rollback: 実行の許可を戻す（お客様が予約をまとめて消せる状態に戻るので、戻すのは業務が止まった場合だけ）
GRANT EXECUTE ON FUNCTION public.admin_clear_reservations_scenario_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_reservations_by_source(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_reservations(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_cancellation_fee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_fix_inventory_consistency(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_inventory_consistency_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO anon, authenticated;
