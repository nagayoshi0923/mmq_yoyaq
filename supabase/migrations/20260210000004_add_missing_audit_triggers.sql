-- =============================================================================
-- P1-11: 監査ログの不足箇所を補完
--
-- 既存の監査トリガー: staff, customers, reservations, users, organization_settings
-- 追加: schedule_events, stores, scenarios
-- =============================================================================

-- ===========================
-- 汎用監査関数（テーブル名をパラメータで受け取る）
-- ===========================
CREATE OR REPLACE FUNCTION public.audit_generic_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_action text;
  v_resource_type text;
  v_resource_id uuid;
  v_org_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  v_user_id := auth.uid();
  v_resource_type := TG_TABLE_NAME;

  IF TG_OP = 'INSERT' THEN
    v_action := v_resource_type || '.create';
    v_resource_id := NEW.id;
    v_new_values := to_jsonb(NEW);
    v_old_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := v_resource_type || '.update';
    v_resource_id := NEW.id;
    -- 変更されたフィールドのみ記録（パフォーマンス最適化）
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := v_resource_type || '.delete';
    v_resource_id := OLD.id;
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  END IF;

  -- organization_id の取得を試みる
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
    ELSE
      v_org_id := NEW.organization_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_org_id := NULL;
  END;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, organization_id)
  VALUES (v_user_id, v_action, v_resource_type, v_resource_id, v_old_values, v_new_values, v_org_id);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- 監査ログ記録失敗は元の操作をブロックしない
  RAISE WARNING 'audit_generic_changes failed for %: %', v_resource_type, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================
-- schedule_events 監査トリガー
-- ===========================
DROP TRIGGER IF EXISTS trigger_audit_schedule_events ON public.schedule_events;
CREATE TRIGGER trigger_audit_schedule_events
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_generic_changes();

-- ===========================
-- stores 監査トリガー
-- ===========================
DROP TRIGGER IF EXISTS trigger_audit_stores ON public.stores;
CREATE TRIGGER trigger_audit_stores
  AFTER INSERT OR UPDATE OR DELETE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_generic_changes();

-- ===========================
-- scenarios 監査トリガー
-- ===========================
DROP TRIGGER IF EXISTS trigger_audit_scenarios ON public.scenarios;
CREATE TRIGGER trigger_audit_scenarios
  AFTER INSERT OR UPDATE OR DELETE ON public.scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_generic_changes();
