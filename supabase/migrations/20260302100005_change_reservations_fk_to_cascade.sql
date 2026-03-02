-- 20260302100005: reservations.schedule_event_id の外部キー制約を CASCADE に変更
--
-- 問題: ON DELETE RESTRICT により、予約レコードが存在する限り
--       （キャンセル済みでも）公演を削除できない
--
-- 解決策: ON DELETE CASCADE に変更し、公演削除時に関連予約も自動削除

-- 既存の外部キー制約を削除
ALTER TABLE public.reservations
DROP CONSTRAINT IF EXISTS reservations_schedule_event_id_fkey;

-- CASCADE で再作成
ALTER TABLE public.reservations
ADD CONSTRAINT reservations_schedule_event_id_fkey
  FOREIGN KEY (schedule_event_id)
  REFERENCES public.schedule_events(id)
  ON DELETE CASCADE;

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ reservations.schedule_event_id の外部キー制約を ON DELETE CASCADE に変更しました';
  RAISE NOTICE '   これにより、公演削除時に関連する予約も自動的に削除されます';
END $$;
