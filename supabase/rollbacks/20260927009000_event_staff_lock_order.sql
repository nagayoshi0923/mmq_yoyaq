BEGIN;
CREATE OR REPLACE FUNCTION public.sync_event_staff_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  previous jsonb;
  prior jsonb;
  gm_name text;
  gm_id uuid;
  gm_role text;
  gm_status text;
  gm_role_confirmed boolean;
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
    ELSIF prior IS NOT NULL AND prior->>'resolution_status' <> 'duplicate' THEN
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
    gm_role_confirmed := coalesce(nullif(NEW.gm_roles->>gm_name,'') IS NOT NULL,false)
      OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(NEW.gm_roles,'{}'::jsonb)) key
        WHERE NOT(key=ANY(coalesce(NEW.gms,ARRAY[]::text[]))));
    INSERT INTO public.schedule_event_staff_assignments VALUES(NEW.id,position,NEW.organization_id,gm_id,gm_name,gm_role,gm_status,gm_role_confirmed);
  END LOOP;
  RETURN NEW;
END $function$
;
NOTIFY pgrst, 'reload schema';
COMMIT;
