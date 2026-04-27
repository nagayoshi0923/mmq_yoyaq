-- =============================================================================
-- マニュアルページ管理テーブル
-- manual_pages: ページ一覧（タイトル・カテゴリ・表示順など）
-- manual_blocks: 各ページのコンテンツブロック（JSONB）
-- =============================================================================

-- =====================
-- 1. manual_pages
-- =====================
CREATE TABLE public.manual_pages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  slug            text        NOT NULL,
  description     text,
  category        text        NOT NULL DEFAULT 'staff'
                              CHECK (category IN ('staff', 'admin')),
  icon_name       text        NOT NULL DEFAULT 'FileText',
  display_order   int         NOT NULL DEFAULT 999,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

-- =====================
-- 2. manual_blocks
-- =====================
CREATE TABLE public.manual_blocks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid        NOT NULL REFERENCES public.manual_pages(id) ON DELETE CASCADE,
  block_type    text        NOT NULL,
  content       jsonb       NOT NULL DEFAULT '{}',
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 3. updated_at トリガー
-- =====================
CREATE OR REPLACE FUNCTION public.set_updated_at_manual()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manual_pages_updated_at
  BEFORE UPDATE ON public.manual_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_manual();

CREATE TRIGGER trg_manual_blocks_updated_at
  BEFORE UPDATE ON public.manual_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_manual();

-- =====================
-- 4. RLS
-- =====================
ALTER TABLE public.manual_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_blocks ENABLE ROW LEVEL SECURITY;

-- manual_pages: スタッフ以上は読み取り可
CREATE POLICY "manual_pages_select_staff" ON public.manual_pages
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND is_staff_or_admin()
  );

-- manual_pages: 管理者のみ作成・更新・削除
CREATE POLICY "manual_pages_insert_admin" ON public.manual_pages
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

CREATE POLICY "manual_pages_update_admin" ON public.manual_pages
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

CREATE POLICY "manual_pages_delete_admin" ON public.manual_pages
  FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND is_org_admin()
  );

-- manual_blocks: ページと同じ組織なら読み取り可
CREATE POLICY "manual_blocks_select_staff" ON public.manual_blocks
  FOR SELECT
  USING (
    is_staff_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.manual_pages mp
      WHERE mp.id = manual_blocks.page_id
        AND mp.organization_id = get_user_organization_id()
    )
  );

-- manual_blocks: 管理者のみ作成・更新・削除
CREATE POLICY "manual_blocks_insert_admin" ON public.manual_blocks
  FOR INSERT
  WITH CHECK (
    is_org_admin()
    AND EXISTS (
      SELECT 1 FROM public.manual_pages mp
      WHERE mp.id = manual_blocks.page_id
        AND mp.organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "manual_blocks_update_admin" ON public.manual_blocks
  FOR UPDATE
  USING (
    is_org_admin()
    AND EXISTS (
      SELECT 1 FROM public.manual_pages mp
      WHERE mp.id = manual_blocks.page_id
        AND mp.organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "manual_blocks_delete_admin" ON public.manual_blocks
  FOR DELETE
  USING (
    is_org_admin()
    AND EXISTS (
      SELECT 1 FROM public.manual_pages mp
      WHERE mp.id = manual_blocks.page_id
        AND mp.organization_id = get_user_organization_id()
    )
  );
