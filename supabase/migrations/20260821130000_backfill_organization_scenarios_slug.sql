-- 公開URL用に organization_scenarios.slug の欠損を埋める。
-- 破壊的変更なし。UNIQUE (organization_id, slug) は既存の部分インデックスを使う。

-- 1) 同じマスタで slug がある行からコピー
UPDATE public.organization_scenarios os
SET slug = src.slug
FROM (
  SELECT DISTINCT ON (scenario_master_id)
    scenario_master_id,
    slug
  FROM public.organization_scenarios
  WHERE slug IS NOT NULL
    AND btrim(slug) <> ''
  ORDER BY scenario_master_id, updated_at DESC NULLS LAST
) src
WHERE os.slug IS NULL
  AND os.scenario_master_id = src.scenario_master_id;

-- 2) まだ NULL ならマスタ ID から一意な slug を付ける
UPDATE public.organization_scenarios os
SET slug = 's-' || replace(os.scenario_master_id::text, '-', '')
WHERE os.slug IS NULL;
