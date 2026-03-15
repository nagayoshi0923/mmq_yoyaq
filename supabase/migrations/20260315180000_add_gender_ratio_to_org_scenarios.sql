-- organization_scenarios に男女比カラムを追加
ALTER TABLE public.organization_scenarios
ADD COLUMN IF NOT EXISTS male_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS female_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS other_count INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.organization_scenarios.male_count IS '男性プレイヤー数（NULLの場合は男女比指定なし）';
COMMENT ON COLUMN public.organization_scenarios.female_count IS '女性プレイヤー数（NULLの場合は男女比指定なし）';
COMMENT ON COLUMN public.organization_scenarios.other_count IS 'その他/性別不問プレイヤー数（NULLの場合は設定なし）';
