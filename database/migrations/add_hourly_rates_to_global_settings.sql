-- 時間別報酬テーブル方式のサポートを追加
-- 2026-01-02

-- 時間別テーブル方式を使用するかどうかのフラグ
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS use_hourly_table boolean DEFAULT false;

-- 通常公演の時間別報酬テーブル（JSONBで配列として保存）
-- 形式: [{ "hours": 1, "amount": 3300 }, { "hours": 1.5, "amount": 3950 }, ...]
-- hours は 0.5 刻み（30分単位）
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS hourly_rates jsonb DEFAULT '[
  {"hours": 1, "amount": 3300},
  {"hours": 1.5, "amount": 3950},
  {"hours": 2, "amount": 4600},
  {"hours": 2.5, "amount": 5250},
  {"hours": 3, "amount": 5900},
  {"hours": 3.5, "amount": 6550},
  {"hours": 4, "amount": 7200}
]'::jsonb;

-- GMテストの時間別報酬テーブル（30分単位）
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS gm_test_hourly_rates jsonb DEFAULT '[
  {"hours": 1, "amount": 1300},
  {"hours": 1.5, "amount": 1950},
  {"hours": 2, "amount": 2600},
  {"hours": 2.5, "amount": 3250},
  {"hours": 3, "amount": 3900},
  {"hours": 3.5, "amount": 4550},
  {"hours": 4, "amount": 5200}
]'::jsonb;

-- コメント追加
COMMENT ON COLUMN global_settings.use_hourly_table IS '時間別テーブル方式を使用するかどうか（false=計算式方式）';
COMMENT ON COLUMN global_settings.hourly_rates IS '通常公演の時間別報酬テーブル（JSONBで配列として保存）';
COMMENT ON COLUMN global_settings.gm_test_hourly_rates IS 'GMテストの時間別報酬テーブル（JSONBで配列として保存）';

