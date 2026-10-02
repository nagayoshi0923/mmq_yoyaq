-- QW-20261002-006: 本番に migration 無しで作られていた AI マネージャー連携の表と関数をリポジトリに記録する。
-- 本番には既に存在する（0 行）ため、全て「無ければ作る」。staging には無く、夜間ミラー（本番→staging）が
-- 「relation ai_manager_work_stores does not exist」で止まっていた（2026-10-02）。
-- 定義は本番から読み取ったもの（supabase/structure/prod.json と一致）。

CREATE TABLE IF NOT EXISTS public.ai_manager_work_stores (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  schema_version integer NOT NULL DEFAULT 1 CONSTRAINT ai_manager_work_stores_schema_version_check CHECK (schema_version = 1),
  mode text NOT NULL DEFAULT 'PRACTICE' CONSTRAINT ai_manager_work_stores_mode_check CHECK (mode = 'PRACTICE'),
  revision integer NOT NULL DEFAULT 0 CONSTRAINT ai_manager_work_stores_revision_check CHECK (revision >= 0),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT ai_manager_work_stores_items_check CHECK (jsonb_typeof(items) = 'array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- API からは触らせない（service_role と DB 関数だけ）。RLS 有効・ポリシー無し。
ALTER TABLE public.ai_manager_work_stores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_manager_work_stores FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_manager_work_stores TO service_role;

CREATE OR REPLACE FUNCTION public.replace_ai_manager_work_store(p_organization_id uuid, p_expected_revision integer, p_store jsonb, p_updated_by uuid)
 RETURNS TABLE(result_status text, current_revision integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_ai_manager_work_store(uuid, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_ai_manager_work_store(uuid, integer, jsonb, uuid) TO service_role;
