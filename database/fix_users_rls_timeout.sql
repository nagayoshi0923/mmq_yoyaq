-- usersテーブルのRLSポリシー修正
-- タイムアウト問題を解決するため、シンプルなポリシーに変更

-- 既存のポリシーを削除（DOブロックで安全に実行）
DO $$ 
BEGIN
  DROP POLICY IF EXISTS users_select_policy ON users;
  DROP POLICY IF EXISTS users_insert_policy ON users;
  DROP POLICY IF EXISTS users_update_policy ON users;
  DROP POLICY IF EXISTS users_delete_policy ON users;
  DROP POLICY IF EXISTS users_policy ON users;
  DROP POLICY IF EXISTS users_service_role_policy ON users;
  RAISE NOTICE '既存のポリシーを削除しました';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'ポリシー削除中にエラーが発生しましたが、続行します: %', SQLERRM;
END $$;

-- インデックスの追加（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 新しいシンプルなポリシーを作成
-- 1. SELECT: 認証されたユーザーは自分自身のレコードを閲覧可能
CREATE POLICY users_select_policy ON users FOR SELECT USING (
  auth.uid() = id
);

-- 2. INSERT: 認証されたユーザーは自分のレコードを作成可能
CREATE POLICY users_insert_policy ON users FOR INSERT WITH CHECK (
  auth.uid() = id
);

-- 3. UPDATE: 認証されたユーザーは自分のレコードを更新可能
CREATE POLICY users_update_policy ON users FOR UPDATE USING (
  auth.uid() = id
) WITH CHECK (
  auth.uid() = id
);

-- 4. DELETE: 認証されたユーザーは自分のレコードを削除可能
CREATE POLICY users_delete_policy ON users FOR DELETE USING (
  auth.uid() = id
);

-- 管理者用の追加ポリシー（service_roleキーを使用する場合）
-- フロントエンドからのアクセスには影響しない
CREATE POLICY users_service_role_policy ON users FOR ALL USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- 確認用クエリ
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

-- インデックス確認
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

