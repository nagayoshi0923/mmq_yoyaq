-- 既存シナリオのGM報酬個別設定を削除
-- これにより、設定ページのデフォルト報酬設定が全シナリオに適用される
-- 2026-01-02

-- gm_costs（旧形式）を空配列に
UPDATE scenarios 
SET gm_costs = '[]'::jsonb
WHERE gm_costs IS NOT NULL AND gm_costs != '[]'::jsonb;

-- 確認用クエリ
-- SELECT id, title, gm_costs FROM scenarios WHERE gm_costs IS NOT NULL AND gm_costs != '[]'::jsonb;

