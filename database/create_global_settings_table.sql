-- 全体設定テーブル（店舗に依存しない設定）
-- このテーブルは全システムで1レコードのみ保持する
CREATE TABLE IF NOT EXISTS global_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- シフト提出期間設定
  shift_submission_start_day INTEGER DEFAULT 1, -- 月初から何日目からシフト提出可能か（デフォルト: 1日）
  shift_submission_end_day INTEGER DEFAULT 15, -- 月初から何日目までシフト提出可能か（デフォルト: 15日）
  shift_submission_target_months_ahead INTEGER DEFAULT 1, -- 何ヶ月先のシフトを提出するか（デフォルト: 1ヶ月先）
  
  -- 全体システム設定
  system_name TEXT DEFAULT 'MMQ 予約管理システム',
  maintenance_mode BOOLEAN DEFAULT false,
  maintenance_message TEXT,
  
  -- その他の全体設定（将来的に追加可能）
  enable_email_notifications BOOLEAN DEFAULT true,
  enable_discord_notifications BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期データを挿入（存在しない場合のみ）
INSERT INTO global_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM global_settings LIMIT 1);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_global_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_global_settings_updated_at ON global_settings;
CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON global_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_global_settings_updated_at();

-- RLSポリシー設定
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全体設定を読み取れる
CREATE POLICY "Anyone can read global settings"
  ON global_settings FOR SELECT
  USING (true);

-- 管理者のみが全体設定を更新できる（将来的に役割ベースで制限可能）
CREATE POLICY "Authenticated users can update global settings"
  ON global_settings FOR UPDATE
  USING (auth.role() = 'authenticated');

