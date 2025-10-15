-- gm_availability_responsesテーブルの制約を確認

SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'gm_availability_responses'::regclass
ORDER BY contype, conname;
