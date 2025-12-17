-- 作者（シナリオ著者）テーブル作成
-- 実行日: 2024-12-17
-- 
-- 目的:
-- - シナリオ著者が自身の作品の公演報告を受け取り・管理できるようにする
-- - 各組織からのライセンス報告を作者が確認できるポータルを提供

-- ================================================
-- 1. authors テーブル作成
-- ================================================
CREATE TABLE IF NOT EXISTS authors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- ログイン用（オプション）
  name TEXT NOT NULL,  -- 本名または筆名
  display_name TEXT,   -- 表示名（公開用）
  email TEXT UNIQUE,   -- 連絡先メールアドレス
  avatar_url TEXT,     -- プロフィール画像
  bio TEXT,            -- 自己紹介
  website_url TEXT,    -- ウェブサイト
  twitter_url TEXT,    -- X（Twitter）
  is_verified BOOLEAN DEFAULT false,  -- 本人確認済み
  is_active BOOLEAN DEFAULT true,
  notification_settings JSONB DEFAULT '{"email_on_report": true, "email_summary": "monthly"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_authors_user_id ON authors(user_id);
CREATE INDEX IF NOT EXISTS idx_authors_email ON authors(email);
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);

-- RLS有効化
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;

-- updated_at トリガー
CREATE TRIGGER update_authors_updated_at 
  BEFORE UPDATE ON authors 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 2. scenarios テーブルに author_id を追加
-- ================================================
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES authors(id);
CREATE INDEX IF NOT EXISTS idx_scenarios_author_id ON scenarios(author_id);

-- ================================================
-- 3. users テーブルの role に 'author' を追加
-- ================================================
-- app_role 型に 'author' を追加（既に存在する場合はスキップ）
DO $$
BEGIN
  -- 既存の app_role 型に 'author' が含まれていない場合のみ追加
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'app_role'::regtype 
    AND enumlabel = 'author'
  ) THEN
    ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'author';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'app_role type modification skipped: %', SQLERRM;
END $$;

-- ================================================
-- 4. 作者向けの公演報告ビュー
-- ================================================
CREATE OR REPLACE VIEW author_performance_reports AS
SELECT 
  a.id AS author_id,
  a.name AS author_name,
  s.id AS scenario_id,
  s.title AS scenario_title,
  o.id AS organization_id,
  o.name AS organization_name,
  epr.id AS report_id,
  epr.performance_date,
  epr.performance_count,
  epr.participant_count,
  epr.venue_name,
  epr.status AS report_status,
  epr.created_at AS reported_at,
  s.license_amount,
  (epr.performance_count * COALESCE(s.license_amount, 0)) AS calculated_license_fee
FROM authors a
JOIN scenarios s ON s.author_id = a.id OR s.author = a.name
JOIN external_performance_reports epr ON epr.scenario_id = s.id
JOIN organizations o ON o.id = epr.organization_id
WHERE epr.status = 'approved';

-- ================================================
-- 5. RLSポリシー
-- ================================================

-- 作者は自分のプロフィールを閲覧・編集可能
CREATE POLICY authors_select_own ON authors
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    -- 管理者は全て閲覧可能
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
    OR
    -- 公開情報として閲覧可能
    is_active = true
  );

CREATE POLICY authors_update_own ON authors
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- 管理者のみ作者を作成・削除可能
CREATE POLICY authors_insert_admin ON authors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
    OR
    -- 自己登録も許可（user_id が自分の場合）
    user_id = auth.uid()
  );

CREATE POLICY authors_delete_admin ON authors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT * FROM authors;
-- SELECT * FROM author_performance_reports WHERE author_id = 'xxx';

