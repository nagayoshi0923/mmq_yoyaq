-- ========================================
-- customers テーブルの外部キー制約を確認
-- ========================================

SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  tc.constraint_name,
  rc.delete_rule,
  rc.update_rule,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.table_schema = 'public'
  AND tc.table_name = 'customers'
  AND kcu.column_name = 'user_id';


