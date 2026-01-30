-- =============================================================================
-- 20260130243000: reservations_history（予約の監査証跡）を追加（SEC-P1-03）
-- =============================================================================
--
-- 目的:
-- - reservations の重要な状態変更（status/人数/金額/日程等）が「誰が/いつ/何を」行ったか追跡できない問題を解消
-- - 事故/不正/問い合わせ時に原因究明と責任分界を可能にする
--
-- 方針:
-- - reservations の INSERT/UPDATE/DELETE をトリガで記録（アプリ実装に依存しない）
-- - クライアントからの直接INSERTは禁止（権限とRLSで防止）
-- - 閲覧は staff/admin のみに限定（組織一致）
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) テーブル作成
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reservations_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- 変更者情報
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  changed_by_role TEXT,

  -- 変更情報
  action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb, -- { field: { old: value, new: value } }
  old_values JSONB,
  new_values JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_history_reservation_id
  ON public.reservations_history(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservations_history_org_id
  ON public.reservations_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_reservations_history_created_at
  ON public.reservations_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_history_changed_by_user
  ON public.reservations_history(changed_by_user_id);

-- -----------------------------------------------------------------------------
-- 2) 監査ログ用トリガ関数
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_reservation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_action TEXT;
  v_reservation_id UUID;
  v_org_id UUID;

  v_actor_user_id UUID;
  v_actor_role TEXT;
  v_actor_staff_id UUID;

  v_old JSONB;
  v_new JSONB;
  v_changes JSONB;
  v_key TEXT;
  v_old_val JSONB;
  v_new_val JSONB;
BEGIN
  v_actor_user_id := auth.uid();
  v_actor_role := NULL;
  v_actor_staff_id := NULL;

  IF v_actor_user_id IS NOT NULL THEN
    SELECT role::text INTO v_actor_role
    FROM public.users
    WHERE id = v_actor_user_id
    LIMIT 1;

    SELECT id INTO v_actor_staff_id
    FROM public.staff
    WHERE user_id = v_actor_user_id
    ORDER BY created_at NULLS LAST, id
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_reservation_id := NEW.id;
    v_org_id := NEW.organization_id;
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_changes := '{}'::jsonb;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_reservation_id := NEW.id;
    v_org_id := NEW.organization_id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    v_changes := '{}'::jsonb;
    FOR v_key, v_new_val IN SELECT key, value FROM jsonb_each(v_new) LOOP
      v_old_val := v_old -> v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changes := v_changes || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_val, 'new', v_new_val)
        );
      END IF;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_reservation_id := OLD.id;
    v_org_id := OLD.organization_id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_changes := '{}'::jsonb;
  ELSE
    RETURN NULL;
  END IF;

  IF v_org_id IS NULL THEN
    -- マルチテナント整合性が取れないためログを残さず終了（異常系）
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.reservations_history (
    reservation_id,
    organization_id,
    changed_by_user_id,
    changed_by_staff_id,
    changed_by_role,
    action_type,
    changes,
    old_values,
    new_values
  ) VALUES (
    v_reservation_id,
    v_org_id,
    v_actor_user_id,
    v_actor_staff_id,
    v_actor_role,
    v_action,
    v_changes,
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) トリガ付与
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_reservations_history ON public.reservations;

CREATE TRIGGER trg_reservations_history
AFTER INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.log_reservation_change();

-- -----------------------------------------------------------------------------
-- 4) RLS/権限
-- -----------------------------------------------------------------------------

ALTER TABLE public.reservations_history ENABLE ROW LEVEL SECURITY;

-- クライアントからの直接書き込みを禁止（トリガのみが想定）
REVOKE ALL ON TABLE public.reservations_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.reservations_history TO authenticated;

DROP POLICY IF EXISTS "reservations_history_select_staff_or_admin" ON public.reservations_history;
CREATE POLICY "reservations_history_select_staff_or_admin" ON public.reservations_history
  FOR SELECT USING (
    is_org_admin()
    OR (
      get_user_organization_id() IS NOT NULL
      AND organization_id = get_user_organization_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 5) コメント
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.reservations_history IS '予約の監査証跡（誰が/いつ/何を変更したか）';
COMMENT ON COLUMN public.reservations_history.reservation_id IS '対象の予約ID（削除後はNULL）';
COMMENT ON COLUMN public.reservations_history.organization_id IS '組織ID（マルチテナント）';
COMMENT ON COLUMN public.reservations_history.changed_by_user_id IS '変更者ユーザーID（auth.uid）';
COMMENT ON COLUMN public.reservations_history.changed_by_staff_id IS '変更者スタッフID（存在する場合）';
COMMENT ON COLUMN public.reservations_history.changed_by_role IS '変更者ロール（users.role）';
COMMENT ON COLUMN public.reservations_history.action_type IS '変更種別（create/update/delete）';
COMMENT ON COLUMN public.reservations_history.changes IS '変更差分 { field: { old: value, new: value } }';
COMMENT ON COLUMN public.reservations_history.old_values IS '変更前スナップショット';
COMMENT ON COLUMN public.reservations_history.new_values IS '変更後スナップショット';

