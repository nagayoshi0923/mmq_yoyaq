-- 20260302100009: reservations_history の外部キー制約とトリガーを修正
--
-- 問題: 
-- 1. 先のマイグレーションで ON DELETE CASCADE にしたが、
--    DELETE時にトリガーが履歴を挿入しようとしてエラー
-- 2. 本来は ON DELETE SET NULL（履歴は残す）の設計だった
--
-- 解決策:
-- 1. 外部キー制約を ON DELETE SET NULL に戻す
-- 2. トリガーでDELETE時はreservation_id = NULLで履歴を記録

-- 既存の外部キー制約を削除して再作成
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'reservations_history'
    AND kcu.column_name = 'reservation_id'
  LIMIT 1;
  
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reservations_history DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  END IF;
END $$;

-- SET NULL で再作成（履歴は残す）
ALTER TABLE public.reservations_history
ADD CONSTRAINT reservations_history_reservation_id_fkey
  FOREIGN KEY (reservation_id)
  REFERENCES public.reservations(id)
  ON DELETE SET NULL;

-- トリガー関数を修正：DELETE時はreservation_id = NULLで記録
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
    -- DELETE時はreservation_id = NULL で記録（外部キー制約を回避）
    v_reservation_id := NULL;
    v_org_id := OLD.organization_id;
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_changes := '{}'::jsonb;
  ELSE
    RETURN NULL;
  END IF;

  IF v_org_id IS NULL THEN
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

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ reservations_history の外部キー制約を ON DELETE SET NULL に修正しました';
  RAISE NOTICE '✅ トリガー log_reservation_change() を修正しました';
  RAISE NOTICE '   - DELETE時は reservation_id = NULL で履歴を記録';
END $$;
