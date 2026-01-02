-- シナリオにslugカラムを追加
-- slugはURL用の短い識別子（英数字とハイフンのみ）

-- slugカラムを追加
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- slugにユニーク制約を追加（organization_id単位でユニーク）
-- 同じ組織内で重複不可、異なる組織間では重複OK
CREATE UNIQUE INDEX IF NOT EXISTS scenarios_org_slug_unique 
ON scenarios (organization_id, slug) 
WHERE slug IS NOT NULL;

-- slugのフォーマット制約（英数字とハイフンのみ、小文字）
ALTER TABLE scenarios ADD CONSTRAINT slug_format_check 
CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]+$');

-- コメント
COMMENT ON COLUMN scenarios.slug IS 'URL用の短い識別子（英数字とハイフンのみ）';

