-- リリース告知の配信関数 announce_release_2026_10（migration 20261021190000）。
-- 件数だけ（dry_run）では何も書かない／積むと 1 人 1 件／もう一度呼んでも増えない／2 つの対象の選び方と組織の決め方／
-- 文面（details 8 項目・リンク）／ブラウザの役割から呼べない、を確かめる。
-- 架空の組織・会員だけを足し、1 つの取引で最後に巻き戻す（外部へは何も送らない。release_note はプッシュ・メールの対象外）。
-- npm run test:rpcs から実行する。
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

-- 足す前の件数（手元 DB にもともといる会員の分を差し引くため）
CREATE TEMP TABLE announce_base AS
SELECT (public.announce_release_2026_10('private_group_participants', true)->>'target_count')::int AS pg_n,
       (public.announce_release_2026_10('all_members', true)->>'target_count')::int AS all_n;

INSERT INTO public.organizations(id, name, slug, is_active) VALUES
 ('abababab-0000-4000-8000-000000000001', '告知テスト店A', 'announce-test-a', true),
 ('abababab-0000-4000-8000-000000000002', '告知テスト店B', 'announce-test-b', true);
INSERT INTO auth.users(id, email) VALUES
 ('abababab-0000-4000-8000-0000000000a1', 'announce-organizer@example.invalid'),  -- A のグループの主催者・会員
 ('abababab-0000-4000-8000-0000000000a2', 'announce-member@example.invalid'),     -- A（古い）と B（新しい）のメンバー・会員
 ('abababab-0000-4000-8000-0000000000a3', 'announce-booker@example.invalid'),     -- グループ無し、B で予約した会員
 ('abababab-0000-4000-8000-0000000000a4', 'announce-noresv@example.invalid'),     -- グループ無し、予約も無い会員
 ('abababab-0000-4000-8000-0000000000a5', 'announce-nocustomer@example.invalid'); -- アカウントだけ（会員の行なし）
INSERT INTO public.customers(id, user_id, name, email, organization_id) VALUES
 ('abababab-0000-4000-8000-0000000000c1', 'abababab-0000-4000-8000-0000000000a1', '告知 主催', 'announce-organizer@example.invalid', 'abababab-0000-4000-8000-000000000001'),
 ('abababab-0000-4000-8000-0000000000c2', 'abababab-0000-4000-8000-0000000000a2', '告知 メンバー', 'announce-member@example.invalid', 'abababab-0000-4000-8000-000000000001'),
 ('abababab-0000-4000-8000-0000000000c3', 'abababab-0000-4000-8000-0000000000a3', '告知 予約A', 'announce-booker@example.invalid', 'abababab-0000-4000-8000-000000000001'),
 ('abababab-0000-4000-8000-0000000000c4', 'abababab-0000-4000-8000-0000000000a3', '告知 予約B', 'announce-booker-b@example.invalid', 'abababab-0000-4000-8000-000000000002'),
 ('abababab-0000-4000-8000-0000000000c5', 'abababab-0000-4000-8000-0000000000a4', '告知 予約なし', 'announce-noresv@example.invalid', NULL),
 ('abababab-0000-4000-8000-0000000000c6', NULL, '告知 電話の客', NULL, 'abababab-0000-4000-8000-000000000001');
INSERT INTO public.private_groups(id, organization_id, organizer_id, invite_code, status, name, created_at) VALUES
 ('abababab-0000-4000-8000-000000000010', 'abababab-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-0000000000a1', 'ANNOUNCE1', 'gathering', '告知テストA', now() - interval '30 days'),
 ('abababab-0000-4000-8000-000000000011', 'abababab-0000-4000-8000-000000000002', 'abababab-0000-4000-8000-0000000000a2', 'ANNOUNCE2', 'gathering', '告知テストB', now() - interval '1 day');
INSERT INTO public.private_group_members(id, group_id, user_id, status, is_organizer, guest_name, joined_at) VALUES
 ('abababab-0000-4000-8000-000000000021', 'abababab-0000-4000-8000-000000000010', 'abababab-0000-4000-8000-0000000000a1', 'joined', true, '主催', now() - interval '30 days'),
 ('abababab-0000-4000-8000-000000000022', 'abababab-0000-4000-8000-000000000010', 'abababab-0000-4000-8000-0000000000a2', 'joined', false, 'メンバー', now() - interval '29 days'),
 ('abababab-0000-4000-8000-000000000023', 'abababab-0000-4000-8000-000000000010', NULL, 'joined', false, 'ゲスト', now() - interval '29 days'),
 ('abababab-0000-4000-8000-000000000024', 'abababab-0000-4000-8000-000000000011', 'abababab-0000-4000-8000-0000000000a2', 'joined', true, 'メンバー', now() - interval '1 day');
-- 会員 a3: A で古い予約、B で新しい予約 → 組織は B
INSERT INTO public.reservations(id, organization_id, customer_id, title, requested_datetime, duration, status, created_at) VALUES
 ('abababab-0000-4000-8000-000000000031', 'abababab-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-0000000000c3', '告知テスト公演A', now() + interval '20 days', 180, 'pending', now() - interval '10 days'),
 ('abababab-0000-4000-8000-000000000032', 'abababab-0000-4000-8000-000000000002', 'abababab-0000-4000-8000-0000000000c4', '告知テスト公演B', now() + interval '25 days', 180, 'pending', now() - interval '2 days');

DO $$
DECLARE b record; r jsonb; v_n int; v_org jsonb; n jsonb;
  t1 uuid := 'abababab-0000-4000-8000-0000000000a1'; t2 uuid := 'abababab-0000-4000-8000-0000000000a2';
  t3 uuid := 'abababab-0000-4000-8000-0000000000a3'; t4 uuid := 'abababab-0000-4000-8000-0000000000a4';
  t5 uuid := 'abababab-0000-4000-8000-0000000000a5';
  oa uuid := 'abababab-0000-4000-8000-000000000001'; ob uuid := 'abababab-0000-4000-8000-000000000002';
BEGIN
  SELECT * INTO b FROM announce_base;

  -- 1) 貸切グループ関係者・件数だけ: 主催者 a1 とメンバー a2 の 2 人が増える（ゲストは数えない）。何も書かない
  r := public.announce_release_2026_10('private_group_participants', true);
  ASSERT (r->>'dry_run')::boolean AND (r->>'target_count')::int = b.pg_n + 2, format('関係者の件数が違う: %s（元 %s）', r->>'target_count', b.pg_n);
  ASSERT (r->>'inserted')::int = 0, 'dry_run なのに inserted が 0 でない';
  SELECT e INTO v_org FROM jsonb_array_elements(r->'by_organization') e WHERE e->>'organization_id' = oa::text;
  ASSERT (v_org->>'count')::int = 1 AND v_org->>'organization_name' = '告知テスト店A', format('A の内訳が違う: %s', v_org);
  SELECT e INTO v_org FROM jsonb_array_elements(r->'by_organization') e WHERE e->>'organization_id' = ob::text;
  ASSERT (v_org->>'count')::int = 1, format('B の内訳が違う（a2 は新しいグループの B）: %s', v_org);
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_notifications WHERE metadata->>'key' = 'release-2026-10'), 'dry_run で通知が書かれた';

  -- 2) 文面: 絵文字なし・details 8 項目・リンク
  ASSERT r->>'title' = '予約サイトが新しくなりました', '題名が違う';
  ASSERT jsonb_array_length(r->'details') BETWEEN 6 AND 8, 'details は 6〜8 項目';
  ASSERT r->>'link' = '/mypage?tab=reservations&sub=private', 'リンクが違う';
  ASSERT (r->>'title') || (r->>'message') || (r->'details')::text !~ '[\U0001F300-\U0001FAFF☀-➿]', '文面に絵文字がある';

  -- 3) 積む: 対象の人数ぶん。テストの 2 人はそれぞれ 1 件、組織も上と同じ
  r := public.announce_release_2026_10('private_group_participants', false);
  ASSERT (r->>'inserted')::int = (r->>'target_count')::int - (r->>'already_notified')::int, format('積んだ件数が対象と合わない: %s', r - 'details' - 'message');
  FOR n IN SELECT to_jsonb(x) FROM public.user_notifications x WHERE x.user_id IN (t1, t2) AND x.metadata->>'key' = 'release-2026-10' LOOP
    ASSERT n->>'type' = 'system' AND n->'metadata'->>'kind' = 'release_note'
       AND n->'metadata'->>'dedupe_key' = 'release_note:release-2026-10:' || (n->>'user_id')
       AND jsonb_array_length(n->'metadata'->'details') = jsonb_array_length(r->'details')
       AND n->>'link' = '/mypage?tab=reservations&sub=private' AND NOT (n->>'is_read')::boolean, format('積んだ通知の形が違う: %s', n);
  END LOOP;
  ASSERT (SELECT count(*) FROM public.user_notifications WHERE user_id = t1 AND metadata->>'key' = 'release-2026-10' AND organization_id = oa) = 1, 'a1 が A で 1 件になっていない';
  ASSERT (SELECT count(*) FROM public.user_notifications WHERE user_id = t2 AND metadata->>'key' = 'release-2026-10' AND organization_id = ob) = 1, 'a2 が B で 1 件になっていない';
  ASSERT NOT EXISTS (SELECT 1 FROM public.web_push_outbox WHERE notification_id IN (SELECT id FROM public.user_notifications WHERE metadata->>'key' = 'release-2026-10')), 'プッシュの送信待ちが作られた';

  -- 4) もう一度呼んでも増えない
  r := public.announce_release_2026_10('private_group_participants', false);
  ASSERT (r->>'inserted')::int = 0 AND (r->>'already_notified')::int = (r->>'target_count')::int, format('再実行で増えた: %s', r - 'details' - 'message');

  -- 5) 会員全員・件数だけ: 会員の行がある a1〜a4 の 4 人が増える（a5 は会員の行なし、電話の客は user_id なし）。a1・a2 は積み済み
  r := public.announce_release_2026_10('all_members', true);
  ASSERT (r->>'target_count')::int = b.all_n + 4, format('会員全員の件数が違う: %s（元 %s）', r->>'target_count', b.all_n);
  ASSERT (r->>'would_insert')::int = (r->>'target_count')::int - (r->>'already_notified')::int, 'would_insert が合わない';

  -- 6) 会員全員・積む: a3 は直近の予約の B、a4 は予約が無いので組織なし。a1・a2 は 1 件のまま
  r := public.announce_release_2026_10('all_members', false);
  ASSERT (SELECT count(*) FROM public.user_notifications WHERE user_id = t3 AND metadata->>'key' = 'release-2026-10' AND organization_id = ob) = 1, 'a3 が B で 1 件になっていない';
  ASSERT (SELECT count(*) FROM public.user_notifications WHERE user_id = t4 AND metadata->>'key' = 'release-2026-10' AND organization_id IS NULL) = 1, 'a4 が組織なしで 1 件になっていない';
  ASSERT (SELECT count(*) FROM public.user_notifications WHERE user_id IN (t1, t2) AND metadata->>'key' = 'release-2026-10') = 2, 'a1・a2 に 2 件目が積まれた';
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_notifications WHERE user_id = t5 AND metadata->>'key' = 'release-2026-10'), '会員の行が無い a5 に積まれた';
  SELECT count(*) INTO v_n FROM (SELECT user_id FROM public.user_notifications WHERE metadata->>'key' = 'release-2026-10' GROUP BY user_id HAVING count(*) > 1) d;
  ASSERT v_n = 0, '2 件以上ある人がいる';
  r := public.announce_release_2026_10('all_members', false);
  ASSERT (r->>'inserted')::int = 0, '会員全員の再実行で増えた';

  -- 7) 対象の指定が違えば止まる
  BEGIN
    PERFORM public.announce_release_2026_10('everyone', true);
    RAISE EXCEPTION 'unexpected';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- 8) ブラウザの役割からは呼べない
  ASSERT NOT has_function_privilege('authenticated', 'public.announce_release_2026_10(text, boolean)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.announce_release_2026_10(text, boolean)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.announce_release_2026_10(text, boolean)', 'EXECUTE'), '権限が違う';
  RAISE WARNING 'OK: announce_release_2026_10（dry_run は書かない・1 人 1 件・再実行で増えない・2 つの対象と組織の決め方・権限）';
END $$;
ROLLBACK;
