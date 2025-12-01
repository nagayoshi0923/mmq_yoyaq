-- shift_submissions テーブルの外部キー制約を修正
-- staff_id は users テーブルではなく staff テーブルを参照すべき

-- 1. 既存の誤った外部キー制約を削除
ALTER TABLE public.shift_submissions 
DROP CONSTRAINT IF EXISTS shift_submissions_staff_id_fkey;

-- 2. 正しい外部キー制約を追加（staff テーブルを参照）
ALTER TABLE public.shift_submissions
  ADD CONSTRAINT shift_submissions_staff_id_fkey
  FOREIGN KEY (staff_id)
  REFERENCES public.staff(id)
  ON DELETE CASCADE;

-- 確認
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'shift_submissions';

