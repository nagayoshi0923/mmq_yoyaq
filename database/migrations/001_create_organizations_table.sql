-- マルチテナント対応: 組織テーブル作成
-- 実行日: 2024-12-17

-- ================================================
-- 1. organizations テーブル作成
-- ================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL用識別子（例: queens-waltz, company-a）
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  contact_email TEXT,
  contact_name TEXT,
  is_license_manager BOOLEAN DEFAULT false,  -- ライセンス管理会社かどうか
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',  -- 組織ごとの設定
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- RLS有効化
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- updated_at トリガー
CREATE TRIGGER update_organizations_updated_at 
  BEFORE UPDATE ON organizations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 2. クインズワルツを初期データとして登録
-- ================================================
INSERT INTO organizations (id, name, slug, plan, is_license_manager, is_active, notes)
VALUES (
  'a0000000-0000-0000-0000-000000000001',  -- 固定ID（既存データの紐付け用）
  'クインズワルツ',
  'queens-waltz',
  'pro',
  true,  -- ライセンス管理会社
  true,
  '初期組織（システム管理者）'
)
ON CONFLICT (slug) DO NOTHING;

-- ================================================
-- 3. RLSポリシー（暫定: 認証済みユーザーは全組織閲覧可能）
-- ※ 後で current_organization_id() を使った厳密なポリシーに変更
-- ================================================
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid()
    )
  );

CREATE POLICY organizations_admin_policy ON organizations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT * FROM organizations;

