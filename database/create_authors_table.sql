-- 作者テーブル作成
-- 作者のメールアドレスなどを管理するテーブル

CREATE TABLE IF NOT EXISTS authors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_authors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_authors_updated_at
  BEFORE UPDATE ON authors
  FOR EACH ROW
  EXECUTE FUNCTION update_authors_updated_at();

-- RLS設定（adminとstaffのみアクセス可能）
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors are viewable by authenticated users with admin or staff role"
  ON authors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Authors are insertable by authenticated users with admin or staff role"
  ON authors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Authors are updatable by authenticated users with admin or staff role"
  ON authors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Authors are deletable by authenticated users with admin role"
  ON authors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

