-- 公演の作成と担当の保存を 1 つの取引にする（migration 20261022010000、PR #1210）。架空データのみ・全部巻き戻す。
-- 前提: migration 20261022010000 を当てた DB で流す（当てる前の DB では関数が無く 1 件目で止まる）。
-- 比較のため、従来の 2 段（公演作成 → 別取引で担当同期）で担当保存が失敗すると GM 空の公演が残ることも同じ取引内で確かめる。
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES
 ('dddddddd-0000-4000-8000-000000000001', 'GM原子作成テスト', 'gm-atomic-create-test', true),
 ('dddddddd-0000-4000-8000-000000000002', 'GM原子作成テスト別組織', 'gm-atomic-create-test-other', true);
INSERT INTO auth.users(id, email) VALUES
 ('dddddddd-0000-4000-8000-0000000000a1', 'gm-atomic-admin@example.invalid'),
 ('dddddddd-0000-4000-8000-0000000000a2', 'gm-atomic-customer@example.invalid'),
 ('dddddddd-0000-4000-8000-0000000000a3', 'gm-atomic-admin2@example.invalid');
INSERT INTO public.users(id, email, role, organization_id) VALUES
 ('dddddddd-0000-4000-8000-0000000000a1', 'gm-atomic-admin@example.invalid', 'admin', 'dddddddd-0000-4000-8000-000000000001'),
 ('dddddddd-0000-4000-8000-0000000000a2', 'gm-atomic-customer@example.invalid', 'customer', 'dddddddd-0000-4000-8000-000000000001'),
 ('dddddddd-0000-4000-8000-0000000000a3', 'gm-atomic-admin2@example.invalid', 'admin', 'dddddddd-0000-4000-8000-000000000001')
 ON CONFLICT (id) DO UPDATE SET role=excluded.role, organization_id=excluded.organization_id;
INSERT INTO public.staff(id, organization_id, name, user_id) VALUES
 ('dddddddd-0000-4000-8000-0000000000c1', 'dddddddd-0000-4000-8000-000000000001', '架空GM', 'dddddddd-0000-4000-8000-0000000000a1'),
 ('dddddddd-0000-4000-8000-0000000000c2', 'dddddddd-0000-4000-8000-000000000001', '架空参加', NULL);
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES
 ('dddddddd-0000-4000-8000-0000000000b1', 'dddddddd-0000-4000-8000-000000000001', '架空店', '架空'),
 ('dddddddd-0000-4000-8000-0000000000b2', 'dddddddd-0000-4000-8000-000000000002', '架空別組織店', '別');
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE results(label text, ok boolean, detail text);
GRANT ALL ON results TO authenticated;
CREATE FUNCTION pg_temp.ev(p_notes text, p_store uuid DEFAULT 'dddddddd-0000-4000-8000-0000000000b1', p_capacity int DEFAULT 6) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('date','2031-02-01','store_id',p_store,'venue','架空店','scenario','','category','open',
  'start_time','10:00','end_time','14:00','capacity',p_capacity,'notes',p_notes,'time_slot','朝','is_reservation_enabled',false,
  'id','dddddddd-0000-4000-8000-00000000ffff','organization_id','dddddddd-0000-4000-8000-000000000002','gms',ARRAY['偽']) $$;
GRANT EXECUTE ON FUNCTION pg_temp.ev(text, uuid, int) TO authenticated, anon;

SELECT set_config('request.jwt.claims','{"sub":"dddddddd-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;

-- 呼び出しは担当者（authenticated）として行い、結果の確認は postgres で行う（RLS で見えないことを「無い」と誤認しないため）
CREATE TEMP TABLE calls(label text, id uuid, err text, code text);
GRANT ALL ON calls TO authenticated, anon;
CREATE FUNCTION pg_temp.try_create(p_label text, p_event jsonb, p_gms text[], p_roles jsonb, p_entries jsonb, p_request uuid DEFAULT gen_random_uuid()) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  INSERT INTO calls VALUES (p_label, public.create_schedule_event_with_staff(p_request, p_event, p_gms, p_roles, p_entries), NULL, NULL);
 EXCEPTION WHEN OTHERS THEN
  INSERT INTO calls VALUES (p_label, NULL, SQLERRM, SQLSTATE);
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.try_create(text, jsonb, text[], jsonb, jsonb, uuid) TO authenticated, anon;

-- 0) 修正前の 2 段: 公演は作成（確定）→ 別取引の担当同期が失敗 → GM 空の公演が残る
SET LOCAL ROLE postgres;
INSERT INTO public.schedule_events(organization_id, store_id, venue, date, start_time, end_time, category, scenario, gms, gm_roles, capacity, notes)
 VALUES ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-0000000000b1','架空店','2031-02-01','10:00','14:00','open','',ARRAY[]::text[],'{}',6,'case0');
INSERT INTO calls SELECT 'case0', id, NULL, NULL FROM public.schedule_events WHERE notes='case0';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.sync_event_staff_participations((SELECT id FROM calls WHERE label='case0'),'[]','[]',ARRAY['存在しないGM'],'{}','{"gms":[],"gm_roles":{}}');
 UPDATE calls SET err='同期が成功した' WHERE label='case0';
EXCEPTION WHEN OTHERS THEN UPDATE calls SET err=SQLERRM, code=SQLSTATE WHERE label='case0';
END $$;

SELECT pg_temp.try_create('case1', pg_temp.ev('case1'), ARRAY['存在しないGM'], '{}', '[]');
SELECT pg_temp.try_create('case2', pg_temp.ev('case2'), ARRAY['架空GM'], '{"架空GM":"main"}', '[]');
SELECT pg_temp.try_create('case3', pg_temp.ev('case3'), ARRAY['架空GM','架空参加'], '{"架空GM":"main","架空参加":"staff"}',
 '[{"staff_id":"dddddddd-0000-4000-8000-0000000000c2","mode":"additional","reservation_id":null}]');
SELECT pg_temp.try_create('case4', pg_temp.ev('case4', p_capacity => 1), ARRAY['架空GM','架空参加'], '{"架空GM":"main","架空参加":"staff"}',
 '[{"staff_id":"dddddddd-0000-4000-8000-0000000000c2","mode":"additional","reservation_id":null}]');
-- 定員 1 に対して 1 席は通るので、定員 0 相当（未設定）で確かめる
SELECT pg_temp.try_create('case4b', pg_temp.ev('case4b', p_capacity => 0), ARRAY['架空参加'], '{"架空参加":"staff"}',
 '[{"staff_id":"dddddddd-0000-4000-8000-0000000000c2","mode":"additional","reservation_id":null}]');
SELECT pg_temp.try_create('case5', pg_temp.ev('case5'), ARRAY['架空参加'], '{"架空参加":"staff"}', '[]');
-- 10) 結果が分からなかった保存を同じ要求 ID で保存し直しても、公演は 1 件（同じ ID を返す）
SELECT pg_temp.try_create('case10a', pg_temp.ev('case10'), ARRAY['架空GM'], '{"架空GM":"main"}', '[]', 'dddddddd-0000-4000-8000-0000000010aa');
SELECT pg_temp.try_create('case10b', pg_temp.ev('case10'), ARRAY['架空GM'], '{"架空GM":"main"}', '[]', 'dddddddd-0000-4000-8000-0000000010aa');
-- 10c) 要求 ID が違えば（別の保存）、同じ入力でも別に作る（従来の同じ枠への複数公演を妨げない）
SELECT pg_temp.try_create('case10c', pg_temp.ev('case10'), ARRAY['架空GM'], '{"架空GM":"main"}', '[]');
-- 11) GM 未指定もこの関数で作成でき、担当の同期は走らず、作成履歴は同じ取引で記録される
SELECT pg_temp.try_create('case11', pg_temp.ev('case11'), ARRAY[]::text[], '{}', '[]');
SELECT pg_temp.try_create('case6', pg_temp.ev('case6', 'dddddddd-0000-4000-8000-0000000000b2'), ARRAY['架空GM'], '{}', '[]');
-- 7) 作成後に古い expectedStaff（空）で同期 → 拒否（競合検知は維持）
DO $$ DECLARE r jsonb; BEGIN
 r := public.sync_event_staff_participations((SELECT id FROM calls WHERE label='case2'),'[]','[]',ARRAY[]::text[],'{}','{"gms":[],"gm_roles":{}}');
 INSERT INTO calls VALUES ('case7', NULL, r->>'error', r->>'code');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"dddddddd-0000-4000-8000-0000000000a2","role":"authenticated"}',true);
SELECT pg_temp.try_create('case8', pg_temp.ev('case8'), ARRAY['架空GM'], '{}', '[]');
-- 14) 照合（find_schedule_event_create_request）: 自分の要求 ID は公演 ID、知らない ID と他人の要求 ID は NULL（下で確認）
-- 12) 別の利用者（同じ組織の管理者）が同じ要求 ID を使っても、他人の公演は返さない
SELECT set_config('request.jwt.claims','{"sub":"dddddddd-0000-4000-8000-0000000000a3","role":"authenticated"}',true);
SELECT pg_temp.try_create('case12', pg_temp.ev('case12'), ARRAY[]::text[], '{}', '[]', 'dddddddd-0000-4000-8000-0000000010aa');
DO $$ BEGIN
 INSERT INTO calls VALUES ('case14_other', public.find_schedule_event_create_request('dddddddd-0000-4000-8000-0000000010aa'), NULL, NULL);
END $$;
SELECT set_config('request.jwt.claims','{"sub":"dddddddd-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
DO $$ BEGIN
 INSERT INTO calls VALUES ('case14_own', public.find_schedule_event_create_request('dddddddd-0000-4000-8000-0000000010aa'), NULL, NULL);
 INSERT INTO calls VALUES ('case14_none', public.find_schedule_event_create_request('dddddddd-0000-4000-8000-00000000dead'), NULL, NULL);
END $$;
-- 9) anon は実行権限が無いことを権限表で確かめる（anon で pg_temp の関数から権限の無い関数を呼ぶと、
--    PostgreSQL 17.6 では例外処理の中でサーバーが落ちる。既存の関数でも同じで今回の関数とは無関係。17.11 では落ちない）
SET LOCAL ROLE postgres;

INSERT INTO results SELECT '0_old_two_step_leaves_empty_gm_event', c.err IS NOT NULL AND c.err<>'同期が成功した' AND cardinality(e.gms)=0, c.err
 FROM calls c JOIN public.schedule_events e ON e.id=c.id WHERE c.label='case0';
INSERT INTO results SELECT '1_unknown_gm_rolls_back_event', c.id IS NULL AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case1'), c.err FROM calls c WHERE label='case1';
INSERT INTO results SELECT '2_created_with_gm',
  e.gms=ARRAY['架空GM'] AND e.gm_roles='{"架空GM":"main"}'::jsonb AND e.organization_id='dddddddd-0000-4000-8000-000000000001' AND e.id<>'dddddddd-0000-4000-8000-00000000ffff'
  AND e.time_slot='朝' AND e.capacity=6 AND e.is_reservation_enabled=false
  AND EXISTS(SELECT 1 FROM public.schedule_event_staff_assignments a WHERE a.event_id=e.id AND a.staff_id='dddddddd-0000-4000-8000-0000000000c1' AND a.role='main')
  AND EXISTS(SELECT 1 FROM public.schedule_event_history h WHERE h.schedule_event_id=e.id AND h.notes='担当とスタッフ参加人数を一括保存'),
  c.err
 FROM calls c LEFT JOIN public.schedule_events e ON e.id=c.id WHERE c.label='case2';
-- 作成履歴は同じ取引で、確定した公演（担当込み）の内容で 1 件だけ入り、担当の一括保存の履歴より前に並ぶ。
-- 作成が成功した＝履歴もある（保存直後に画面を離れても欠けない契約。実際の画面離脱は未試験）。失敗した作成には履歴が無い。
-- 作成直後の別の編集（B）は作成履歴の値を変えない
UPDATE public.schedule_events SET notes='B の編集' WHERE id=(SELECT id FROM calls WHERE label='case3');
INSERT INTO results SELECT '2c_later_edit_not_in_create_history',
  (SELECT h.new_values->>'notes' FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')='case3', c.err
 FROM calls c WHERE c.label='case3';
INSERT INTO results SELECT '2b_create_history_same_tx',
  (SELECT count(*) FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')=1
  AND (SELECT h.new_values->'gms' FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')='["架空GM"]'::jsonb
  AND (SELECT h.changed_by_name FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')='架空GM'
  AND (SELECT h.time_slot FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')='朝'
  AND (SELECT h.created_at FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.action_type='create')
    < (SELECT h.created_at FROM public.schedule_event_history h WHERE h.schedule_event_id=c.id AND h.notes='担当とスタッフ参加人数を一括保存')
  AND NOT EXISTS(SELECT 1 FROM public.schedule_event_history h JOIN calls f ON f.label IN ('case1','case4b','case5') WHERE h.new_values->>'notes'=f.label),
  c.err
 FROM calls c WHERE c.label='case2';
INSERT INTO results SELECT '3_staff_seat_created_same_tx',
  (SELECT count(*) FROM public.reservations r WHERE r.schedule_event_id=c.id AND r.reservation_source='staff_entry' AND r.participant_count=1 AND r.status='confirmed')=1, c.err
 FROM calls c WHERE label='case3';
INSERT INTO results SELECT '4_capacity_ok_one_seat', c.id IS NOT NULL, c.err FROM calls c WHERE label='case4';
INSERT INTO results SELECT '4b_capacity_rolls_back_event', c.id IS NULL AND c.code='23514' AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case4b'), c.err FROM calls c WHERE label='case4b';
INSERT INTO results SELECT '5_missing_entry_rolls_back_event', c.id IS NULL AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case5'), c.err FROM calls c WHERE label='case5';
INSERT INTO results SELECT '6_other_org_store_rejected', c.id IS NULL AND c.code='42501' AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case6'), c.err FROM calls c WHERE label='case6';
INSERT INTO results SELECT '7_stale_expected_staff_rejected', c.code='40001' AND (SELECT gms FROM public.schedule_events WHERE notes='case2')=ARRAY['架空GM'], c.err FROM calls c WHERE label='case7';
INSERT INTO results SELECT '8_customer_rejected', c.id IS NULL AND c.code='42501' AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case8'), c.err FROM calls c WHERE label='case8';
INSERT INTO results SELECT '10_same_request_id_creates_once',
  (SELECT count(*) FROM public.schedule_events WHERE notes='case10')=2
  AND (SELECT id FROM calls WHERE label='case10a') = (SELECT id FROM calls WHERE label='case10b')
  AND (SELECT id FROM calls WHERE label='case10c') <> (SELECT id FROM calls WHERE label='case10a')
  AND (SELECT count(*) FROM public.schedule_event_history h JOIN calls c ON c.id=h.schedule_event_id AND c.label='case10a' WHERE h.action_type='create')=1,
  (SELECT string_agg(coalesce(err,'ok'),' / ') FROM calls WHERE label LIKE 'case10%');
INSERT INTO results SELECT '11_no_gm_created_with_create_history_same_tx',
  e.id IS NOT NULL AND cardinality(e.gms)=0
  AND (SELECT count(*) FROM public.schedule_event_history h WHERE h.schedule_event_id=e.id AND h.action_type='create' AND h.new_values->>'notes'='case11')=1
  AND NOT EXISTS(SELECT 1 FROM public.schedule_event_history h WHERE h.schedule_event_id=e.id AND h.notes='担当とスタッフ参加人数を一括保存'),
  c.err
 FROM calls c LEFT JOIN public.schedule_events e ON e.id=c.id WHERE c.label='case11';
INSERT INTO results SELECT '12_request_id_of_other_user_rejected', c.id IS NULL AND c.code='22023' AND NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE notes='case12'), c.err FROM calls c WHERE label='case12';
INSERT INTO results SELECT '13_request_table_not_readable_by_browser', NOT has_table_privilege('authenticated','public.schedule_event_create_requests','SELECT') AND NOT has_table_privilege('anon','public.schedule_event_create_requests','SELECT'), NULL;
INSERT INTO results SELECT '14_find_create_request',
  (SELECT id FROM calls WHERE label='case14_own')=(SELECT id FROM calls WHERE label='case10a')
  AND (SELECT id FROM calls WHERE label='case14_none') IS NULL AND (SELECT id FROM calls WHERE label='case14_other') IS NULL
  AND NOT has_function_privilege('anon','public.find_schedule_event_create_request(uuid)','EXECUTE'), NULL;
INSERT INTO results SELECT '9_anon_rejected', NOT has_function_privilege('anon','public.create_schedule_event_with_staff(uuid,jsonb,text[],jsonb,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.find_schedule_event_create_request(uuid)','EXECUTE'), NULL;

SELECT label, ok, left(coalesce(detail,''), 80) AS detail FROM results ORDER BY label;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM results WHERE NOT ok) OR (SELECT count(*) FROM results) <> 18 THEN RAISE EXCEPTION 'create_schedule_event_with_staff: 失敗あり'; END IF;
END $$;
ROLLBACK;
