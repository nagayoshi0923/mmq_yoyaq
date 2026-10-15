-- 候補日カレンダーの空き判定（private_booking_candidate_slot_availability / private_group_candidate_slot_availability）と
-- 保存 RPC（private_group_add_candidate_dates）が同じ結論になることを確かめる。手元の試験データ（supabase/seed.sql）を使い、最後に戻す。
-- 実行: psql "$(npx supabase status --output json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 -f supabase/tests/private_candidate_slot_availability.sql
BEGIN;
DO $$
DECLARE
 org uuid:='00000000-0000-4000-a000-000000000001';
 grp uuid:='0160f91a-f84c-43fd-8e46-dda15d1005d7';
 organizer uuid:='00000000-0000-4000-b000-000000000011';
 sm uuid:='00000000-0000-4000-a000-000000000202';
 st1 uuid:='00000000-0000-4000-a000-000000000101';
 st2 uuid:='00000000-0000-4000-a000-000000000102';
 d date; r record; msg text; n integer;
BEGIN
 -- 締切より後の平日（月曜）
 d:=current_date+40; d:=d+((8-extract(isodow FROM d)::integer)%7);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',organizer,'role','authenticated')::text,true);
 DELETE FROM private_group_candidate_dates WHERE group_id=grp;
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=ARRAY[st2] WHERE id=grp;

 -- 1) 作品の上演店舗が希望店舗に無い → 全枠 no_store_for_scenario、保存も理由付きで弾く
 UPDATE organization_scenarios SET available_stores=ARRAY[st1::text] WHERE organization_id=org AND scenario_master_id=sm;
 SELECT count(*) INTO n FROM private_group_candidate_slot_availability(grp,d,d) a WHERE NOT a.available AND a.reason='no_store_for_scenario';
 ASSERT n=3, format('no_store_for_scenario が 3 枠でない: %s', n);
 BEGIN
  PERFORM private_group_add_candidate_dates(grp,gen_random_uuid(),sm,ARRAY[st2],jsonb_build_array(jsonb_build_object('date',d,'time_slot','evening','start_time','19:00','end_time','22:30')));
  RAISE EXCEPTION '上演できない店舗だけで保存できた';
 EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  ASSERT msg LIKE '%この作品を上演できる店舗が希望店舗にありません%', msg;
 END;

 -- 2) 上演できる店舗で、夜に他公演（準備時間込みで重なる）→ 夜は conflict、昼は選べて保存も通る
 UPDATE organization_scenarios SET available_stores=ARRAY[st1::text,st2::text] WHERE organization_id=org AND scenario_master_id=sm;
 INSERT INTO schedule_events(organization_id,store_id,date,venue,scenario,start_time,end_time,is_cancelled)
  VALUES(org,st2,d,'試験 二号店','重なり確認','19:00','23:00',false);
 SELECT * INTO r FROM private_group_candidate_slot_availability(grp,d,d) a WHERE a.time_slot='evening';
 ASSERT NOT r.available AND r.reason='conflict', format('夜が conflict でない: %s', row_to_json(r));
 BEGIN
  PERFORM private_group_add_candidate_dates(grp,gen_random_uuid(),sm,ARRAY[st2],jsonb_build_array(jsonb_build_object('date',d,'time_slot','evening','start_time','19:00','end_time','22:30')));
  RAISE EXCEPTION '他公演と重なる夜を保存できた';
 EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  ASSERT msg LIKE '%他の公演と重なります%', msg;
 END;
 SELECT * INTO r FROM private_group_candidate_slot_availability(grp,d,d) a WHERE a.time_slot='afternoon';
 ASSERT r.available AND r.start_time IS NOT NULL, format('昼が選べない: %s', row_to_json(r));
 PERFORM private_group_add_candidate_dates(grp,gen_random_uuid(),sm,ARRAY[st2],jsonb_build_array(jsonb_build_object('date',d,'time_slot','afternoon','start_time',r.start_time,'end_time',r.end_time)));
 SELECT * INTO r FROM private_group_candidate_slot_availability(grp,d,d) a WHERE a.time_slot='afternoon';
 ASSERT NOT r.available AND r.reason='already_added', format('追加済みにならない: %s', row_to_json(r));

 -- 3) 受付停止 → blocked（翌日）
 INSERT INTO schedule_blocked_slots(organization_id,store_id,date,time_slot) VALUES(org,st2::text,d+1,'evening');
 SELECT * INTO r FROM private_booking_candidate_slot_availability(org,sm,ARRAY[st2],d+1,d+1) a WHERE a.time_slot='evening';
 ASSERT NOT r.available AND r.reason='blocked', format('受付停止が blocked でない: %s', row_to_json(r));

 -- 4) 選べると返した枠は、すべて保存 RPC でも通る（翌々日〜1 週間）
 n:=0;
 FOR r IN SELECT * FROM private_group_candidate_slot_availability(grp,d+2,d+8) a WHERE a.available LOOP
  n:=n+1;
  PERFORM private_group_add_candidate_dates(grp,gen_random_uuid(),sm,ARRAY[st2],jsonb_build_array(jsonb_build_object('date',r.date,'time_slot',r.time_slot,'start_time',r.start_time,'end_time',r.end_time)));
 END LOOP;
 ASSERT n>=10, format('選べる枠が少なすぎる: %s', n);

 -- 5) 参加者でない人は呼べない
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 BEGIN
  PERFORM * FROM private_group_candidate_slot_availability(grp,d,d);
  RAISE EXCEPTION '参加者でない人が空き状況を読めた';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
