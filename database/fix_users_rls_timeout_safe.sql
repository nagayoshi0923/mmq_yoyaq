-- usersテーブルのRLSポリシー修正（安全版）
-- 既存のポリシーを確認してから削除・再作成

-- 1. 現在のポリシーを確認
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check 
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- 2. 既存のポリシーをすべて削除（存在する場合のみ）
DO $$ 
BEGIN
  -- すべての既存ポリシーを削除
  DROP POLICY IF EXISTS users_select_policy ON users;
  DROP POLICY IF EXISTS users_insert_policy ON users;
  DROP POLICY IF EXISTS users_update_policy ON users;
  DROP POLICY IF EXISTS users_delete_policy ON users;
  DROP POLICY IF EXISTS users_policy ON users;
  DROP POLICY IF EXISTS users_service_role_policy ON users;
  
  -- 他の可能性のあるポリシー名も削除
  DROP POLICY IF EXISTS "users_select_policy" ON users;
  DROP POLICY IF EXISTS "users_insert_policy" ON users;
  DROP POLICY IF EXISTS "users_update_policy" ON users;
  DROP POLICY IF EXISTS "users_delete_policy" ON users;
  
  RAISE NOTICE '既存のポリシーを削除しました';
END $$;

-- 3. インデックスの追加（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 4. 新しいシンプルなポリシーを作成（無限再帰なし）
-- SELECT: 認証されたユーザーは自分自身のレコードを閲覧可能
CREATE POLICY users_select_policy ON users FOR SELECT USING (
  auth.uid() = id
);

-- INSERT: 認証されたユーザーは自分のレコードを作成可能
CREATE POLICY users_insert_policy ON users FOR INSERT WITH CHECK (
  auth.uid() = id
);

-- UPDATE: 認証されたユーザーは自分のレコードを更新可能
CREATE POLICY users_update_policy ON users FOR UPDATE USING (
  auth.uid() = id
) WITH CHECK (
  auth.uid() = id
);

-- DELETE: 認証されたユーザーは自分のレコードを削除可能
CREATE POLICY users_delete_policy ON users FOR DELETE USING (
  auth.uid() = id
);

-- 5. 確認用クエリ
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check 
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- 6. インデックス確認
SELECT
    tablename,
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'users'
ORDER BY
    indexname;

-- 完了メッセージ
SELECT 'usersテーブルのRLSポリシー修正完了！' as message;

