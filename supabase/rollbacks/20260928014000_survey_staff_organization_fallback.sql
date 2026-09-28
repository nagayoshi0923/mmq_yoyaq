-- Restore the function definition verified on both live environments.
CREATE OR REPLACE FUNCTION public.require_survey_question_staff(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid;
BEGIN
 SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
 IF actor IS NOT NULL AND actor_role='license_admin' THEN RETURN; END IF;
 IF actor IS NOT NULL AND COALESCE(actor_role IN ('admin','staff') AND actor_org=p_organization_id,false)
 AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
  AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))) THEN RETURN; END IF;
 RAISE EXCEPTION 'アンケート設定を操作する権限がありません' USING ERRCODE='42501';
END $$;
