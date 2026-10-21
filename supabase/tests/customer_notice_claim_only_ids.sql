-- お知らせメールの取り出しを「試験の 1 件だけ」に限定できる（Codex 第 2 回再レビュー R1、migration 20261021120000）。
-- 本番公開の限定試験（docs/ops/本番公開の戻し方_2026-10.md の (7)）で、ほかのお客様宛てが一緒に取り出されないこと:
--   ほかのお客様の送信待ち（今すぐ送れる）、試験の行より後に積まれた送信待ち、取り出し期限が切れた sending があっても、
--   p_only_ids に試験の行の ID を渡せばその 1 行だけが取り出される。空の配列では何も取り出さない。引数なしの動きは従来どおり。
-- 関数を呼ぶだけで、メールは送らない（送信処理の Edge Function は起動しない）。1 つの取引で、最後に巻き戻す。npm run test:rpcs から実行する。
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('dddddddd-0000-4000-8000-000000000001', '限定試験テスト', 'notice-only-ids-test', true);
INSERT INTO public.app_config(key, value) VALUES ('customer_notice_email', 'on') ON CONFLICT (key) DO UPDATE SET value = 'on';

-- 試験の行（試験アカウント宛て、今すぐ送れる）
INSERT INTO public.customer_notice_emails(id, organization_id, kind, dedupe_key, to_email, subject, body_text, next_attempt_at)
VALUES ('dddddddd-0000-4000-8000-000000000101', 'dddddddd-0000-4000-8000-000000000001', 'test', 'only-ids-test-target',
        'release-check@example.invalid', '試験', '試験', clock_timestamp() - interval '1 minute');
-- ほかのお客様の送信待ち（試験の行より前から待っている＝並び順では先に来る）
INSERT INTO public.customer_notice_emails(id, organization_id, kind, dedupe_key, to_email, subject, body_text, next_attempt_at)
VALUES ('dddddddd-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'test', 'only-ids-test-other-due',
        'other-customer@example.invalid', 'ほか', 'ほか', clock_timestamp() - interval '30 minutes');
-- 試験の行より後に新しく積まれた送信待ち（旧手順の「ほかを延期」では対象外になっていた）
INSERT INTO public.customer_notice_emails(id, organization_id, kind, dedupe_key, to_email, subject, body_text, next_attempt_at)
VALUES ('dddddddd-0000-4000-8000-000000000103', 'dddddddd-0000-4000-8000-000000000001', 'test', 'only-ids-test-new-pending',
        'new-customer@example.invalid', '後から', '後から', clock_timestamp() - interval '2 hours');
-- 取り出し期限（lease）が切れた sending（定期実行なら拾い直す）
INSERT INTO public.customer_notice_emails(id, organization_id, kind, dedupe_key, to_email, subject, body_text, status, attempt_count, lease_until, next_attempt_at)
VALUES ('dddddddd-0000-4000-8000-000000000104', 'dddddddd-0000-4000-8000-000000000001', 'test', 'only-ids-test-expired-lease',
        'stuck-customer@example.invalid', '期限切れ', '期限切れ', 'sending', 1, clock_timestamp() - interval '1 minute', clock_timestamp() - interval '3 hours');

DO $$
DECLARE v_ids uuid[]; v_n int;
BEGIN
  -- 空の配列は何も取り出さない（「全部」にしない）
  SELECT count(*) INTO v_n FROM public.claim_customer_notice_emails(20, ARRAY[]::uuid[]);
  ASSERT v_n = 0, format('空の配列で %s 行取り出した', v_n);
  -- 試験の行だけ
  SELECT array_agg(c.id) INTO v_ids FROM public.claim_customer_notice_emails(20, ARRAY['dddddddd-0000-4000-8000-000000000101'::uuid]) c;
  ASSERT v_ids = ARRAY['dddddddd-0000-4000-8000-000000000101'::uuid], format('試験の 1 行だけのはず: %s', v_ids);
  ASSERT (SELECT status FROM public.customer_notice_emails WHERE id = 'dddddddd-0000-4000-8000-000000000101') = 'sending', '試験の行が sending になっていない';
  -- ほかの 3 行はそのまま（取り出されていない）
  ASSERT (SELECT count(*) FROM public.customer_notice_emails WHERE id IN ('dddddddd-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000103') AND status = 'pending' AND attempt_count = 0) = 2,
    'ほかのお客様の送信待ちが取り出された';
  ASSERT (SELECT attempt_count FROM public.customer_notice_emails WHERE id = 'dddddddd-0000-4000-8000-000000000104') = 1, '期限切れの sending が取り出された';
  -- 同じ ID でもう一度呼んでも、取り出し中の行は二重に出ない
  SELECT count(*) INTO v_n FROM public.claim_customer_notice_emails(20, ARRAY['dddddddd-0000-4000-8000-000000000101'::uuid]);
  ASSERT v_n = 0, '取り出し中の試験の行が二重に出た';
  -- 引数なし（定期実行）は従来どおり、今すぐ送れる行をすべて取り出す（ほかの送信待ち・後から積んだ分・期限切れ）
  SELECT array_agg(c.id ORDER BY c.id) INTO v_ids FROM public.claim_customer_notice_emails() c WHERE c.id::text LIKE 'dddddddd-%';
  ASSERT v_ids = ARRAY['dddddddd-0000-4000-8000-000000000102'::uuid, 'dddddddd-0000-4000-8000-000000000103'::uuid, 'dddddddd-0000-4000-8000-000000000104'::uuid],
    format('引数なしの取り出しが従来と違う: %s', v_ids);
  ASSERT NOT has_function_privilege('authenticated', 'public.claim_customer_notice_emails(integer, uuid[])', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.claim_customer_notice_emails(integer, uuid[])', 'EXECUTE'), 'ブラウザの役割から呼べる';
  RAISE WARNING 'OK: customer_notice_claim_only_ids（ほかの送信待ち・後から積んだ分・期限切れがあっても試験の 1 行だけ取り出す）';
END $$;
ROLLBACK;
