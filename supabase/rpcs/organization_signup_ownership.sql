-- QW-20260917-001 A29: registration grants belong to their creator, not a public org UUID.
CREATE TABLE IF NOT EXISTS public.organization_signup_claims (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 token_hash bytea NOT NULL,
 email text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '30 minutes'),
 consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 consumed_at timestamptz
);
ALTER TABLE public.organization_signup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_signup_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organization_signup_claims TO service_role;

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
 UPDATE public.organization_signup_claims SET consumed_by=p_user_id,consumed_at=clock_timestamp() WHERE organization_id=p_org_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_organization_signup_claim(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.register_organization_for_signup(p_name text, p_slug text, p_contact_email text, p_store_name text DEFAULT NULL::text, p_store_address text DEFAULT NULL::text, p_store_phone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id        UUID;
  v_store_name    TEXT;
  v_short_name    TEXT;
  v_token text:=encode(extensions.gen_random_bytes(32),'hex');
  v_email text:=lower(trim(p_contact_email));
BEGIN
  IF v_email IS NULL OR v_email='' OR length(v_email)>320 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
    RAISE EXCEPTION '登録者のメールアドレスが必要です' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND lower(coalesce(auth.email(),''))<>v_email THEN
    RAISE EXCEPTION 'ログイン中のメールアドレスで登録してください' USING ERRCODE='42501';
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_name: 組織名は必須です';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'invalid_slug: 識別子は必須です';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9\-]{0,29}$' THEN
    RAISE EXCEPTION 'invalid_slug_format: 識別子は半角英数字とハイフンのみ使用できます';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'slug_already_exists: この識別子は既に使用されています';
  END IF;

  INSERT INTO public.organizations (
    name, slug, plan, contact_email, is_active, is_license_manager, settings
  )
  VALUES (
    trim(p_name), p_slug, 'free',
    COALESCE(nullif(trim(p_contact_email), ''), NULL),
    true, false, '{}'::jsonb
  )
  RETURNING id INTO v_org_id;

  -- 代表店舗を作成（指定されていれば）
  -- ※ initialize_organization_data() トリガーが「臨時会場 1〜5」を別途作るのは継続
  IF p_store_name IS NOT NULL AND trim(p_store_name) != '' THEN
    v_store_name := trim(p_store_name);
    -- short_name は NOT NULL なので名前から作る（先頭6文字、空なら名前そのもの）
    v_short_name := COALESCE(NULLIF(left(v_store_name, 6), ''), v_store_name);

    INSERT INTO public.stores (
      name, short_name, address, phone_number,
      organization_id, status, capacity, rooms, color,
      opening_date, is_temporary,
      created_at, updated_at
    )
    VALUES (
      v_store_name,
      v_short_name,
      NULLIF(trim(COALESCE(p_store_address, '')), ''),
      NULLIF(trim(COALESCE(p_store_phone, '')), ''),
      v_org_id,
      'active',
      6,        -- capacity デフォルト
      1,        -- rooms デフォルト
      '#E60012', -- color デフォルト（テーマカラー）
      CURRENT_DATE,
      false,    -- is_temporary = false（代表店舗）
      NOW(), NOW()
    );
  END IF;

  INSERT INTO public.organization_signup_claims(organization_id,token_hash,email,created_by) VALUES(v_org_id,extensions.digest(v_token,'sha256'),v_email,auth.uid());
  RETURN json_build_object(
    'id',   v_org_id,
    'slug', p_slug,
    'name', trim(p_name),
    'claim_token',v_token
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_organization_as_admin_v2(p_org_id uuid, p_admin_name text, p_claim_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID := auth.uid();
  v_email     TEXT;
  v_org_slug  TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: ログインが必要です';
  END IF;

  -- 組織の存在確認
  SELECT slug INTO v_org_slug
  FROM public.organizations
  WHERE id = p_org_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: 指定された組織が見つかりません';
  END IF;

  -- 既に別の組織に所属していないか確認
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_user_id
      AND organization_id IS NOT NULL
      AND organization_id != p_org_id
  ) THEN
    RAISE EXCEPTION 'already_in_org: このアカウントは既に別の組織に所属しています';
  END IF;

  -- メールアドレスを取得
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  PERFORM public.consume_organization_signup_claim(p_org_id,p_claim_token,v_user_id,v_email);

  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_user_id) THEN RAISE EXCEPTION 'アカウント情報が見つかりません' USING ERRCODE='42501'; END IF;
  -- users レコードを admin に昇格・組織紐付け
  UPDATE public.users
  SET
    role            = 'admin',
    organization_id = p_org_id,
    updated_at      = NOW()
  WHERE id = v_user_id;

  -- staff レコードを作成（未作成の場合のみ）
  INSERT INTO public.staff (
    name, email, user_id, organization_id,
    role, status, stores, ng_days,
    want_to_learn, available_scenarios, availability,
    experience, special_scenarios
  ) VALUES (
    COALESCE(NULLIF(trim(p_admin_name), ''), split_part(v_email, '@', 1)),
    v_email,
    v_user_id,
    p_org_id,
    ARRAY['管理者']::TEXT[],
    'active',
    '{}', '{}', '{}', '{}', '{}', 0, '{}'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    role            = EXCLUDED.role,
    updated_at      = NOW();

  RETURN json_build_object(
    'org_id',   p_org_id,
    'org_slug', v_org_slug
  );
END;
$function$
;


CREATE OR REPLACE FUNCTION public.claim_organization_as_admin(p_org_id uuid,p_admin_name text DEFAULT NULL)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path TO public AS $function$
 SELECT public.claim_organization_as_admin_v2(p_org_id,p_admin_name,NULL);
$function$;
REVOKE ALL ON FUNCTION public.claim_organization_as_admin(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_organization_as_admin(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_organization_as_admin_v2(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_organization_as_admin_v2(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.register_organization_for_signup(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_organization_for_signup(text,text,text,text,text,text) TO anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role       app_role := 'customer';
  v_org_id     UUID;
  v_name       TEXT;
  v_phone      TEXT;
  v_prefecture TEXT;
  v_birth_date DATE;
BEGIN
  -- Self-supplied metadata never grants staff/license permissions.
  v_name       := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_name', '')), '');
  v_phone      := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_phone', '')), '');
  v_prefecture := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_prefecture', '')), '');

  BEGIN
    v_birth_date := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_birth_date', '')), '')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_birth_date := NULL;
  END;

  IF NEW.raw_user_meta_data->>'invited_as'='admin' THEN
    v_org_id:=(NEW.raw_user_meta_data->>'organization_id')::uuid;
    PERFORM public.consume_organization_signup_claim(v_org_id,NEW.raw_user_meta_data->>'organization_claim_token',NEW.id,NEW.email);
    v_role:='admin';
  END IF;

  INSERT INTO public.users (id, email, role, organization_id, created_at, updated_at)
  VALUES (NEW.id, NEW.email, v_role, v_org_id, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    role            = EXCLUDED.role,
    organization_id = COALESCE(EXCLUDED.organization_id, users.organization_id),
    updated_at      = NOW();

  IF v_role = 'admin' AND v_org_id IS NOT NULL THEN
    INSERT INTO public.staff (
      name, email, phone, user_id, organization_id, role, status,
      stores, ng_days, want_to_learn, available_scenarios,
      availability, experience, special_scenarios
    ) VALUES (
      COALESCE(v_name, split_part(NEW.email, '@', 1)),
      NEW.email,
      v_phone,
      NEW.id,
      v_org_id,
      ARRAY['管理者']::TEXT[],
      'active',
      '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[], '{}'::TEXT[],
      '{}'::TEXT[], 0, '{}'::TEXT[]
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- customers INSERT を独立サブブロックで隔離。
    -- ここでの失敗は users / staff INSERT を巻き戻さない。
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM public.customers
        WHERE organization_id = v_org_id
          AND lower(email) = lower(NEW.email)
      ) THEN
        INSERT INTO public.customers (
          user_id, organization_id, name, email, phone,
          prefecture, birth_date,
          notification_settings,
          created_at, updated_at
        ) VALUES (
          NEW.id, v_org_id,
          COALESCE(v_name, split_part(NEW.email, '@', 1)),
          NEW.email,
          v_phone,
          v_prefecture,
          v_birth_date,
          jsonb_build_object(
            'email_notifications',    true,
            'reminder_notifications', true,
            'campaign_notifications', false
          ),
          NOW(), NOW()
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: optional customer profile could not be created';
    END;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollback_orphan_organization_v2(p_org_id uuid,p_claim_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_at  TIMESTAMPTZ;
  v_user_count  INTEGER;
  v_staff_count INTEGER;
  v_claim public.organization_signup_claims%ROWTYPE;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arg: p_org_id is required';
  END IF;

  -- 対象組織の存在確認 + 作成時刻取得
  SELECT created_at INTO v_created_at
  FROM public.organizations
  WHERE id = p_org_id FOR UPDATE;

  IF v_created_at IS NULL THEN
    -- 既に削除済み or 存在しない → idempotent に成功扱い
    RETURN TRUE;
  END IF;

  SELECT * INTO v_claim FROM public.organization_signup_claims WHERE organization_id=p_org_id FOR UPDATE;
  IF NOT FOUND OR v_claim.consumed_at IS NOT NULL OR NOT (
      coalesce(v_claim.token_hash=extensions.digest(p_claim_token,'sha256'),false)
      OR coalesce(auth.uid() IS NOT NULL AND v_claim.created_by=auth.uid(),false)) THEN
    RAISE EXCEPTION 'この組織の登録を取り消す権限がありません' USING ERRCODE='42501';
  END IF;

  -- 安全条件 1: 作成から 10 分以内
  IF v_created_at < NOW() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'org_too_old: 作成から 10 分以上経過した組織は rollback できません';
  END IF;

  -- 安全条件 2: ユーザーが紐づいてない
  SELECT COUNT(*) INTO v_user_count
  FROM public.users
  WHERE organization_id = p_org_id;

  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'org_has_users: ユーザーが紐づいている組織は rollback できません';
  END IF;

  -- 安全条件 3: スタッフが紐づいてない (二重保険)
  SELECT COUNT(*) INTO v_staff_count
  FROM public.staff
  WHERE organization_id = p_org_id;

  IF v_staff_count > 0 THEN
    RAISE EXCEPTION 'org_has_staff: スタッフが紐づいている組織は rollback できません';
  END IF;

  -- 削除実行 (initialize_organization_data() が作る stores / settings を順に除去)
  DELETE FROM public.stores                WHERE organization_id = p_org_id;
  DELETE FROM public.organization_settings WHERE organization_id = p_org_id;
  DELETE FROM public.global_settings       WHERE organization_id = p_org_id;
  DELETE FROM public.organizations         WHERE id = p_org_id;

  RETURN TRUE;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.rollback_orphan_organization(p_org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO public AS $function$
 SELECT public.rollback_orphan_organization_v2(p_org_id,NULL);
$function$;
REVOKE ALL ON FUNCTION public.rollback_orphan_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_orphan_organization(uuid) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rollback_orphan_organization_v2(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_orphan_organization_v2(uuid,text) TO anon,authenticated,service_role;
