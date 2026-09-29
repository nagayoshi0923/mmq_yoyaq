-- アプリを旧版へ戻してから実行する。既存担当データは変更しない。
DROP FUNCTION IF EXISTS public.save_staff_editor_atomic(uuid,uuid,jsonb,jsonb,boolean,uuid);
DROP FUNCTION IF EXISTS public.save_scenario_gm_changes_atomic(uuid,uuid,jsonb,jsonb,uuid);
DROP FUNCTION IF EXISTS public.apply_staff_assignment_edit(uuid,uuid,jsonb,boolean);
