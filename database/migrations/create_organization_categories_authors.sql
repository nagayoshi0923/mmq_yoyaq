-- organization_categories / organization_authors テーブルの作成
-- 作成日: 2026-02-09
-- 概要: カテゴリと作者を正規化テーブルで管理する。
--       既存の TEXT[] ベースの管理から、専用テーブルでの CRUD 管理に移行。
--       既存データを自動移行し、ハードコードの genreOptions もシード。

-- ============================================================
-- 1. organization_categories テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_organization_categories_org_id
  ON public.organization_categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_categories_sort
  ON public.organization_categories(organization_id, sort_order);

-- RLS を有効化
ALTER TABLE public.organization_categories ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 同じ組織のユーザーのみアクセス可能
CREATE POLICY "organization_categories_select_policy"
  ON public.organization_categories FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_categories_insert_policy"
  ON public.organization_categories FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_categories_update_policy"
  ON public.organization_categories FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_categories_delete_policy"
  ON public.organization_categories FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ============================================================
-- 2. organization_authors テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_organization_authors_org_id
  ON public.organization_authors(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_authors_sort
  ON public.organization_authors(organization_id, sort_order);

-- RLS を有効化
ALTER TABLE public.organization_authors ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 同じ組織のユーザーのみアクセス可能
CREATE POLICY "organization_authors_select_policy"
  ON public.organization_authors FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_authors_insert_policy"
  ON public.organization_authors FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_authors_update_policy"
  ON public.organization_authors FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "organization_authors_delete_policy"
  ON public.organization_authors FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ============================================================
-- 3. 既存データの移行: カテゴリ
-- ============================================================
-- organization_scenarios_with_master ビューから使用中のカテゴリを抽出して INSERT
-- ※ ビューはマテリアライズドではないので、直接 organization_scenarios + scenario_masters を参照
INSERT INTO public.organization_categories (organization_id, name, sort_order)
SELECT DISTINCT
  os.organization_id,
  unnest(COALESCE(os.override_genre, sm.genre)) AS name,
  0 AS sort_order
FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON os.scenario_master_id = sm.id
WHERE COALESCE(os.override_genre, sm.genre) IS NOT NULL
  AND array_length(COALESCE(os.override_genre, sm.genre), 1) > 0
ON CONFLICT (organization_id, name) DO NOTHING;

-- ハードコードの genreOptions をすべての組織にシード
-- （既に存在する場合は ON CONFLICT でスキップ）
INSERT INTO public.organization_categories (organization_id, name, sort_order)
SELECT
  o.id AS organization_id,
  g.name,
  g.sort_order
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('ホラー', 1),
    ('ミステリー', 2),
    ('クラシック', 3),
    ('コメディ', 4),
    ('SF', 5),
    ('ファンタジー', 6),
    ('サスペンス', 7),
    ('アクション', 8),
    ('ドラマ', 9),
    ('ロマンス', 10)
) AS g(name, sort_order)
ON CONFLICT (organization_id, name) DO NOTHING;

-- sort_order を名前順で自動付番（既存データ含む）
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY organization_id ORDER BY name
  ) AS rn
  FROM public.organization_categories
)
UPDATE public.organization_categories c
SET sort_order = n.rn
FROM numbered n
WHERE c.id = n.id;

-- ============================================================
-- 4. 既存データの移行: 作者
-- ============================================================
INSERT INTO public.organization_authors (organization_id, name, sort_order)
SELECT DISTINCT
  os.organization_id,
  COALESCE(os.override_author, sm.author) AS name,
  0 AS sort_order
FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON os.scenario_master_id = sm.id
WHERE COALESCE(os.override_author, sm.author) IS NOT NULL
  AND COALESCE(os.override_author, sm.author) != ''
ON CONFLICT (organization_id, name) DO NOTHING;

-- sort_order を名前順で自動付番
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY organization_id ORDER BY name
  ) AS rn
  FROM public.organization_authors
)
UPDATE public.organization_authors a
SET sort_order = n.rn
FROM numbered n
WHERE a.id = n.id;

-- ============================================================
-- 5. 確認用クエリ（コメントアウト）
-- ============================================================
-- SELECT organization_id, COUNT(*) AS category_count
-- FROM organization_categories
-- GROUP BY organization_id;

-- SELECT organization_id, COUNT(*) AS author_count
-- FROM organization_authors
-- GROUP BY organization_id;
