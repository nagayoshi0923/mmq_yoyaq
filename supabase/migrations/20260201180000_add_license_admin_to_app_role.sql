-- =============================================================================
-- 🔧 app_role enum に license_admin を追加
-- 
-- 問題: app_role enum が ('admin','staff','customer') のみで
--       license_admin が含まれていなかった
-- 
-- 影響: ヘルパー関数 (is_admin, is_staff_or_admin) が 
--       license_admin をチェックする際に 500 エラー
-- =============================================================================

-- license_admin が存在しない場合のみ追加
DO $$
BEGIN
  -- 既に存在するかチェック
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'license_admin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'license_admin';
  END IF;
END $$;

-- 確認用
DO $$
BEGIN
  RAISE NOTICE '✅ app_role enum に license_admin を追加しました';
  RAISE NOTICE '   enum値: admin, staff, customer, license_admin';
END $$;
