-- GM回答テーブルに履歴カラムとDiscord関連カラムを追加

-- response_historyカラムを追加（JSONB配列で履歴を保存）
ALTER TABLE gm_availability_responses 
ADD COLUMN IF NOT EXISTS response_history JSONB DEFAULT '[]'::jsonb;

-- Discord関連カラムを追加
ALTER TABLE gm_availability_responses 
ADD COLUMN IF NOT EXISTS gm_discord_id TEXT,
ADD COLUMN IF NOT EXISTS gm_name TEXT,
ADD COLUMN IF NOT EXISTS response_type TEXT CHECK (response_type IN ('available', 'unavailable', 'pending')) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS selected_candidate_index INTEGER,
ADD COLUMN IF NOT EXISTS response_datetime TIMESTAMPTZ;

-- コメント追加
COMMENT ON COLUMN gm_availability_responses.response_history IS '日程選択の変更履歴（追加・削除のアクション記録）';
COMMENT ON COLUMN gm_availability_responses.gm_discord_id IS 'DiscordユーザーID';
COMMENT ON COLUMN gm_availability_responses.gm_name IS 'Discord表示名';
COMMENT ON COLUMN gm_availability_responses.response_type IS 'available=出勤可能, unavailable=全て不可, pending=未回答';
COMMENT ON COLUMN gm_availability_responses.selected_candidate_index IS '最初に選択された候補インデックス（互換性のため）';
COMMENT ON COLUMN gm_availability_responses.response_datetime IS '最後の回答日時';

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_gm_responses_discord_id ON gm_availability_responses(gm_discord_id);

