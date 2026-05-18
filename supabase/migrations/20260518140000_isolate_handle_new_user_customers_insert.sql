-- =============================================================================
-- handle_new_user: customers INSERT を内側 BEGIN/EXCEPTION で隔離し
-- 失敗しても users / staff INSERT をロールバックさせない
-- =============================================================================
-- 背景:
--   20260518110000 で handle_new_user に追加した customers INSERT は
--   `ON CONFLICT (email) DO NOTHING` を使っているが、customers.email には
--   UNIQUE 制約が存在しない（あるのは非 UNIQUE な idx_customers_lower_email のみ）。
--   このため毎回:
--     42P10 "no unique or exclusion constraint matching the ON CONFLICT specification"
--   で失敗し、関数末尾の EXCEPTION WHEN OTHERS が握り潰す。同一トランザクション内で
--   先行する public.users / public.staff の INSERT もロールバックされてしまい、
--   /start からの組織自己登録で auth.users だけ作られて public.users が無い
--   orphan 状態になる（→ フロントは CompleteProfile に飛ばされ users 403 連鎖）。
--
--   これは PR #176 で staff の `ON CONFLICT (user_id)` を staff.user_id UNIQUE
--   追加で潰したのと同じ罠を、別テーブル (customers) で踏んでいる構図。
--
-- 修正方針:
--   customers INSERT を内側の BEGIN ... EXCEPTION WHEN OTHERS で隔離し、
--   失敗しても users / staff の作成は守る。重複登録の回避は、ON CONFLICT ではなく
--   組織スコープの EXISTS チェックで行う（customers は本来 organization_id ごとに
--   独立した顧客レコードなので、同一組織内で同じ email が無い場合のみ INSERT）。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       app_role := 'customer';
  v_org_id     UUID;
  v_name       TEXT;
  v_phone      TEXT;
  v_prefecture TEXT;
  v_birth_date DATE;
BEGIN
  v_org_id     := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  v_name       := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_name', '')), '');
  v_phone      := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_phone', '')), '');
  v_prefecture := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_prefecture', '')), '');

  BEGIN
    v_birth_date := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_birth_date', '')), '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_birth_date := NULL;
  END;

  IF (NEW.raw_user_meta_data->>'invited_as') IS NOT NULL THEN
    CASE (NEW.raw_user_meta_data->>'invited_as')
      WHEN 'staff'         THEN v_role := 'staff';
      WHEN 'admin'         THEN v_role := 'admin';
      WHEN 'license_admin' THEN v_role := 'license_admin';
      ELSE                      v_role := 'customer';
    END CASE;
  END IF;

  INSERT INTO public.users (id, email, role, organization_id, created_at, updated_at)
  VALUES (NEW.id, NEW.email, v_role, v_org_id, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    role            = EXCLUDED.role,
    organization_id = COALESCE(EXCLUDED.organization_id, users.organization_id),
    updated_at      = NOW();

  IF v_role = 'admin' AND v_org_id IS NOT NULL THEN
    INSERT INTO public.staff (
      name, email, phone, user_id, organization_id, role, status,
      stores, ng_days, want_to_learn, available_scenarios,
      availability, experience, special_scenarios
    ) VALUES (
      COALESCE(v_name, split_part(NEW.email, '@', 1)),
      NEW.email,
      v_phone,
      NEW.id,
      v_org_id,
      ARRAY['管理者']::TEXT[],
      'active',
      '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[],
      '{}'::TEXT[], 0, '{}'::TEXT[]
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- customers INSERT を独立サブブロックで隔離。
    -- ここでの失敗は users / staff INSERT を巻き戻さない。
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM public.customers
        WHERE organization_id = v_org_id
          AND lower(email) = lower(NEW.email)
      ) THEN
        INSERT INTO public.customers (
          user_id, organization_id, name, email, phone,
          prefecture, birth_date,
          visit_count, total_spent,
          notification_settings,
          created_at, updated_at
        ) VALUES (
          NEW.id, v_org_id,
          COALESCE(v_name, split_part(NEW.email, '@', 1)),
          NEW.email,
          v_phone,
          v_prefecture,
          v_birth_date,
          0, 0,
          jsonb_build_object(
            'email_notifications',    true,
            'reminder_notifications', true,
            'campaign_notifications', false
          ),
          NOW(), NOW()
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: customers INSERT 失敗 (user_id=%, email=%, error=%)',
        NEW.id, NEW.email, SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: エラーが発生しました (user_id=%, error=%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ handle_new_user: customers INSERT を独立サブブロックで隔離';
  RAISE NOTICE '   - customers INSERT が失敗しても users / staff の作成は守られる';
  RAISE NOTICE '   - 重複は (organization_id, lower(email)) の EXISTS チェックで回避';
END $$;
