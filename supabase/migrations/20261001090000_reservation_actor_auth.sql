-- 認可だけの独立移行。既存データ・RLS・料金・ロック順は変更しない。
-- 未知のRPC本文は55000で停止。staging独自の募集停止判定を保持。
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE v_oid regprocedure := to_regprocedure('public.reservation_actor_is_org_operator(uuid)');
BEGIN
  IF v_oid IS NOT NULL AND md5(pg_get_functiondef(v_oid)) <> '68b16ccb1d772efcd08b6fc074836972' THEN
    RAISE EXCEPTION '既存の認可ヘルパーが確認済み定義と異なります' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('reservation_actor_is_org_operator','create_reservation_with_lock','create_reservation_with_lock_v2','update_reservation_participants','change_reservation_schedule')
      AND p.proowner <> 'postgres'::regrole
  ) THEN
    RAISE EXCEPTION '対象RPCの所有者が確認済み定義と異なります' USING ERRCODE = '55000';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.reservation_actor_is_org_operator(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 対象組織を必須にする。退職・停止・解除は既存の所属判定を使う。
  SELECT auth.uid() IS NOT NULL
    AND p_organization_id IS NOT NULL
    AND public.get_user_organization_id() = p_organization_id
    AND (
      public.is_org_admin()
      OR EXISTS (
        SELECT 1 FROM public.staff
        WHERE user_id = auth.uid()
          AND organization_id = p_organization_id
          AND status = 'active'
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.reservation_actor_is_org_operator(uuid) FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_reservation_with_lock_v2(uuid,integer,uuid,text,text,text,text,text,text,uuid)'::regprocedure) INTO v_definition;
  IF md5(v_definition) IN ('09e0f450b4228961db6f149056ea72eb','d771a94b5bbf2d320a0c9e5526a3eae5') THEN
    v_definition := replace(v_definition, $before$BEGIN
$before$, $after$BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

$after$);
    v_definition := replace(v_definition, $before$  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  v_is_staff := EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND organization_id = v_event_org_id
      AND status = 'active'
  );
$before$, $after$  -- reservation_actor_auth_v1: 引数ではなくJWTの本人／対象組織の業務権限で判定。
  v_caller_org_id := public.get_user_organization_id();
  v_is_admin := COALESCE(public.reservation_actor_is_org_operator(v_event_org_id), false);
  v_is_staff := v_is_admin;
$after$);
    v_definition := replace(v_definition, $before$    END IF;
    IF v_caller_org_id IS NOT NULL AND v_caller_org_id != v_event_org_id THEN
      RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
$before$, $after$$after$);
    v_definition := replace(v_definition, $before$    FROM customers
$before$, $after$    FROM public.customers
$after$);
    v_definition := replace(v_definition, $before$    IF v_is_admin THEN
      NULL;
    ELSIF v_is_staff THEN
      IF v_caller_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'FORBIDDEN_ORG' USING ERRCODE = 'P0010';
      END IF;
    ELSE
      -- customer ロール: 自分自身の予約のみ許可（platform customer は org を問わない）
      IF v_customer_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
      END IF;
$before$, $after$    IF v_customer_user_id IS DISTINCT FROM auth.uid()
       AND NOT (v_is_admin OR v_is_staff) THEN
      RAISE EXCEPTION 'FORBIDDEN_CUSTOMER' USING ERRCODE = 'P0011';
$after$);
    v_definition := replace(v_definition, $before$    -- platform customer (organization_id = NULL) は全組織で予約可
    -- guest customer (organization_id IS NOT NULL) は自組織のみ
    IF v_customer_org_id IS NOT NULL AND v_customer_org_id IS DISTINCT FROM v_event_org_id THEN
$before$, $after$    -- 本人の共通顧客は旧organization_idの有無を問わず組織横断で利用できる。
    -- 他人を代理する業務操作では、組織付き顧客は対象公演と同じ組織に限る。
    IF v_customer_org_id IS NOT NULL
       AND v_customer_org_id IS DISTINCT FROM v_event_org_id
       AND v_customer_user_id IS DISTINCT FROM auth.uid() THEN
$after$);

  ELSIF md5(v_definition) IN ('6990c9a7149cb669114cab38d439d86b','db3747f9fe1a8cc64e3c09008ca3dcfa') THEN
    v_definition := replace(v_definition, $before$       THEN
$before$, $after$       AND v_customer_user_id IS DISTINCT FROM auth.uid() THEN
$after$);

  END IF;
  IF md5(v_definition) NOT IN ('9b363c1e765bd9941dcf42be178a08aa','c0bcf134aa9da1583aa33ce23071488c') THEN
    RAISE EXCEPTION '予約RPCの本文が取得済み定義と異なります: create_reservation_with_lock_v2' USING ERRCODE = '55000';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.update_reservation_participants(uuid,integer,uuid)'::regprocedure) INTO v_definition;
  IF md5(v_definition) IN ('597d9021ab0eed9d526b64476302d990') THEN
    v_definition := replace(v_definition, $before$BEGIN
$before$, $after$BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

$after$);
    v_definition := replace(v_definition, $before$  -- 🔒 権限チェック
  IF p_customer_id IS NOT NULL THEN
    -- 顧客の場合: 自分の予約のみ変更可能
    IF v_reservation_customer_id != p_customer_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    -- customer_id がNULLの場合: 管理者 or 組織スタッフのみ
    IF NOT (
      is_org_admin() OR
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND organization_id = v_org_id
          AND status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
    END IF;
$before$, $after$  -- reservation_actor_auth_v1: 旧引数は対象の照合用であり本人証明ではない。
  IF p_customer_id IS NOT NULL
     AND v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  IF NOT COALESCE(public.reservation_actor_is_org_operator(v_org_id), false)
     AND NOT EXISTS (
       SELECT 1 FROM public.customers
       WHERE id = v_reservation_customer_id AND user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
$after$);

  END IF;
  IF md5(v_definition) NOT IN ('a92c0da85100e3b4fe9ad9f3a37b4303') THEN
    RAISE EXCEPTION '予約RPCの本文が取得済み定義と異なります: update_reservation_participants' USING ERRCODE = '55000';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

-- 旧wrapperも認証必須。authenticated/service_roleの既存EXECUTEは維持。
REVOKE EXECUTE ON FUNCTION public.create_reservation_with_lock(uuid,integer,uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_reservation_with_lock_v2(uuid,integer,uuid,text,text,text,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_reservation_participants(uuid,integer,uuid) FROM PUBLIC, anon;
DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.change_reservation_schedule(uuid,uuid,uuid)'::regprocedure) INTO v_definition;
  IF md5(v_definition) = 'a29f190716d2d22e28d1f8600ea2c150' THEN
    v_definition := replace(v_definition, $before$  -- 🔒 認証ユーザーのcustomer_idを取得
  SELECT id INTO v_auth_customer_id
  FROM customers
  WHERE user_id = auth.uid();
  
$before$, $after$  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

$after$);
    v_definition := replace(v_definition, $before$  -- 🔒 権限確認（本人 or スタッフ/管理者）
  IF v_reservation_customer_id IS DISTINCT FROM v_auth_customer_id 
     AND NOT is_org_admin() 
     AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: 予約の変更権限がありません' USING ERRCODE = 'P0010';
  END IF;
  
$before$, $after$  -- reservation_actor_auth_v1: 旧引数は対象の照合用。
  IF p_customer_id IS NOT NULL
     AND v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;
  -- 旧日程変更の業務権限（管理者）を維持し、対象組織と利用状態を追加確認。
  IF NOT EXISTS (
       SELECT 1 FROM public.customers
       WHERE id = v_reservation_customer_id AND user_id = auth.uid()
     ) AND NOT (
       COALESCE(public.reservation_actor_is_org_operator(v_org_id), false)
       AND public.is_org_admin()
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

$after$);
  END IF;
  IF md5(v_definition) <> '3996edbdf2d1f9526591b51a2ec37211' THEN
    RAISE EXCEPTION '予約RPCの本文が取得済み定義と異なります: change_reservation_schedule' USING ERRCODE = '55000';
  END IF;
  EXECUTE v_definition;
END;
$migration$;
REVOKE EXECUTE ON FUNCTION public.change_reservation_schedule(uuid,uuid,uuid) FROM PUBLIC, anon;
COMMIT;
