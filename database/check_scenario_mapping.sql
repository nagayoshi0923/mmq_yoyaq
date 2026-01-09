-- 現在のデータベースのシナリオ一覧を取得
-- Supabase SQL Editorで実行してください

-- 1. 現在のシナリオ一覧（タイトルのみ）
SELECT 
    id,
    title,
    genre,
    participation_fee,
    player_count_min,
    player_count_max,
    duration
FROM scenarios 
WHERE organization_id = (
    SELECT id FROM organizations 
    WHERE name ILIKE '%クインズワルツ%' OR name ILIKE '%queens%'
    LIMIT 1
)
ORDER BY title;

-- 結果をコピーしてここに貼り付けてください
