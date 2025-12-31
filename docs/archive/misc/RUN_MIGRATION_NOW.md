# 🚨 重要: マイグレーションを実行してください

複数日程選択が動作しない原因：
- `gm_availability_responses`テーブルに`response_history`カラムが存在しない可能性があります

## 今すぐ実行する手順

### 1. Supabase Dashboardにアクセス
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/editor

### 2. SQL Editorを開く
左メニュー → SQL Editor

### 3. 以下のSQLを貼り付けて実行

```sql
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
```

### 4. 「Run」ボタンをクリック

成功すると「Success. No rows returned」と表示されます。

### 5. 確認

```sql
-- カラムが追加されたか確認
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'gm_availability_responses'
ORDER BY ordinal_position;
```

`response_history` カラムが `jsonb` 型で存在することを確認してください。

## 実行後

マイグレーション完了後、複数日程選択が正常に動作するようになります！

新しい貸切リクエストで試してみてください。

