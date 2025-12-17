-- マルチテナント対応: 組織招待テーブル作成
-- 実行日: 2024-12-17

-- ================================================
-- 1. organization_invitations テーブル作成
-- ================================================
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT[] DEFAULT ARRAY['スタッフ'],
  token TEXT UNIQUE NOT NULL,  -- 招待URL用のトークン
  expires_at TIMESTAMPTZ NOT NULL,  -- 有効期限（デフォルト7日）
  accepted_at TIMESTAMPTZ,  -- 承諾日時
  staff_id UUID REFERENCES staff(id),  -- 承諾後に紐付けられるスタッフID
  created_by UUID REFERENCES staff(id),  -- 招待を送信したスタッフ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_organization_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_organization_id ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_expires_at ON organization_invitations(expires_at);

-- RLS有効化
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- updated_at トリガー
CREATE TRIGGER update_organization_invitations_updated_at 
  BEFORE UPDATE ON organization_invitations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 2. RLSポリシー
-- ================================================

-- 招待の閲覧: 認証済みユーザーで、自組織の招待のみ
CREATE POLICY organization_invitations_select_policy ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    -- 招待トークンでのアクセス（未ログインでも閲覧可能にするため別途処理）
    auth.uid() IS NOT NULL
  );

-- 招待の作成: 自組織の管理者のみ
CREATE POLICY organization_invitations_insert_policy ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT s.organization_id FROM staff s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = auth.uid() AND u.role = 'admin'
    )
  );

-- 招待の更新: 自組織の管理者、または招待を受諾するユーザー
CREATE POLICY organization_invitations_update_policy ON organization_invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT s.organization_id FROM staff s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = auth.uid() AND u.role = 'admin'
    )
    OR
    -- 招待受諾時（accepted_at の更新）
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 招待の削除: 自組織の管理者のみ
CREATE POLICY organization_invitations_delete_policy ON organization_invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT s.organization_id FROM staff s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = auth.uid() AND u.role = 'admin'
    )
  );

-- ================================================
-- 3. 招待トークン生成用の関数
-- ================================================
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

-- ================================================
-- 4. 期限切れ招待を削除するクリーンアップ関数
-- ================================================
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM organization_invitations
  WHERE expires_at < NOW() AND accepted_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT * FROM organization_invitations;

