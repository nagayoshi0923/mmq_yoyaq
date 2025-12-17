-- マルチテナント対応: users テーブルに organization_id を追加
-- 実行日: 2024-12-17

-- ================================================
-- 1. users テーブルに organization_id カラムを追加
-- ================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- 既存ユーザーにクインズワルツの organization_id を設定
-- staff テーブルから organization_id を取得して設定
UPDATE users u
SET organization_id = s.organization_id
FROM staff s
WHERE s.user_id = u.id
  AND u.organization_id IS NULL;

-- staff に紐付かないユーザー（顧客など）はクインズワルツに紐付け
UPDATE users
SET organization_id = 'a0000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- ================================================
-- 2. current_organization_id() 関数を更新
-- ※ users テーブルから直接取得できるように最適化
-- ================================================
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- まず users テーブルから取得（高速）
  SELECT organization_id INTO org_id
  FROM users
  WHERE id = auth.uid();
  
  IF org_id IS NOT NULL THEN
    RETURN org_id;
  END IF;
  
  -- フォールバック: staff テーブルから取得
  SELECT organization_id INTO org_id
  FROM staff
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN org_id;
END;
$$;

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT id, email, role, organization_id FROM users;

