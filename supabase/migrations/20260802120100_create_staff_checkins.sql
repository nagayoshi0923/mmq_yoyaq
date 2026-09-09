-- 店舗PCのスタッフ出退勤打刻。
-- 自動クローズは毎日03:00 JST（18:00 UTC）に実行する。
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE public.staff_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.staff_checkins FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.staff_checkins TO authenticated;

CREATE INDEX idx_staff_checkins_org_store_date
  ON public.staff_checkins (organization_id, store_id, checked_in_at);
CREATE INDEX idx_staff_checkins_staff_open
  ON public.staff_checkins (staff_id) WHERE checked_out_at IS NULL;
CREATE UNIQUE INDEX uq_staff_checkins_one_open
  ON public.staff_checkins (staff_id, organization_id) WHERE checked_out_at IS NULL;

ALTER TABLE public.staff_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_checkins_org_select ON public.staff_checkins
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY staff_checkins_org_insert ON public.staff_checkins
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY staff_checkins_org_update ON public.staff_checkins
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE OR REPLACE FUNCTION public.close_open_staff_checkins()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE closed_count INTEGER;
BEGIN
  UPDATE public.staff_checkins
     SET checked_out_at = NOW()
   WHERE checked_out_at IS NULL;
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;
REVOKE ALL ON FUNCTION public.close_open_staff_checkins() FROM PUBLIC, anon, authenticated;

-- 毎日03:00 JST（18:00 UTC）に固定実行する。
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'close-open-staff-checkins';
  PERFORM cron.schedule('close-open-staff-checkins', '0 18 * * *', $job$SELECT public.close_open_staff_checkins();$job$);
END;
$$;

COMMENT ON TABLE public.staff_checkins IS '店舗PCで記録するスタッフの出退勤。毎日03:00 JSTに未退勤を自動退勤とする。';
