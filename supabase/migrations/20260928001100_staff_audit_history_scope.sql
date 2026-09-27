-- 改名・在籍変更の監査をスタッフの所属組織で参照できるようにする。
-- 過去ログの組織は推測で補完しない。既存RLS/スタッフデータは変更しない。
BEGIN;
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.audit_logs(user_id,organization_id,action,resource_type,resource_id,new_values)
    VALUES(auth.uid(),NEW.organization_id,'INSERT','staff',NEW.id,to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    IF (OLD.name,OLD.role,OLD.status,OLD.email,OLD.user_id,OLD.organization_id)
      IS DISTINCT FROM (NEW.name,NEW.role,NEW.status,NEW.email,NEW.user_id,NEW.organization_id) THEN
      INSERT INTO public.audit_logs(user_id,organization_id,action,resource_type,resource_id,old_values,new_values)
      VALUES(auth.uid(),NEW.organization_id,'UPDATE','staff',NEW.id,
        jsonb_build_object('name',OLD.name,'role',OLD.role,'status',OLD.status,'email',OLD.email,'user_id',OLD.user_id,'organization_id',OLD.organization_id),
        jsonb_build_object('name',NEW.name,'role',NEW.role,'status',NEW.status,'email',NEW.email,'user_id',NEW.user_id,'organization_id',NEW.organization_id));
    END IF;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO public.audit_logs(user_id,organization_id,action,resource_type,resource_id,old_values)
    VALUES(auth.uid(),OLD.organization_id,'DELETE','staff',OLD.id,to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
COMMIT;
