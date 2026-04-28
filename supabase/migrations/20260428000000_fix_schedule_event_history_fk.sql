-- 20260428000000: schedule_event_history の外部キー制約を修正
--
-- 問題: schedule_event_history.schedule_event_id が
--       NOT NULL + ON DELETE CASCADE になっているため、
--       公演を削除すると履歴レコードも連鎖削除されてしまう。
--
-- 解決策:
--   1. schedule_event_id カラムを NULL 許容に変更
--   2. FK制約を ON DELETE SET NULL に変更
--      → 公演削除後も履歴は残り、schedule_event_id が NULL になる

-- 1. schedule_event_id を NULL 許容にする
ALTER TABLE public.schedule_event_history
  ALTER COLUMN schedule_event_id DROP NOT NULL;

-- 2. 既存の CASCADE FK 制約を削除
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'schedule_event_history'
    AND tc.table_schema = 'public'
    AND kcu.column_name = 'schedule_event_id'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.schedule_event_history DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No FK constraint found for schedule_event_id (skipped)';
  END IF;
END $$;

-- 3. ON DELETE SET NULL で再作成
--    公演が削除されても履歴レコードは残る（schedule_event_id が NULL になる）
ALTER TABLE public.schedule_event_history
  ADD CONSTRAINT schedule_event_history_schedule_event_id_fkey
  FOREIGN KEY (schedule_event_id)
  REFERENCES public.schedule_events(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ schedule_event_history.schedule_event_id を NULL 許容に変更しました';
  RAISE NOTICE '✅ FK制約を ON DELETE CASCADE → ON DELETE SET NULL に変更しました';
  RAISE NOTICE '   公演を削除しても履歴は削除されず、schedule_event_id が NULL になります';
END $$;
