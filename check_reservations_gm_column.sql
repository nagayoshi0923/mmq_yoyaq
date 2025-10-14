-- reservationsテーブルのGM関連カラムを確認
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'reservations' 
AND column_name LIKE '%gm%'
ORDER BY ordinal_position;
