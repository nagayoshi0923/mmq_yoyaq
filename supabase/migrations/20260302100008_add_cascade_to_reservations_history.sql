-- 20260302100008: reservations_history の外部キー制約を CASCADE に変更
--
-- 問題: reservations_history.reservation_id の外部キー制約が RESTRICT で、
--       予約削除時にブロックされる
-- 解決策: ON DELETE CASCADE に変更

-- 既存の外部キー制約を削除して再作成
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- reservation_id の外部キー制約名を取得
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'reservations_history'
    AND kcu.column_name = 'reservation_id'
  LIMIT 1;
  
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reservations_history DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  END IF;
END $$;

-- CASCADE で再作成
ALTER TABLE public.reservations_history
ADD CONSTRAINT reservations_history_reservation_id_fkey
  FOREIGN KEY (reservation_id)
  REFERENCES public.reservations(id)
  ON DELETE CASCADE;

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ reservations_history.reservation_id の外部キー制約を ON DELETE CASCADE に変更しました';
END $$;
