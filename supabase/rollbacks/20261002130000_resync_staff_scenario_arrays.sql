-- rollback: 退避表の配列へ戻す。配列の直接変更を拒否するトリガーを一時停止して戻す（戻した配列は担当表と一致しないため）。
ALTER TABLE public.staff DISABLE TRIGGER sync_staff_to_assignments_trigger;
UPDATE public.staff s
SET special_scenarios = b.special_scenarios, available_scenarios = b.available_scenarios
FROM archive.staff_scenario_arrays_backup_20261002 b
WHERE b.id = s.id;
ALTER TABLE public.staff ENABLE TRIGGER sync_staff_to_assignments_trigger;
