-- =============================================================================
-- F-1: 収支調整機能 — miscellaneous_transactions に schedule_event_id を追加
-- =============================================================================
-- 背景:
-- ・オーナーの痛点「リストの数値が間違ってたとき直しにくい」「出費・売上の減額を
--   メモできない」の受け皿として、既存 miscellaneous_transactions を
--   「調整エントリ」として使う（income/expense 両方）。
-- ・公演（schedule_events）に紐づけて調整を登録できるよう外部キーを追加する。
--   NULL の場合は公演に紐づかない全社/店舗単位の調整。
-- ・公演削除時は調整メモを残す方が運用上望ましいため ON DELETE SET NULL とする。
--
-- RLS / GRANT は既存（20260704100539 で org 境界封鎖 + GRANT 最小化済み）を
-- そのまま踏襲する。本 migration はカラム追加とインデックスのみで権限は変更しない。
--
-- 冪等: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS で再実行安全。
-- =============================================================================

ALTER TABLE public.miscellaneous_transactions
  ADD COLUMN IF NOT EXISTS schedule_event_id uuid
  REFERENCES public.schedule_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_misc_transactions_schedule_event
  ON public.miscellaneous_transactions(schedule_event_id);

COMMENT ON COLUMN public.miscellaneous_transactions.schedule_event_id IS
  '公演に紐づく収支調整用（F-1）。NULL=公演に紐づかない調整';
