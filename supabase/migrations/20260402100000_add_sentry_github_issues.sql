-- Sentry -> GitHub Issue の対応テーブル
-- 重複作成防止のために sentry_issue_id を永続化する
-- このテーブルはシステムレベルのデータ（auth_logs と同様）で organization_id は不要

CREATE TABLE IF NOT EXISTS sentry_github_issues (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sentry_issue_id text        NOT NULL,
  sentry_event_id text,
  sentry_project  text        NOT NULL DEFAULT '',
  sentry_environment text     NOT NULL DEFAULT '',
  github_issue_number integer NOT NULL,
  github_issue_url    text    NOT NULL,
  github_repo         text    NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sentry_github_issues_sentry_issue_id_key UNIQUE (sentry_issue_id)
);

-- インデックス（sentry_issue_id は UNIQUE で既に btree index が作られるが明示的に定義）
CREATE INDEX IF NOT EXISTS idx_sentry_github_issues_sentry_issue_id
  ON sentry_github_issues (sentry_issue_id);

CREATE INDEX IF NOT EXISTS idx_sentry_github_issues_created_at
  ON sentry_github_issues (created_at DESC);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_sentry_github_issues_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sentry_github_issues_updated_at ON sentry_github_issues;
CREATE TRIGGER trg_sentry_github_issues_updated_at
  BEFORE UPDATE ON sentry_github_issues
  FOR EACH ROW EXECUTE FUNCTION update_sentry_github_issues_updated_at();

-- RLS 有効化（service_role のみ読み書き可能）
ALTER TABLE sentry_github_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON sentry_github_issues;
CREATE POLICY "service_role_full_access" ON sentry_github_issues
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- anon / authenticated はアクセス不可（ポリシー未定義 = デフォルト拒否）
