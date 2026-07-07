-- 一度きりのバックフィル (#308): customers.user_id が NULL の行を auth.users と lower(email) で
-- 照合し、「一意に定まる場合のみ」紐付ける。
--
-- 意図的にスキップされる（＝変更されない）行:
--   - lower(email) が auth.users 側で複数一致 → 曖昧
--   - lower(email) が未紐付け customers 側で複数 → 重複メール（issue #308 で1組確認済み）。
--     この一意性チェックは organization_id を問わずグローバルに行っているため、同一人物が
--     複数組織にゲストとして重複登録されているケース（組織ごとに別行が正のモデル）もここで
--     スキップされる。誤って別組織の顧客行を紐付けるリスクを避けるための安全側の判断であり、
--     該当行は本バックフィルでは救済しない。手動での重複解消・案内は運用側で対応する。
--   - auth.users に対応メールが存在しない → 照合不能
--   - 対応 user_id が既に別の customers 行に紐付いている → 重複紐付け防止
-- スキップされた行は user_id IS NULL のまま残る。RLS ポリシーは一切変更しない。
--
-- organization_id のリセット:
--   紐付け対象の行は元々ゲスト顧客（organization_id が特定の組織を指す）。
--   20260519000000_platform_customers_phase1.sql の不変条件「ログイン済み顧客
--   (user_id IS NOT NULL) は organization_id = NULL」を保つため、user_id と同時に
--   organization_id も NULL にする（20260521030000_backfill_platform_customers_org_null.sql
--   と同じ理由。これを怠ると他組織での予約が api/reservations.ts の境界チェックで拒否される）。

DO $$
DECLARE
  v_before  integer;
  v_updated integer;
  v_after   integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.customers WHERE user_id IS NULL;

  UPDATE public.customers c
  SET user_id = au.id,
      organization_id = NULL,
      updated_at = NOW()
  FROM auth.users au
  WHERE c.user_id IS NULL
    AND c.email IS NOT NULL
    AND lower(c.email) = lower(au.email)
    -- auth.users 側で一意
    AND (SELECT count(*) FROM auth.users au2
         WHERE lower(au2.email) = lower(c.email)) = 1
    -- 未紐付け customers 側で一意（組織横断でグローバルにチェック。重複メール・複数組織
    -- ゲスト重複は曖昧とみなしスキップ）
    AND (SELECT count(*) FROM public.customers c2
         WHERE c2.user_id IS NULL AND lower(c2.email) = lower(c.email)) = 1
    -- その user_id が既に別行に紐付いていない
    AND NOT EXISTS (SELECT 1 FROM public.customers c3
                    WHERE c3.user_id = au.id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  SELECT count(*) INTO v_after FROM public.customers WHERE user_id IS NULL;

  RAISE NOTICE 'backfill customers.user_id: NULL before=%, linked=%, NULL after=% (残りは曖昧/照合不能で意図的にスキップ)',
    v_before, v_updated, v_after;
END $$;
