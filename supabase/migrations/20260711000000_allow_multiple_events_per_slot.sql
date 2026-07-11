-- 同一枠（日付×店舗×時間帯）に複数公演を許可する
-- UNIQUE インデックスを外し、検索用の通常インデックスに置換
-- ロールバック:
--   DROP INDEX IF EXISTS public.idx_schedule_events_slot;
--   CREATE UNIQUE INDEX idx_schedule_events_unique_slot ON public.schedule_events
--     USING btree (date, store_id, time_slot, organization_id) WHERE (is_cancelled = false);
--   ※同一枠に複数公演が既に存在する場合は解消してから実行すること

DROP INDEX IF EXISTS public.idx_schedule_events_unique_slot;

CREATE INDEX IF NOT EXISTS idx_schedule_events_slot
  ON public.schedule_events USING btree (date, store_id, time_slot, organization_id)
  WHERE (is_cancelled = false);
