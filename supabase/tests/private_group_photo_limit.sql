-- 貸切グループのチャット写真は「グループ全体で 10 枚まで」（2026-10-20 社長決定、migration 20261020160000）。
-- 9 枚ある状態で 2 枚は断る・1 枚なら送れる・削除したら再び送れる・組織の上書き 20 が効く。全部巻き戻す。
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('eeeeeeee-0000-4000-8000-000000000001', '写真上限テスト', 'photo-limit-test', true);
INSERT INTO auth.users(id, email) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'photo-limit@example.invalid');
INSERT INTO public.private_groups(id, organization_id, organizer_id, invite_code, status, name)
 VALUES ('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000a1', 'PHOTOLIM01', 'gathering', '写真テスト');
INSERT INTO public.private_group_members(id, group_id, user_id, status, is_organizer, guest_name)
 VALUES ('eeeeeeee-0000-4000-8000-000000000021', 'eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-0000000000a1', 'joined', true, '主催');
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- 写真の発言を 1 つ送る（実体は storage.objects に置いた体）。送れたら発言の id、断られたら NULL と理由を残す
CREATE TEMP TABLE photo_results(label text, message_id uuid, error text, hint text);
CREATE FUNCTION pg_temp.send_photos(p_label text, p_count integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_prep jsonb; v_id uuid; v_msg text; v_hint text;
BEGIN
  v_prep := public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'photo_prepare', jsonb_build_object('count', p_count));
  v_id := (v_prep->>'message_id')::uuid;
  INSERT INTO storage.objects(bucket_id, name, metadata)
  SELECT 'private-group-photos', p #>> '{}', '{"size": 100}'::jsonb FROM jsonb_array_elements(v_prep->'paths') p;
  PERFORM public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'photo_message',
    jsonb_build_object('message_id', v_id, 'count', p_count));
  INSERT INTO photo_results VALUES (p_label, v_id, NULL, NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
  INSERT INTO photo_results VALUES (p_label, NULL, v_msg, v_hint);
END $$;
CREATE FUNCTION pg_temp.quota() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'photo_quota', '{}'::jsonb)
$$;

-- 既定は 10 枚
DO $$ BEGIN ASSERT pg_temp.quota() = '{"limit": 10, "used": 0, "remaining": 10}'::jsonb, pg_temp.quota()::text; END $$;
SELECT pg_temp.send_photos('first9', 9);
DO $$ BEGIN
  ASSERT (SELECT message_id FROM photo_results WHERE label = 'first9') IS NOT NULL, (SELECT error FROM photo_results WHERE label = 'first9');
  ASSERT pg_temp.quota() = '{"limit": 10, "used": 9, "remaining": 1}'::jsonb, pg_temp.quota()::text;
END $$;

-- 9 枚ある状態で 2 枚は断る（準備の段階で。文言と理由）
SELECT pg_temp.send_photos('two', 2);
DO $$ BEGIN
  ASSERT (SELECT error FROM photo_results WHERE label = 'two') = 'このグループの写真は 10 枚までです。残り 1 枚です', (SELECT error FROM photo_results WHERE label = 'two');
  ASSERT (SELECT hint FROM photo_results WHERE label = 'two') = 'photo_limit';
  ASSERT pg_temp.quota()->>'used' = '9';
END $$;

-- 送る段階でも断る（準備は 1 枚で通し、送るときに 2 枚と言っても通さない）
DO $$
DECLARE v_prep jsonb; v_msg text;
BEGIN
  v_prep := public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'photo_prepare', '{"count": 1}');
  BEGIN
    PERFORM public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'photo_message',
      jsonb_build_object('message_id', v_prep->>'message_id', 'count', 2));
    RAISE EXCEPTION '送る段階で 2 枚が通った';
  EXCEPTION WHEN sqlstate '22023' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    ASSERT v_msg = 'このグループの写真は 10 枚までです。残り 1 枚です', v_msg;
  END;
END $$;

-- 記録を直接足しても上限を超えない（トリガー）
DO $$
DECLARE v_id uuid := (SELECT message_id FROM photo_results WHERE label = 'first9');
BEGIN
  BEGIN
    INSERT INTO public.private_group_message_photos(message_id, position, group_id, organization_id, storage_path)
    SELECT v_id, n, 'eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000001', 'x/' || n FROM generate_series(10, 11) n;
    RAISE EXCEPTION 'トリガーで 11 枚目が通った';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
END $$;

-- 1 枚なら送れる。これで 10 枚、もう送れない
SELECT pg_temp.send_photos('one', 1);
SELECT pg_temp.send_photos('eleventh', 1);
DO $$ BEGIN
  ASSERT (SELECT message_id FROM photo_results WHERE label = 'one') IS NOT NULL, (SELECT error FROM photo_results WHERE label = 'one');
  ASSERT (SELECT error FROM photo_results WHERE label = 'eleventh') = 'このグループの写真は 10 枚までです。残り 0 枚です', (SELECT error FROM photo_results WHERE label = 'eleventh');
  ASSERT pg_temp.quota() = '{"limit": 10, "used": 10, "remaining": 0}'::jsonb, pg_temp.quota()::text;
END $$;

-- 削除した写真は数えない → 再び送れる
SELECT public.private_group_chat_action('eeeeeeee-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-000000000021', 'delete_message',
  jsonb_build_object('message_id', (SELECT message_id FROM photo_results WHERE label = 'one')));
DO $$ BEGIN ASSERT pg_temp.quota() = '{"limit": 10, "used": 9, "remaining": 1}'::jsonb, pg_temp.quota()::text; END $$;
SELECT pg_temp.send_photos('after_delete', 1);
DO $$ BEGIN ASSERT (SELECT message_id FROM photo_results WHERE label = 'after_delete') IS NOT NULL, (SELECT error FROM photo_results WHERE label = 'after_delete'); END $$;

-- 組織の上書き 20 が効く（店舗・作品・公演では上書きできない）
SELECT public.save_operating_setting_overrides('eeeeeeee-0000-4000-8000-000000000001', 'organization', 'eeeeeeee-0000-4000-8000-000000000001', '{"private_group_photo_limit": 20}', 0);
DO $$ BEGIN
  ASSERT pg_temp.quota() = '{"limit": 20, "used": 10, "remaining": 10}'::jsonb, pg_temp.quota()::text;
  ASSERT public.resolve_operating_setting('eeeeeeee-0000-4000-8000-000000000001', 'private_group_photo_limit', '10') = '{"value": 20, "source": "organization"}'::jsonb;
END $$;
SELECT pg_temp.send_photos('with_override', 10);
SELECT pg_temp.send_photos('over_override', 1);
DO $$ BEGIN
  ASSERT (SELECT message_id FROM photo_results WHERE label = 'with_override') IS NOT NULL, (SELECT error FROM photo_results WHERE label = 'with_override');
  ASSERT (SELECT error FROM photo_results WHERE label = 'over_override') = 'このグループの写真は 20 枚までです。残り 0 枚です', (SELECT error FROM photo_results WHERE label = 'over_override');
END $$;

-- 呼び出し口は参加者本人の RPC だけ（内部の関数は anon / authenticated から呼べない）
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.private_group_photo_quota(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.private_group_photo_check_limit(uuid, integer)', 'EXECUTE');
END $$;
ROLLBACK;
\echo 'private_group_photo_limit: OK'
