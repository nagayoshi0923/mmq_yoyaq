-- シナリオに追加準備時間カラムを追加
-- デフォルトは0分（通常の準備時間のみ）
-- 例: 90分の事前準備が必要な場合は30を設定（通常60分 + 追加30分 = 90分）

ALTER TABLE public.scenarios
ADD COLUMN IF NOT EXISTS extra_preparation_time integer DEFAULT 0;

COMMENT ON COLUMN public.scenarios.extra_preparation_time IS '追加準備時間（分）。通常の60分に加算される。例: 30を設定すると合計90分の準備時間になる';

