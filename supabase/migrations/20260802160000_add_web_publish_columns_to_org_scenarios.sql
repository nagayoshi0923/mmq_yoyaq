-- YOYAQ-007 (Phase 2): 公式サイト(queenswaltz.jp)向け 公開シナリオAPIのための
-- HP掲載フラグ・表示順カラム追加 と slug の一意性保証。
-- 設計の正: docs/HP_PUBLIC_SCENARIO_API.md §4-1 / §6。
--
-- ⚠️ このmigrationは監督経由でPO/Claudeが /db-change 手順で適用する。ここでは適用しない。
--
-- ③ の部分UNIQUEインデックスは、同一組織内で slug が重複していると失敗する。
--    適用前に以下で重複を検出し、あれば先にデータ側で解消すること:
--
--    SELECT organization_id, slug, count(*)
--    FROM public.organization_scenarios
--    WHERE slug IS NOT NULL
--    GROUP BY organization_id, slug
--    HAVING count(*) > 1;

-- ① HP掲載フラグ・表示順（DEFAULT true はPO決定「available 181件を全部掲載」に対応。値は変えない）
ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS web_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS web_display_order integer;

COMMENT ON COLUMN public.organization_scenarios.web_published
  IS '公式サイト(queenswaltz.jp)への掲載可否。org_status=available かつ true のものだけ公開APIに出る';
COMMENT ON COLUMN public.organization_scenarios.web_display_order
  IS '公式サイト一覧の表示順。NULL は末尾';

-- ② 掲載対象の部分インデックス（公開APIのフィルタ用）
CREATE INDEX IF NOT EXISTS idx_org_scenarios_web_published
  ON public.organization_scenarios (organization_id, web_published)
  WHERE web_published;

-- ③ slug の一意性保証（公開URLの一意性）。既存インデックス idx_org_scenarios_slug は非UNIQUE。
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_scenarios_slug
  ON public.organization_scenarios (organization_id, slug)
  WHERE slug IS NOT NULL;
