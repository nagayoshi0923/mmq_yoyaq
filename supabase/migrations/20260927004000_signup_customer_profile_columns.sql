-- Customer aggregates live in customer_org_stats, not customers.
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
