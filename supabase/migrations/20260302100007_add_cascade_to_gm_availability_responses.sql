-- 20260302100007: gm_availability_responses の外部キー制約を CASCADE に変更
--
-- 問題: gm_availability_responses.reservation_id の外部キー制約が RESTRICT で、
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
    AND tc.table_name = 'gm_availability_responses'
    AND kcu.column_name = 'reservation_id'
  LIMIT 1;
  
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gm_availability_responses DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  END IF;
END $$;

-- CASCADE で再作成
ALTER TABLE public.gm_availability_responses
ADD CONSTRAINT gm_availability_responses_reservation_id_fkey
  FOREIGN KEY (reservation_id)
  REFERENCES public.reservations(id)
  ON DELETE CASCADE;

-- coupon_usages も同様に CASCADE に変更
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'coupon_usages'
    AND kcu.column_name = 'reservation_id'
  LIMIT 1;
  
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.coupon_usages DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  END IF;
END $$;

ALTER TABLE public.coupon_usages
ADD CONSTRAINT coupon_usages_reservation_id_fkey
  FOREIGN KEY (reservation_id)
  REFERENCES public.reservations(id)
  ON DELETE CASCADE;

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ 外部キー制約を ON DELETE CASCADE に変更しました';
  RAISE NOTICE '   - gm_availability_responses.reservation_id';
  RAISE NOTICE '   - coupon_usages.reservation_id';
  RAISE NOTICE '   これにより、予約削除時に依存データも自動削除されます';
END $$;
