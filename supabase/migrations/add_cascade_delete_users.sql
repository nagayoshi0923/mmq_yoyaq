-- ユーザー削除時のカスケード削除を設定
-- ユーザーを削除すると、関連する予約・シフト提出・GM可否回答も自動削除される

-- 0. データクリーンアップ：孤立データを確認・削除
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  -- 孤立した予約データを確認
  SELECT COUNT(*) INTO orphan_count
  FROM public.reservations r
  WHERE r.customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.customer_id);
  
  IF orphan_count > 0 THEN
    RAISE NOTICE '⚠️ 孤立した予約データが % 件見つかりました', orphan_count;
    
    -- 孤立データのcustomer_idをNULLに設定（削除ではなく保持）
    UPDATE public.reservations
    SET customer_id = NULL
    WHERE customer_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = customer_id);
    
    RAISE NOTICE '✅ 孤立データのcustomer_idをNULLに設定しました';
  ELSE
    RAISE NOTICE '✅ 孤立した予約データはありません';
  END IF;
END $$;

-- 1. reservations テーブルの外部キー制約を更新
-- 既存の制約を削除して、ON DELETE CASCADE を追加
DO $$
BEGIN
  -- 既存の外部キー制約を確認して削除
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%reservations_customer_id%' 
    AND table_name = 'reservations'
  ) THEN
    EXECUTE 'ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_customer_id_fkey';
  END IF;
  
  -- カスケード削除付きの外部キー制約を追加
  ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;
    
  RAISE NOTICE '✅ reservations テーブルにカスケード削除を設定しました';
END $$;

-- 2. shift_submissions テーブルの孤立データをクリーンアップ
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.shift_submissions s
  WHERE s.staff_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.staff_id);
  
  IF orphan_count > 0 THEN
    RAISE NOTICE '⚠️ 孤立したシフト提出データが % 件見つかりました', orphan_count;
    
    -- 孤立データを削除（シフト提出は削除しても問題ない）
    DELETE FROM public.shift_submissions
    WHERE staff_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = staff_id);
    
    RAISE NOTICE '✅ 孤立したシフト提出データを削除しました';
  ELSE
    RAISE NOTICE '✅ 孤立したシフト提出データはありません';
  END IF;
END $$;

-- 3. shift_submissions テーブルの外部キー制約を更新
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%shift_submissions_staff_id%' 
    AND table_name = 'shift_submissions'
  ) THEN
    EXECUTE 'ALTER TABLE public.shift_submissions DROP CONSTRAINT IF EXISTS shift_submissions_staff_id_fkey';
  END IF;
  
  ALTER TABLE public.shift_submissions
    ADD CONSTRAINT shift_submissions_staff_id_fkey
    FOREIGN KEY (staff_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;
    
  RAISE NOTICE '✅ shift_submissions テーブルにカスケード削除を設定しました';
END $$;

-- 4. gm_availability_responses テーブルの孤立データをクリーンアップ
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.gm_availability_responses g
  WHERE g.staff_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = g.staff_id);
  
  IF orphan_count > 0 THEN
    RAISE NOTICE '⚠️ 孤立したGM可否回答データが % 件見つかりました', orphan_count;
    
    -- 孤立データを削除
    DELETE FROM public.gm_availability_responses
    WHERE staff_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = staff_id);
    
    RAISE NOTICE '✅ 孤立したGM可否回答データを削除しました';
  ELSE
    RAISE NOTICE '✅ 孤立したGM可否回答データはありません';
  END IF;
END $$;

-- 5. gm_availability_responses テーブルの外部キー制約を更新
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%gm_availability_responses_staff_id%' 
    AND table_name = 'gm_availability_responses'
  ) THEN
    EXECUTE 'ALTER TABLE public.gm_availability_responses DROP CONSTRAINT IF EXISTS gm_availability_responses_staff_id_fkey';
  END IF;
  
  ALTER TABLE public.gm_availability_responses
    ADD CONSTRAINT gm_availability_responses_staff_id_fkey
    FOREIGN KEY (staff_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;
    
  RAISE NOTICE '✅ gm_availability_responses テーブルにカスケード削除を設定しました';
END $$;

-- 6. staff テーブルの孤立データをクリーンアップ（存在する場合）
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'staff'
  ) THEN
    SELECT COUNT(*) INTO orphan_count
    FROM public.staff s
    WHERE s.id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.id);
    
    IF orphan_count > 0 THEN
      RAISE NOTICE '⚠️ 孤立したスタッフデータが % 件見つかりました', orphan_count;
      
      -- 孤立データを削除
      DELETE FROM public.staff
      WHERE id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = id);
      
      RAISE NOTICE '✅ 孤立したスタッフデータを削除しました';
    ELSE
      RAISE NOTICE '✅ 孤立したスタッフデータはありません';
    END IF;
  END IF;
END $$;

-- 7. staff テーブルの外部キー制約を更新（存在する場合）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'staff'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name LIKE '%staff_id%' 
      AND table_name = 'staff'
    ) THEN
      EXECUTE 'ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_id_fkey';
      
      ALTER TABLE public.staff
        ADD CONSTRAINT staff_id_fkey
        FOREIGN KEY (id)
        REFERENCES public.users(id)
        ON DELETE CASCADE;
        
      RAISE NOTICE '✅ staff テーブルにカスケード削除を設定しました';
    END IF;
  END IF;
END $$;

-- 成功メッセージ
SELECT 
  '🎉 カスケード削除の設定が完了しました' AS status,
  'ユーザー削除時に関連データも自動削除されます' AS detail;

