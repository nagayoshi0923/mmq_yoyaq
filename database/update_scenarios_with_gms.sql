-- 既存シナリオに担当GMを追加

-- MMQ制作チームのシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['田中太郎', '山田花子'] 
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

UPDATE scenarios 
SET available_gms = ARRAY['田中太郎', '佐藤次郎'] 
WHERE id = '550e8400-e29b-41d4-a716-446655440002';

UPDATE scenarios 
SET available_gms = ARRAY['田中太郎'] 
WHERE id = '550e8400-e29b-41d4-a716-446655440003';

UPDATE scenarios 
SET available_gms = ARRAY['山田花子', '佐藤次郎'] 
WHERE id = '550e8400-e29b-41d4-a716-446655440004';

-- 月影のシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['月影', '田中太郎'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440020';

UPDATE scenarios 
SET available_gms = ARRAY['月影'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440021';

-- 桜咲のシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['桜咲', '山田花子'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440022';

UPDATE scenarios 
SET available_gms = ARRAY['桜咲'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440023';

-- 龍神のシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['龍神', '田中太郎', '佐藤次郎'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440024';

UPDATE scenarios 
SET available_gms = ARRAY['龍神'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440025';

-- 星雲のシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['星雲', '山田花子'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440026';

UPDATE scenarios 
SET available_gms = ARRAY['星雲', '田中太郎'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440027';

-- 古都のシナリオに担当GMを設定
UPDATE scenarios 
SET available_gms = ARRAY['古都', '佐藤次郎'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440028';

UPDATE scenarios 
SET available_gms = ARRAY['古都', '山田花子'] 
WHERE id = '660e8400-e29b-41d4-a716-446655440029';

-- 更新結果を確認
SELECT id, title, author, available_gms 
FROM scenarios 
WHERE available_gms IS NOT NULL AND array_length(available_gms, 1) > 0
ORDER BY title;
