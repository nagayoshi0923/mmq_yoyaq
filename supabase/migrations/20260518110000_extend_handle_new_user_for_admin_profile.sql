-- =============================================================================
-- handle_new_user トリガー拡張: admin 登録時に phone / prefecture / birth_date も保存
-- =============================================================================
-- 背景:
--   OrgSignup (/start) は signUp 後に email 確認するまでフロントから authenticated
--   ユーザーとして INSERT できないため、admin の連絡先情報（電話・都道府県・生年月日）
--   をどこにも記録できなかった。
--
--   admin もスタッフ兼ユーザーとして連絡先・所在地・生年月日を保持すべきため、
--   signUp 時の user_metadata に admin_phone / admin_prefecture / admin_birth_date を
--   含めて渡し、トリガー内で staff / customers の両テーブルに反映する。
--
-- 変更内容:
--   1. user_metadata から admin_phone / admin_prefecture / admin_birth_date を読む
--   2. staff INSERT に phone を追加
--   3. customers INSERT を追加（admin も「自組織の顧客」になり得るため）
--      - email UNIQUE index と衝突した場合は ON CONFLICT (email) DO NOTHING でスキップ
--
-- 既存フローへの影響:
--   - 旧 OrgSignup 経由（phone/prefecture/birth_date を渡さない）は NULL のまま処理続行
--   - スタッフ招待フロー（invited_as='staff'）は customers INSERT 分岐を通らず変化なし
--   - 顧客登録フロー（invited_as 無し）も従来通り
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
    -- staff: admin を組織所属スタッフとして登録（phone も入れる）
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

    -- customers: admin も自組織の顧客として予約等を行える前提でレコードを作る
    -- email UNIQUE と衝突した場合（顧客として既に登録済み）はスキップ
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
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: エラーが発生しました (user_id=%, error=%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ handle_new_user 拡張: admin 登録時に phone / prefecture / birth_date を staff + customers に保存';
END $$;
