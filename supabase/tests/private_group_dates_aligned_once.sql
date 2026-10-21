-- 日程がそろった通知は、参加中の全員が全候補日に回答し終えたときに 1 回だけ（2026-10-20 staging 点検）。
-- 新しい候補日を足すと回が変わり、そろい直したらもう一度だけ送る。時間帯は「夜」と書く。全部巻き戻す。
BEGIN;
ALTER TABLE public.private_group_candidate_dates DISABLE TRIGGER enforce_private_group_candidate_deadline;
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('dddddddd-0000-4000-8000-000000000001', '通知テスト', 'notice-test-dates-aligned', true);
INSERT INTO auth.users(id, email) VALUES
 ('dddddddd-0000-4000-8000-0000000000a1', 'organizer-aligned@example.invalid'),
 ('dddddddd-0000-4000-8000-0000000000a2', 'member-aligned@example.invalid');
INSERT INTO public.private_groups(id, organization_id, organizer_id, invite_code, status, name)
 VALUES ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-0000000000a1', 'ALIGNTEST1', 'gathering', 'そろいテスト');
INSERT INTO public.private_group_members(id, group_id, user_id, status, is_organizer, guest_name) VALUES
 ('dddddddd-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-0000000000a1', 'joined', true, '主催'),
 ('dddddddd-0000-4000-8000-000000000022', 'dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-0000000000a2', 'joined', false, '会員'),
 ('dddddddd-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000010', NULL, 'joined', false, 'ゲスト');
INSERT INTO public.private_group_candidate_dates(id, group_id, date, time_slot, start_time, end_time, order_num, created_at) VALUES
 ('dddddddd-0000-4000-8000-000000000031', 'dddddddd-0000-4000-8000-000000000010', '2099-03-01', '夜間', '19:00', '23:00', 1, now() - interval '1 hour'),
 ('dddddddd-0000-4000-8000-000000000032', 'dddddddd-0000-4000-8000-000000000010', '2099-03-02', '午後', '14:00', '18:00', 2, now() - interval '1 hour'),
 ('dddddddd-0000-4000-8000-000000000033', 'dddddddd-0000-4000-8000-000000000010', '2099-03-03', '午後', '14:00', '18:00', 3, now() - interval '1 hour');

CREATE TEMP VIEW aligned_bells AS SELECT * FROM public.user_notifications WHERE metadata->>'kind' = 'private_dates_aligned' AND metadata->>'group_id' = 'dddddddd-0000-4000-8000-000000000010';
CREATE TEMP VIEW aligned_mails AS SELECT * FROM public.customer_notice_emails WHERE kind = 'private_dates_aligned' AND dedupe_key LIKE 'private_dates_aligned:dddddddd-0000-4000-8000-000000000010:%';

-- 主催者と会員は全候補日に ○、ゲストが 1 つずつ回答する。最後の 1 件までは送らない
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response)
SELECT 'dddddddd-0000-4000-8000-000000000010', m, c, 'ok'
FROM unnest(ARRAY['dddddddd-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000022']::uuid[]) m
CROSS JOIN unnest(ARRAY['dddddddd-0000-4000-8000-000000000031', 'dddddddd-0000-4000-8000-000000000032', 'dddddddd-0000-4000-8000-000000000033']::uuid[]) c;
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response) VALUES
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000031', 'ok');
DO $$ BEGIN ASSERT (SELECT count(*) FROM aligned_bells) = 0, '全候補日に回答し終える前に送った（全員 ○ の日ができた時点）'; END $$;
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response) VALUES
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000032', 'ok');
DO $$ BEGIN ASSERT (SELECT count(*) FROM aligned_bells) = 0, '2 件目でも送った'; END $$;
-- 最後の回答は ×。全員 ○ の日（3/1）があるので、ここで 1 回だけ送る
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response) VALUES
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000033', 'ng');
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM aligned_bells) = 2, format('主催者と会員に 1 通ずつのはず: %s', (SELECT count(*) FROM aligned_bells));
 ASSERT (SELECT count(*) FROM aligned_mails) = 1, '主催者へのメールは 1 通';
 ASSERT (SELECT bool_and(message LIKE '%3月1日%夜 なら%' OR message LIKE '%夜 なら%') FROM aligned_bells), (SELECT string_agg(message, ' / ') FROM aligned_bells);
 ASSERT NOT EXISTS (SELECT 1 FROM aligned_bells WHERE message LIKE '%夜間%'), '「夜間」と書いた';
END $$;
-- 回答を変えても、同じ回ではもう送らない
UPDATE public.private_group_date_responses SET response = 'maybe' WHERE candidate_date_id = 'dddddddd-0000-4000-8000-000000000033' AND member_id = 'dddddddd-0000-4000-8000-000000000023';
UPDATE public.private_group_date_responses SET response = 'ok' WHERE candidate_date_id = 'dddddddd-0000-4000-8000-000000000033' AND member_id = 'dddddddd-0000-4000-8000-000000000023';
DO $$ BEGIN ASSERT (SELECT count(*) FROM aligned_bells) = 2, '同じ回で 2 回目を送った'; ASSERT (SELECT count(*) FROM aligned_mails) = 1; END $$;

-- 新しい候補日を足す → 未回答の間は送らず、全員がそろい直したらもう一度だけ
INSERT INTO public.private_group_candidate_dates(id, group_id, date, time_slot, start_time, end_time, order_num, created_at) VALUES
 ('dddddddd-0000-4000-8000-000000000034', 'dddddddd-0000-4000-8000-000000000010', '2099-03-04', '午前', '10:00', '14:00', 4, now());
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response) VALUES
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000034', 'ok'),
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000022', 'dddddddd-0000-4000-8000-000000000034', 'ng');
DO $$ BEGIN ASSERT (SELECT count(*) FROM aligned_bells) = 2, '追加した候補日が未回答のうちに送った'; END $$;
INSERT INTO public.private_group_date_responses(group_id, member_id, candidate_date_id, response) VALUES
 ('dddddddd-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000034', 'ok');
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM aligned_bells) = 4, format('そろい直したら 1 回だけ（計 4 通）のはず: %s', (SELECT count(*) FROM aligned_bells));
 ASSERT (SELECT count(*) FROM aligned_mails) = 2;
END $$;

-- 申込後は送らない
UPDATE public.private_groups SET status = 'booking_requested' WHERE id = 'dddddddd-0000-4000-8000-000000000010';
DO $$ BEGIN ASSERT public.private_group_notice_dates_aligned('dddddddd-0000-4000-8000-000000000010') = false; END $$;
ROLLBACK;
\echo 'private_group_dates_aligned_once: OK'

-- 日時から選ぶ貸切の作品一覧: その日に申し込めない作品だけを理由付きで返す（手元の試験データ supabase/seed.sql を使い、戻す）
BEGIN;
DO $$
DECLARE org uuid:='00000000-0000-4000-a000-000000000001'; d date:=current_date+60; r record; n integer;
 ids uuid[]:=ARRAY['00000000-0000-4000-a000-000000000201','00000000-0000-4000-a000-000000000202','00000000-0000-4000-a000-000000000203']::uuid[];
BEGIN
 UPDATE organization_scenarios SET available_from=NULL, available_until=NULL, booking_start_date=NULL, booking_end_date=NULL WHERE organization_id=org;
 SELECT count(*) INTO n FROM private_booking_scenario_date_reasons(org,d,ids);
 ASSERT n=0, format('制限の無い作品を申し込めないとした: %s', n);
 UPDATE organization_scenarios SET available_until=d-1 WHERE organization_id=org AND scenario_master_id='00000000-0000-4000-a000-000000000201';
 UPDATE organization_scenarios SET booking_end_date=current_date-1 WHERE organization_id=org AND scenario_master_id='00000000-0000-4000-a000-000000000202';
 SELECT count(*) INTO n FROM private_booking_scenario_date_reasons(org,d,ids);
 ASSERT n=2, format('2 作品のはず: %s', n);
 SELECT * INTO r FROM private_booking_scenario_date_reasons(org,d,ids) x WHERE x.scenario_id='00000000-0000-4000-a000-000000000201';
 ASSERT r.reason='outside_period', format('公演期間外のはず: %s', row_to_json(r));
 SELECT * INTO r FROM private_booking_scenario_date_reasons(org,d,ids) x WHERE x.scenario_id='00000000-0000-4000-a000-000000000202';
 ASSERT r.reason='not_recruiting', format('募集期間外のはず: %s', row_to_json(r));
 -- 受付締切より前の日はどの作品も past_deadline（公演期間外より先に締切で弾く）
 SELECT count(*) INTO n FROM private_booking_scenario_date_reasons(org,current_date,ids) x WHERE x.reason IN ('past_deadline','not_recruiting');
 ASSERT n=3, format('締切前の日が 3 作品とも申し込めないになっていない: %s', n);
 -- 渡していない作品・別組織の作品は返さない
 SELECT count(*) INTO n FROM private_booking_scenario_date_reasons(org,d,ARRAY['00000000-0000-4000-a000-000000000201']::uuid[]);
 ASSERT n=1;
END $$;
ROLLBACK;
\echo 'private_booking_scenario_date_reasons: OK'
