-- 日程変更RPCの追加した認可も保持する。
-- 安全互換down。本人／組織ガードと匿名拒否を残し、旧顧客org制約のみ復元。
-- 旧APIへの切戻しは可能。既知の認可欠陥を戻す完全逆DDLではない。
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_reservation_with_lock_v2(uuid,integer,uuid,text,text,text,text,text,text,uuid)'::regprocedure) INTO v_definition;
  IF md5(v_definition) IN ('9b363c1e765bd9941dcf42be178a08aa','c0bcf134aa9da1583aa33ce23071488c') THEN
    v_definition := replace(v_definition, $before$       AND v_customer_user_id IS DISTINCT FROM auth.uid() THEN
$before$, $after$       THEN
$after$);
  END IF;
  IF md5(v_definition) NOT IN ('6990c9a7149cb669114cab38d439d86b','db3747f9fe1a8cc64e3c09008ca3dcfa') THEN
    RAISE EXCEPTION '取得済み認可修正以外の本文を復元しません' USING ERRCODE = '55000';
  END IF;
  EXECUTE v_definition;
END;
$migration$;
COMMIT;
