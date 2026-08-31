-- Codex / Discord / 将来の常駐ランナーが共有するAI Manager案件台帳。
-- 顧客個人情報は件名へ複製せず、案件データ契約はAI Manager側のschema_versionで管理する。

CREATE TABLE IF NOT EXISTS public.ai_manager_work_stores (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  mode TEXT NOT NULL DEFAULT 'PRACTICE' CHECK (mode = 'PRACTICE'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  items JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(items) = 'array'),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_manager_work_stores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_manager_work_stores FROM anon, authenticated;
GRANT ALL ON public.ai_manager_work_stores TO service_role;

CREATE OR REPLACE FUNCTION public.replace_ai_manager_work_store(
  p_organization_id UUID,
  p_expected_revision INTEGER,
  p_store JSONB,
  p_updated_by UUID
)
RETURNS TABLE (result_status TEXT, current_revision INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_revision INTEGER;
BEGIN
  IF p_expected_revision < 0
    OR COALESCE((p_store->>'schema_version')::INTEGER, 0) <> 1
    OR COALESCE(p_store->>'mode', '') <> 'PRACTICE'
    OR jsonb_typeof(p_store->'items') <> 'array'
    OR COALESCE((p_store->>'revision')::INTEGER, -1) <> p_expected_revision + 1
  THEN
    RAISE EXCEPTION 'INVALID_WORK_STORE';
  END IF;

  SELECT revision INTO v_current_revision
  FROM public.ai_manager_work_stores
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN
      RETURN QUERY SELECT 'REVISION_CONFLICT'::TEXT, 0;
      RETURN;
    END IF;
    INSERT INTO public.ai_manager_work_stores (
      organization_id, schema_version, mode, revision, items, updated_by
    ) VALUES (
      p_organization_id, 1, 'PRACTICE', 1, p_store->'items', p_updated_by
    );
    RETURN QUERY SELECT 'UPDATED'::TEXT, 1;
    RETURN;
  END IF;

  IF v_current_revision <> p_expected_revision THEN
    RETURN QUERY SELECT 'REVISION_CONFLICT'::TEXT, v_current_revision;
    RETURN;
  END IF;

  UPDATE public.ai_manager_work_stores
  SET revision = p_expected_revision + 1,
      items = p_store->'items',
      updated_by = p_updated_by,
      updated_at = NOW()
  WHERE organization_id = p_organization_id;

  RETURN QUERY SELECT 'UPDATED'::TEXT, p_expected_revision + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_ai_manager_work_store(UUID, INTEGER, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_ai_manager_work_store(UUID, INTEGER, JSONB, UUID)
  TO service_role;

COMMENT ON TABLE public.ai_manager_work_stores IS
  'AI Managerの共通案件台帳。Codex/Discord等の入口間で未完了状態を共有する。';
