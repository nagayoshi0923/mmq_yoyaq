-- schedule_events テーブルに gm_roles カラムを追加
-- 構造: { "GM名": "main" | "sub" | "staff" }
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS gm_roles JSONB DEFAULT '{}'::jsonb;

-- scenarios テーブルに sub_gm_costs カラムを追加（サブGMの報酬額）
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS sub_gm_costs INTEGER DEFAULT 0;

-- 既存のデータを移行（全てのGMをmainに設定するのは大変なので、NULLまたは空の場合はmainとみなすロジックをアプリ側で実装する）

