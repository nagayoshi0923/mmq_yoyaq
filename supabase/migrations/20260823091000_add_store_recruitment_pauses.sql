-- 店舗ごとの公演募集停止 / 貸切募集停止（複数期間）
-- starts_on/ends_on が両方 NULL = 全日程
-- starts_on のみ = その日からずっと
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.is_store_recruitment_paused(uuid, text, date);
--   DROP TABLE IF EXISTS public.store_recruitment_pauses;

CREATE TABLE IF NOT EXISTS public.store_recruitment_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pause_type text NOT NULL CHECK (pause_type IN ('performance', 'private')),
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

CREATE INDEX IF NOT EXISTS idx_store_recruitment_pauses_lookup
  ON public.store_recruitment_pauses (organization_id, store_id, pause_type);

COMMENT ON TABLE public.store_recruitment_pauses IS
  '店舗の公演募集停止・貸切募集停止期間。両方NULLは全日程';

ALTER TABLE public.store_recruitment_pauses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.store_recruitment_pauses FROM PUBLIC;
REVOKE ALL ON public.store_recruitment_pauses FROM anon;
REVOKE ALL ON public.store_recruitment_pauses FROM authenticated;

GRANT SELECT ON public.store_recruitment_pauses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_recruitment_pauses TO authenticated;

DROP POLICY IF EXISTS "authenticated full access" ON public.store_recruitment_pauses;
CREATE POLICY "authenticated full access" ON public.store_recruitment_pauses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon select" ON public.store_recruitment_pauses;
CREATE POLICY "anon select" ON public.store_recruitment_pauses
  FOR SELECT TO anon
  USING (true);

CREATE OR REPLACE FUNCTION public.is_store_recruitment_paused(
  p_store_id uuid,
  p_pause_type text,
  p_date date
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_recruitment_pauses p
    WHERE p.store_id = p_store_id
      AND p.pause_type = p_pause_type
      AND (p.starts_on IS NULL OR p.starts_on <= p_date)
      AND (p.ends_on IS NULL OR p.ends_on >= p_date)
  );
$$;

REVOKE ALL ON FUNCTION public.is_store_recruitment_paused(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_recruitment_paused(uuid, text, date) TO anon, authenticated;

COMMENT ON FUNCTION public.is_store_recruitment_paused(uuid, text, date) IS
  '指定日に店舗の公演募集または貸切募集が停止中か';
