-- 1. staffテーブルのuser_idにユニーク制約があるか確認
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'staff' AND indexdef LIKE '%user_id%';

-- 2. customersテーブルの外部キー制約を確認（ON DELETE CASCADEになっていないか）
SELECT
    tc.constraint_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'customers' AND kcu.column_name = 'user_id';
