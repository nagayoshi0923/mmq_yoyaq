-- ユーザー管理機能のためのRLSポリシー更新
-- 管理者は全ユーザーにアクセス可能、一般ユーザーは自分自身のみ

-- 既存のポリシーを削除
DROP POLICY IF EXISTS users_policy ON users;

-- 新しいポリシーを作成
-- 1. SELECT: 管理者は全ユーザー表示可能、一般ユーザーは自分のみ
CREATE POLICY users_select_policy ON users FOR SELECT USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
);

-- 2. INSERT: 認証されたユーザーは自分のレコードを作成可能
CREATE POLICY users_insert_policy ON users FOR INSERT WITH CHECK (
  auth.uid() = id
);

-- 3. UPDATE: 管理者は全ユーザー更新可能、一般ユーザーは自分のみ
CREATE POLICY users_update_policy ON users FOR UPDATE USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
) WITH CHECK (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
);

-- 4. DELETE: 管理者のみ削除可能
CREATE POLICY users_delete_policy ON users FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
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

