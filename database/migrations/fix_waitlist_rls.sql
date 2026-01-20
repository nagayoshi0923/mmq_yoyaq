-- キャンセル待ちテーブルのRLSポリシー修正
-- auth.users への直接アクセスを auth.jwt() や auth.email() に変更
--
-- セキュリティ注意:
-- - 未認証ユーザーもINSERT可能にしています（予約サイトからの登録のため）
-- - スパム対策として、フロントエンド側でレート制限やCAPTCHAを検討してください
-- - または、notify-waitlist Edge Function でメール認証を要求することも検討

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Organization members can insert waitlist" ON waitlist;
DROP POLICY IF EXISTS "Organization members can update waitlist" ON waitlist;
DROP POLICY IF EXISTS "Organization members can delete waitlist" ON waitlist;
DROP POLICY IF EXISTS "Organization members can view waitlist" ON waitlist;

-- 修正版ポリシー（auth.email() を使用）
-- SELECT: 組織メンバーまたは自分のキャンセル待ち
CREATE POLICY "Organization members can view waitlist" ON waitlist
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = auth.email()
  );

-- INSERT: 組織メンバーまたは認証済みユーザー（自分のメールで登録）
CREATE POLICY "Anyone can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (
    -- 組織メンバー
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    -- 認証済みユーザーが自分のメールで登録
    customer_email = auth.email()
    OR
    -- 未認証でも登録可能（customer_emailは自由記入）
    -- ただしorganization_idは有効な組織である必要あり
    (
      auth.uid() IS NULL 
      AND EXISTS (SELECT 1 FROM organizations WHERE id = organization_id AND is_active = true)
    )
  );

-- UPDATE: 組織メンバーまたは自分のキャンセル待ち
CREATE POLICY "Organization members can update waitlist" ON waitlist
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = auth.email()
  );

-- DELETE: 組織メンバーまたは自分のキャンセル待ち
CREATE POLICY "Organization members can delete waitlist" ON waitlist
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = auth.email()
  );

-- 確認
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'waitlist';

