-- 既存のreservation_settingsテーブルにcancellation_feesカラムを追加
-- このスクリプトは既にテーブルが存在する場合に使用してください

ALTER TABLE reservation_settings 
ADD COLUMN IF NOT EXISTS cancellation_fees JSONB DEFAULT '[
  {"hours_before": 168, "fee_percentage": 0, "description": "1週間前まで無料"},
  {"hours_before": 72, "fee_percentage": 30, "description": "3日前まで30%"},
  {"hours_before": 24, "fee_percentage": 50, "description": "前日まで50%"},
  {"hours_before": 0, "fee_percentage": 100, "description": "当日100%"}
]'::JSONB;

-- 既存のレコードにデフォルト値を設定
UPDATE reservation_settings
SET cancellation_fees = '[
  {"hours_before": 168, "fee_percentage": 0, "description": "1週間前まで無料"},
  {"hours_before": 72, "fee_percentage": 30, "description": "3日前まで30%"},
  {"hours_before": 24, "fee_percentage": 50, "description": "前日まで50%"},
  {"hours_before": 0, "fee_percentage": 100, "description": "当日100%"}
]'::JSONB
WHERE cancellation_fees IS NULL;
