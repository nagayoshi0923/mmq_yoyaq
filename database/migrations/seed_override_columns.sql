-- organization_scenarios の override_* / custom_* カラムに初期値をセット
-- 作成日: 2026-02-13
-- 概要: 既存の organization_scenarios で override_* が NULL のレコードに、
--       対応する scenario_masters の値をコピーする。
--       これにより、ビュー (COALESCE(override, master)) の結果が
--       全シナリオで一貫した組織固有の値を返すようになる。

-- 1. override_title
UPDATE public.organization_scenarios os
SET override_title = sm.title
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_title IS NULL
  AND sm.title IS NOT NULL;

-- 2. override_author
UPDATE public.organization_scenarios os
SET override_author = sm.author
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_author IS NULL
  AND sm.author IS NOT NULL;

-- 3. override_genre
UPDATE public.organization_scenarios os
SET override_genre = sm.genre
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_genre IS NULL
  AND sm.genre IS NOT NULL;

-- 4. override_difficulty
UPDATE public.organization_scenarios os
SET override_difficulty = sm.difficulty
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_difficulty IS NULL
  AND sm.difficulty IS NOT NULL;

-- 5. override_player_count_min
UPDATE public.organization_scenarios os
SET override_player_count_min = sm.player_count_min
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_player_count_min IS NULL
  AND sm.player_count_min IS NOT NULL;

-- 6. override_player_count_max
UPDATE public.organization_scenarios os
SET override_player_count_max = sm.player_count_max
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.override_player_count_max IS NULL
  AND sm.player_count_max IS NOT NULL;

-- 7. custom_key_visual_url（既存で NULL のものだけ）
UPDATE public.organization_scenarios os
SET custom_key_visual_url = sm.key_visual_url
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.custom_key_visual_url IS NULL
  AND sm.key_visual_url IS NOT NULL;

-- 8. custom_description
UPDATE public.organization_scenarios os
SET custom_description = sm.description
FROM public.scenario_masters sm
WHERE os.scenario_master_id = sm.id
  AND os.custom_description IS NULL
  AND sm.description IS NOT NULL;

-- 確認用クエリ
-- SELECT 
--   COUNT(*) AS total,
--   COUNT(override_title) AS has_title,
--   COUNT(override_author) AS has_author,
--   COUNT(override_genre) AS has_genre
-- FROM organization_scenarios;
