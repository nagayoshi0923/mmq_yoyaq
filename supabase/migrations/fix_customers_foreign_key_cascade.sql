-- ========================================
-- customers.user_id の外部キー制約を CASCADE に修正
-- ========================================
-- 目的：users が削除されたときに customers も自動的に削除されるようにする
-- ========================================

BEGIN;

-- 既存の外部キー制約を削除
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_user_id_fkey;

-- CASCADE 付きで外部キー制約を再作成
ALTER TABLE public.customers
  ADD CONSTRAINT customers_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE
    ON UPDATE NO ACTION;

COMMIT;

-- ========================================
-- 修正確認
-- ========================================
SELECT
  tc.table_name,
  kcu.column_name,
  rc.delete_rule,
  CASE 
    WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE'
    ELSE '❌ ' || rc.delete_rule
  END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.table_schema = 'public'
  AND tc.table_name = 'customers'
  AND kcu.column_name = 'user_id';

