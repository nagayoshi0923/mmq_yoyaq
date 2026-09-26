ALTER TABLE public.organization_signup_claims ADD COLUMN IF NOT EXISTS consumed_transaction bigint;
CREATE OR REPLACE FUNCTION public.consume_organization_signup_claim(p_org_id uuid,p_token text,p_user_id uuid,p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,extensions,pg_temp AS $function$
DECLARE v_claim public.organization_signup_claims%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=p_org_id AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '登録対象の組織が見つかりません' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_claim FROM public.organization_signup_claims WHERE organization_id=p_org_id FOR UPDATE;
 IF NOT FOUND OR p_user_id IS NULL OR p_email IS NULL OR v_claim.email<>lower(trim(p_email))
   OR NOT (coalesce(v_claim.token_hash=extensions.digest(p_token,'sha256'),false)
       OR coalesce(v_claim.created_by=p_user_id AND auth.uid()=p_user_id,false)) THEN
   RAISE EXCEPTION '組織の登録権限を確認できません。登録画面からやり直してください' USING ERRCODE='42501';
 END IF;
 IF v_claim.consumed_at IS NOT NULL THEN
   IF v_claim.consumed_by=p_user_id AND EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id AND organization_id=p_org_id AND role='admin') THEN RETURN; END IF;
   RAISE EXCEPTION 'この組織の登録手続きは完了しています' USING ERRCODE='42501';
 END IF;
 IF v_claim.expires_at<=clock_timestamp() THEN RAISE EXCEPTION '組織登録の有効期限が切れました。登録画面からやり直してください' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.users WHERE organization_id=p_org_id)
   OR EXISTS(SELECT 1 FROM public.staff WHERE organization_id=p_org_id) THEN
   RAISE EXCEPTION '登録済みの組織を新規取得することはできません' USING ERRCODE='42501';
 END IF;
 UPDATE public.organization_signup_claims SET consumed_by=p_user_id,consumed_at=clock_timestamp(),consumed_transaction=txid_current() WHERE organization_id=p_org_id;
END;
$function$;
-- QW-20260917-001 #523. Preserve the UI's explicit retirement state.
ALTER TABLE public.staff DROP CONSTRAINT staff_status_check;
ALTER TABLE public.staff ADD CONSTRAINT staff_status_check CHECK(status IN('active','inactive','on-leave','resigned'));
-- Follow-up #523: treat resigned as revoked; clear users.organization_id on customerization.
CREATE OR REPLACE FUNCTION public.guard_staff_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE v_org uuid; v_actor public.users%ROWTYPE; v_target public.users%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id,NEW.organization_id,NEW.role,NEW.status)
   IS NOT DISTINCT FROM (OLD.user_id,OLD.organization_id,OLD.role,OLD.status) THEN RETURN NEW; END IF;
 v_org := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
   RAISE EXCEPTION 'スタッフを別の組織へ移動することはできません' USING ERRCODE='42501';
 END IF;
 IF coalesce(auth.role(),'') <> 'service_role'
   AND NOT (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin','supabase_auth_admin') AND current_setting('role') IN ('none','postgres','supabase_admin','supabase_auth_admin')) THEN
   SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
   IF NOT FOUND OR v_actor.organization_id IS DISTINCT FROM v_org OR v_actor.role NOT IN ('admin','license_admin')
      OR (v_actor.role <> 'license_admin' AND EXISTS(SELECT 1 FROM public.staff WHERE user_id=v_actor.id AND status IN ('inactive','resigned'))) THEN
     RAISE EXCEPTION 'スタッフの連携・役割・利用状態の変更には管理者権限が必要です' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.user_id IS NOT NULL THEN
   SELECT * INTO v_target FROM public.users WHERE id=NEW.user_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION '連携先のユーザーが見つかりません' USING ERRCODE='23503'; END IF;
   IF v_target.organization_id IS NOT NULL AND v_target.organization_id IS DISTINCT FROM v_org THEN
     RAISE EXCEPTION '他組織のユーザーを連携することはできません' USING ERRCODE='42501';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_staff_account_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE v_ids uuid[]; v_id uuid; v_user public.users%ROWTYPE; v_staff public.staff%ROWTYPE; v_role public.app_role;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id,NEW.organization_id,NEW.role,NEW.status)
   IS NOT DISTINCT FROM (OLD.user_id,OLD.organization_id,OLD.role,OLD.status) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN v_ids:=ARRAY[NEW.user_id];
 ELSIF TG_OP='DELETE' THEN v_ids:=ARRAY[OLD.user_id];
 ELSE v_ids:=ARRAY[OLD.user_id,NEW.user_id]; END IF;
 FOR v_id IN SELECT DISTINCT x from unnest(v_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
   SELECT * INTO v_user FROM public.users WHERE id=v_id FOR UPDATE;
   IF NOT FOUND THEN CONTINUE; END IF;
   SELECT * INTO v_staff FROM public.staff WHERE user_id=v_id;
   -- A license administrator's permission is independent of staff membership.
   IF v_user.role='license_admin' THEN
     IF v_staff.id IS NOT NULL AND v_user.organization_id IS NULL THEN
       UPDATE public.users SET organization_id=v_staff.organization_id WHERE id=v_id;
     END IF;
     CONTINUE;
   END IF;
   INSERT INTO public.staff_account_access(user_id,organization_id) VALUES(v_id,coalesce(v_staff.organization_id,v_user.organization_id,(SELECT organization_id FROM public.staff_account_access WHERE user_id=v_id),CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END)) ON CONFLICT(user_id) DO NOTHING;
   v_role := CASE WHEN v_staff.id IS NULL OR v_staff.status IN ('inactive','resigned') THEN 'customer'::public.app_role
     WHEN coalesce(v_staff.role,'{}'::text[]) && ARRAY['admin','管理者'] THEN 'admin'::public.app_role
     ELSE 'staff'::public.app_role END;
   UPDATE public.users SET role=v_role,
      organization_id=CASE WHEN v_role='customer' THEN NULL ELSE coalesce(v_staff.organization_id,v_user.organization_id) END,
      updated_at=clock_timestamp() WHERE id=v_id;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_link_staff_account(p_actor_id uuid,p_staff_id uuid,p_user_id uuid,p_email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE v_actor public.users%ROWTYPE; v_staff public.staff%ROWTYPE; v_user public.users%ROWTYPE;
BEGIN
 SELECT * INTO v_actor FROM public.users WHERE id=p_actor_id;
 IF NOT FOUND OR v_actor.role NOT IN ('admin','license_admin') OR v_actor.organization_id IS NULL
   OR (v_actor.role<>'license_admin' AND EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor_id AND status IN ('inactive','resigned'))) THEN
   RAISE EXCEPTION '管理者権限が必要です' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=v_actor.organization_id FOR UPDATE;
 SELECT * INTO v_staff FROM public.staff WHERE id=p_staff_id FOR UPDATE;
 IF NOT FOUND OR v_staff.organization_id IS DISTINCT FROM v_actor.organization_id THEN
   RAISE EXCEPTION '対象スタッフが見つからないか、組織が異なります' USING ERRCODE='42501';
 END IF;
 IF p_user_id IS NOT NULL THEN
   SELECT * INTO v_user FROM public.users WHERE id=p_user_id FOR UPDATE;
   IF NOT FOUND OR (v_user.organization_id IS NOT NULL AND v_user.organization_id IS DISTINCT FROM v_staff.organization_id) THEN
     RAISE EXCEPTION '連携先が見つからないか、組織が異なります' USING ERRCODE='42501';
   END IF;
   IF EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_user_id AND organization_id<>v_staff.organization_id) THEN
     RAISE EXCEPTION '他組織のスタッフとの連携を移すことはできません' USING ERRCODE='42501';
   END IF;
   UPDATE public.staff SET user_id=NULL WHERE user_id=p_user_id AND id<>p_staff_id;
 END IF;
 UPDATE public.staff SET user_id=p_user_id,email=CASE WHEN p_email IS NOT NULL THEN p_email ELSE email END
 WHERE id=p_staff_id;
 RETURN p_staff_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_staff_derived_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE v_staff public.staff%ROWTYPE; v_expected public.app_role;
BEGIN
 IF NEW.role<>'license_admin' THEN
   IF NEW.role='admin' AND NEW.id=auth.uid() AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=NEW.id)
      AND EXISTS(SELECT 1 FROM public.organization_signup_claims WHERE organization_id=NEW.organization_id AND consumed_by=NEW.id AND consumed_transaction=txid_current()) THEN RETURN NEW; END IF;
   IF NEW.role='customer' AND (EXISTS(SELECT 1 FROM public.staff WHERE user_id=NEW.id AND status IN('inactive','resigned'))
      OR (EXISTS(SELECT 1 FROM public.staff_account_access WHERE user_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=NEW.id))) THEN NEW.organization_id:=NULL; END IF;
 END IF;
 IF NEW.role IS NOT DISTINCT FROM OLD.role OR NEW.role='license_admin' THEN RETURN NEW; END IF;
 SELECT * INTO v_staff FROM public.staff WHERE user_id=NEW.id;
 IF NOT FOUND THEN
   IF NEW.role IN ('staff','admin') AND EXISTS(SELECT 1 FROM public.staff_account_access WHERE user_id=NEW.id) THEN
     RAISE EXCEPTION '解除済みアカウントの業務権限を再開するにはスタッフを再連携してください' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 v_expected:=CASE WHEN v_staff.status IN ('inactive','resigned') THEN 'customer'::public.app_role
   WHEN coalesce(v_staff.role,'{}'::text[]) && ARRAY['admin','管理者'] THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END;
 IF NEW.role IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION '連携済みアカウントの権限はスタッフの役割・利用状態から変更してください' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,pg_temp AS $function$
DECLARE v_user public.users%ROWTYPE; v_staff public.staff%ROWTYPE;
BEGIN
 SELECT * INTO v_user FROM public.users WHERE id=auth.uid();
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- License administration is independent of staff employment.
 IF v_user.role='license_admin' THEN RETURN v_user.organization_id; END IF;
 SELECT * INTO v_staff FROM public.staff WHERE user_id=auth.uid();
 IF FOUND THEN
   IF v_staff.status IN ('inactive','resigned') THEN RETURN NULL; END IF;
   RETURN coalesce(v_user.organization_id,v_staff.organization_id);
 END IF;
 IF EXISTS(SELECT 1 FROM public.staff_account_access WHERE user_id=auth.uid()) THEN RETURN NULL; END IF;
 -- Preserve pre-existing profiles without a staff lifecycle (including invitations).
 RETURN v_user.organization_id;
END;
$function$;

DROP TRIGGER guard_staff_derived_user_role ON public.users;
CREATE TRIGGER guard_staff_derived_user_role BEFORE UPDATE OF role,organization_id ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_staff_derived_user_role();
