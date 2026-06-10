-- ============================================================================
-- staff_scenario_assignments の DELETE を監査ログに記録する
--
-- 背景: 担当一括更新（update_staff_assignments / update_scenario_assignments）は
-- 物理 DELETE を伴うが、これまで監査トリガーが無く、削除内容が一切残らなかった。
-- 2026-06 に「孤児シナリオで担当が全消失」する事故が起き、削除痕跡が無いため
-- staging ミラーから手動復旧する羽目になった。再発時に確実に復元できるよう、
-- 削除行の全内容（old_values）を audit_logs に残す。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_staff_scenario_assignment_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, organization_id, old_values)
  VALUES (
    auth.uid(),
    'DELETE',
    'staff_scenario_assignments',
    OLD.staff_id::text,
    OLD.organization_id,
    row_to_json(OLD)::jsonb
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_ssa_delete ON public.staff_scenario_assignments;

CREATE TRIGGER trigger_audit_ssa_delete
  AFTER DELETE ON public.staff_scenario_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_staff_scenario_assignment_deletes();
