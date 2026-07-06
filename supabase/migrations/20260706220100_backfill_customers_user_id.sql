-- 一度きりのバックフィル (#308): customers.user_id が NULL の行を auth.users と lower(email) で
-- 照合し、「一意に定まる場合のみ」紐付ける。
--
-- 意図的にスキップされる（＝変更されない）行:
--   - lower(email) が auth.users 側で複数一致 → 曖昧
--   - lower(email) が未紐付け customers 側で複数 → 重複メール（issue #308 で1組確認済み）
--   - auth.users に対応メールが存在しない → 照合不能
--   - 対応 user_id が既に別の customers 行に紐付いている → 重複紐付け防止
-- スキップされた行は user_id IS NULL のまま残る。RLS ポリシーは一切変更しない。

DO $$
DECLARE
  v_before  integer;
  v_updated integer;
  v_after   integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.customers WHERE user_id IS NULL;

  UPDATE public.customers c
  SET user_id = au.id,
      updated_at = NOW()
  FROM auth.users au
  WHERE c.user_id IS NULL
    AND c.email IS NOT NULL
    AND lower(c.email) = lower(au.email)
    -- auth.users 側で一意
    AND (SELECT count(*) FROM auth.users au2
         WHERE lower(au2.email) = lower(c.email)) = 1
    -- 未紐付け customers 側で一意（重複メールをスキップ）
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
