-- QW-20260917-001: identity-preserving adapter for existing name-based writers.
-- No event/legacy columns are removed. All changes share the event transaction.
-- Backfill is maintained only in migration 20260921120000.

CREATE TABLE public.schedule_event_staff_assignments (
  event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  staff_name text,
  role text NOT NULL CHECK (role IN ('main','sub','reception','staff','observer')),
  resolution_status text NOT NULL CHECK (resolution_status IN ('resolved','unmatched','duplicate')),
  PRIMARY KEY (event_id, ordinal),
  CHECK ((resolution_status = 'resolved') = (staff_id IS NOT NULL))
);
CREATE UNIQUE INDEX event_staff_identity_unique ON public.schedule_event_staff_assignments(event_id,staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX event_staff_identity_org_staff ON public.schedule_event_staff_assignments(organization_id,staff_id);
ALTER TABLE public.schedule_event_staff_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_event_staff_assignments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.schedule_event_staff_assignments TO service_role;

CREATE FUNCTION public.sync_event_staff_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  previous jsonb;
  prior jsonb;
  gm_name text;
  gm_id uuid;
  gm_role text;
  gm_status text;
  position integer := 0;
  occurrences integer;
  role_name text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.gms IS NOT DISTINCT FROM OLD.gms
    AND NEW.gm_roles IS NOT DISTINCT FROM OLD.gm_roles
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id
    AND EXISTS(SELECT 1 FROM public.schedule_event_staff_assignments WHERE event_id=NEW.id) THEN
    RAISE EXCEPTION '担当記録のある公演は組織を変更できません' USING ERRCODE='23514';
  END IF;
  IF NEW.gm_roles IS NOT NULL AND jsonb_typeof(NEW.gm_roles) <> 'object' THEN
    RAISE EXCEPTION '担当役割の形式が不正です' USING ERRCODE='23514';
  END IF;
  FOR role_name IN SELECT jsonb_object_keys(coalesce(NEW.gm_roles,'{}'::jsonb)) LOOP
    IF NOT (role_name = ANY(coalesce(NEW.gms,ARRAY[]::text[])))
      AND (TG_OP='INSERT' OR NOT(coalesce(OLD.gm_roles,'{}'::jsonb) ? role_name)) THEN
      RAISE EXCEPTION '担当名と役割が一致しません。最新の公演を読み込み直してください' USING ERRCODE='23514';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') INTO previous
    FROM public.schedule_event_staff_assignments a WHERE event_id=NEW.id;
  DELETE FROM public.schedule_event_staff_assignments WHERE event_id=NEW.id;
  FOREACH gm_name IN ARRAY coalesce(NEW.gms,ARRAY[]::text[]) LOOP
    position := position + 1;
    SELECT value INTO prior FROM jsonb_array_elements(previous)
      WHERE value->>'staff_name' IS NOT DISTINCT FROM gm_name LIMIT 1;
    SELECT count(*) INTO occurrences FROM unnest(NEW.gms) x(name) WHERE name IS NOT DISTINCT FROM gm_name;
    gm_id := NULL;
    IF occurrences > 1 THEN
      -- Previously imported duplicates may be edited without inventing identities.
      IF prior IS NULL OR prior->>'resolution_status' <> 'duplicate' THEN
        RAISE EXCEPTION '同じスタッフを重複して登録できません' USING ERRCODE='23514';
      END IF;
      gm_status := 'duplicate';
    ELSIF prior IS NOT NULL THEN
      gm_id := (prior->>'staff_id')::uuid;
      gm_status := CASE WHEN gm_id IS NULL THEN 'unmatched' ELSE 'resolved' END;
    ELSE
      SELECT id INTO gm_id FROM public.staff
        WHERE organization_id=NEW.organization_id AND name=gm_name FOR SHARE;
      IF gm_id IS NULL THEN
        RAISE EXCEPTION '担当スタッフを特定できません。最新のスタッフ一覧から選び直してください' USING ERRCODE='23514';
      END IF;
      gm_status := 'resolved';
    END IF;
    IF gm_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.staff WHERE id=gm_id AND organization_id=NEW.organization_id) THEN
      RAISE EXCEPTION '別組織のスタッフは登録できません' USING ERRCODE='23514';
    END IF;
    gm_role := coalesce(nullif(NEW.gm_roles->>gm_name,''),CASE WHEN position=1 THEN 'main' ELSE 'sub' END);
    INSERT INTO public.schedule_event_staff_assignments VALUES(NEW.id,position,NEW.organization_id,gm_id,gm_name,gm_role,gm_status);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_event_staff_identity AFTER INSERT OR UPDATE OF gms,gm_roles,organization_id
ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.sync_event_staff_identity();

-- Rename names and name-keyed roles together. Errors roll back the staff rename.
CREATE FUNCTION public.rename_event_staff_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND EXISTS(
    SELECT 1 FROM public.schedule_event_staff_assignments WHERE staff_id=NEW.id) THEN
    RAISE EXCEPTION '公演担当記録のあるスタッフは組織を変更できません' USING ERRCODE='23514';
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.schedule_events e SET
      gms=array_replace(e.gms,OLD.name,NEW.name),
      gm_roles=CASE WHEN coalesce(e.gm_roles,'{}'::jsonb) ? OLD.name
        THEN (e.gm_roles - OLD.name) || jsonb_build_object(NEW.name,e.gm_roles->OLD.name)
        ELSE e.gm_roles END
    WHERE e.organization_id=NEW.organization_id AND EXISTS(
      SELECT 1 FROM public.schedule_event_staff_assignments a WHERE a.event_id=e.id AND a.staff_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rename_event_staff_identity AFTER UPDATE OF name,organization_id ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.rename_event_staff_identity();
REVOKE ALL ON FUNCTION public.sync_event_staff_identity() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rename_event_staff_identity() FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.schedule_event_staff_assignments IS '公演のスタッフID・役割・表示順。旧名入力は公演トリガーで同一トランザクション内変換。未照合履歴は推測せず保持。';

