-- 予約締切を「公演開始まで（0時間前）」に統一
-- 背景: 0 を有効値として扱うため、アプリ側も nullish coalescing に統一する（別途対応）

BEGIN;

-- デフォルト値を 0 に設定（新規作成イベント向け）
ALTER TABLE public.schedule_events
  ALTER COLUMN reservation_deadline_hours SET DEFAULT 0;

-- 既存データも 0 に統一
UPDATE public.schedule_events
SET reservation_deadline_hours = 0
WHERE reservation_deadline_hours IS DISTINCT FROM 0;

-- ドキュメントの明確化（既存コメントがあっても上書き）
COMMENT ON COLUMN public.schedule_events.reservation_deadline_hours
  IS '予約締め切り時間（公演開始の何時間前）。0 の場合は公演開始まで予約可。';

-- 当日予約締切も「公演開始まで（0時間前）」に統一（店舗設定、テーブルが存在する場合のみ）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reservation_settings') THEN
    ALTER TABLE public.reservation_settings ALTER COLUMN same_day_booking_cutoff SET DEFAULT 0;
    UPDATE public.reservation_settings SET same_day_booking_cutoff = 0 WHERE same_day_booking_cutoff IS DISTINCT FROM 0;
    COMMENT ON COLUMN public.reservation_settings.same_day_booking_cutoff IS '当日予約締切（公演開始の何時間前）。0 の場合は公演開始まで予約可。';
  END IF;
END $$;

COMMIT;

