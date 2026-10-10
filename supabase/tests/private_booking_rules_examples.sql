-- docs/product-spec/貸切受付ルール.md の「例」の表をそのまま確かめる（番号 R1〜 は表の番号と同じ）。
-- 表の行を変えたら、ここも同じ PR で変える。手元の試験データ（supabase/seed.sql）を使い、最後に戻す。
-- 実行: npm run test:rpcs（または psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/private_booking_rules_examples.sql）
-- 前提（表の「共通の前提」と同じ）: 店舗は毎日 10:00〜23:00 営業、枠の標準開始は 平日 午前10:00・午後13:00・夜19:00 /
-- 土日祝 午前10:00・午後14:00・夜19:00。準備時間 60 分。作品の時間帯の制限なし。
BEGIN;
CREATE TEMP TABLE _rule_rows(no text, date date, slot text, ok boolean, start_time text, end_time text, reason text, detail text, adjusted boolean);
CREATE TEMP TABLE _ctx(org uuid, sm uuid, st1 uuid, st2 uuid, grp uuid);
INSERT INTO _ctx VALUES('00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000202',
 '00000000-0000-4000-a000-000000000101','00000000-0000-4000-a000-000000000102','0160f91a-f84c-43fd-8e46-dda15d1005d7');
-- 締切より後の、祝日でない k 番目の月曜・土曜
CREATE FUNCTION pg_temp.day_of(p_isodow integer, p_k integer) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT d FROM (SELECT current_date+40+i AS d FROM generate_series(0,400) i) s
 WHERE extract(isodow FROM d)=p_isodow AND NOT public.is_booking_calendar_holiday(d)
 ORDER BY d OFFSET p_k LIMIT 1 $$;

-- R の 1 行を準備して判定し、期待と比べ、選べるなら保存 RPC でも通ることを確かめる
CREATE FUNCTION pg_temp.check_row(p_no text, p_date date, p_stores uuid[], p_slot text, p_ok boolean, p_start text, p_end text, p_reason text, p_detail text, p_adjusted boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE c _ctx; r record;
BEGIN
 SELECT * INTO c FROM _ctx;
 SELECT * INTO r FROM private_booking_candidate_slot_availability(c.org,c.sm,p_stores,p_date,p_date) a WHERE a.time_slot=p_slot;
 INSERT INTO _rule_rows VALUES(p_no,p_date,p_slot,r.available,r.start_time,r.end_time,r.reason,r.detail,r.adjusted);
 ASSERT r.available IS NOT DISTINCT FROM p_ok AND r.start_time IS NOT DISTINCT FROM p_start AND r.end_time IS NOT DISTINCT FROM p_end
  AND r.reason IS NOT DISTINCT FROM p_reason AND r.detail IS NOT DISTINCT FROM p_detail AND r.adjusted IS NOT DISTINCT FROM p_adjusted,
  format('%s %s %s: 期待 ok=%s %s〜%s reason=%s detail=%s adjusted=%s / 実際 %s', p_no, p_date, p_slot, p_ok, p_start, p_end, p_reason, p_detail, p_adjusted, row_to_json(r));
 IF p_ok THEN
  DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
  UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=p_stores WHERE id=c.grp;
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,p_stores,
   jsonb_build_array(jsonb_build_object('date',p_date,'time_slot',p_slot,'start_time',p_start,'end_time',p_end)));
  DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 END IF;
END $$;
CREATE FUNCTION pg_temp.ev(p_store uuid, p_date date, p_start text, p_end text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO schedule_events(organization_id,store_id,date,venue,scenario,start_time,end_time,is_cancelled)
 SELECT org,p_store,p_date,'試験','規則の例',p_start::time,p_end::time,false FROM _ctx $$;
CREATE FUNCTION pg_temp.dur(p_minutes integer) RETURNS void LANGUAGE sql AS $$
 UPDATE organization_scenarios SET duration=p_minutes,weekend_duration=NULL,override_title=NULL,private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL
 WHERE organization_id=(SELECT org FROM _ctx) AND scenario_master_id=(SELECT sm FROM _ctx) $$;

DO $$
DECLARE c _ctx; one uuid[]; two uuid[]; hours jsonb:='{}'; dname text; msg text; w date;
BEGIN
 SELECT * INTO c FROM _ctx; one:=ARRAY[c.st2]; two:=ARRAY[c.st1,c.st2];
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-b000-000000000011','role','authenticated')::text,true);
 FOREACH dname IN ARRAY ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] LOOP
  hours:=hours||jsonb_build_object(dname,jsonb_build_object('is_open',true,'open_time','10:00','close_time','23:00',
   'available_slots','["morning","afternoon","evening"]'::jsonb,
   'slot_start_times',jsonb_build_object('morning','10:00','afternoon',CASE WHEN dname IN ('saturday','sunday') THEN '14:00' ELSE '13:00' END,'evening','19:00')));
 END LOOP;
 DELETE FROM business_hours_settings WHERE organization_id=c.org;
 INSERT INTO business_hours_settings(organization_id,store_id,opening_hours) VALUES(c.org,c.st1,hours),(c.org,c.st2,hours);
 UPDATE organization_scenarios SET available_stores=ARRAY[c.st1::text,c.st2::text] WHERE organization_id=c.org AND scenario_master_id=c.sm;

 -- R1 公演なし・所要 3 時間 30 分 → 3 枠とも標準開始
 w:=pg_temp.day_of(1,0); PERFORM pg_temp.dur(210);
 PERFORM pg_temp.check_row('R1',w,one,'morning',true,'10:00','13:30',NULL,NULL,false);
 PERFORM pg_temp.check_row('R1',w,one,'afternoon',true,'13:00','16:30',NULL,NULL,false);
 PERFORM pg_temp.check_row('R1',w,one,'evening',true,'19:00','22:30',NULL,NULL,false);

 -- R2 ① 前後の公演の隙間にぴったり: 12:00〜16:30 と 22:00〜23:00 の公演、所要 3 時間 30 分 → 17:30〜21:00
 w:=pg_temp.day_of(1,1); PERFORM pg_temp.dur(210); PERFORM pg_temp.ev(c.st2,w,'12:00','16:30'); PERFORM pg_temp.ev(c.st2,w,'22:00','23:00');
 PERFORM pg_temp.check_row('R2',w,one,'morning',false,NULL,NULL,'conflict','空き 1 時間・必要 3 時間 30 分',false);
 PERFORM pg_temp.check_row('R2',w,one,'afternoon',true,'17:30','21:00',NULL,NULL,true);
 PERFORM pg_temp.check_row('R2',w,one,'evening',true,'17:30','21:00',NULL,NULL,true);

 -- R3 ② 隙間が足りない: R2 と同じ公演、所要 4 時間 → 選べない（空き 3 時間 30 分・必要 4 時間）
 w:=pg_temp.day_of(1,2); PERFORM pg_temp.dur(240); PERFORM pg_temp.ev(c.st2,w,'12:00','16:30'); PERFORM pg_temp.ev(c.st2,w,'22:00','23:00');
 PERFORM pg_temp.check_row('R3',w,one,'afternoon',false,NULL,NULL,'conflict','空き 3 時間 30 分・必要 4 時間',false);
 PERFORM pg_temp.check_row('R3',w,one,'evening',false,NULL,NULL,'conflict','空き 3 時間 30 分・必要 4 時間',false);
 BEGIN
  UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','17:30','end_time','21:30')));
  RAISE EXCEPTION 'R3: 入らない時刻を保存できた';
 EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  ASSERT msg LIKE '%他の公演と重なります（空き 3 時間 30 分・必要 4 時間）%', msg;
 END;

 -- R4 ③ 夜の受付停止に午後枠がかかる: 午前 10:00〜12:00 の公演＋夜の受付停止、所要 7 時間 → 午後・夜とも受付停止
 w:=pg_temp.day_of(1,3); PERFORM pg_temp.dur(420); PERFORM pg_temp.ev(c.st2,w,'10:00','12:00');
 INSERT INTO schedule_blocked_slots(organization_id,store_id,date,time_slot) VALUES(c.org,c.st2::text,w,'evening');
 PERFORM pg_temp.check_row('R4',w,one,'afternoon',false,NULL,NULL,'blocked',NULL,false);
 PERFORM pg_temp.check_row('R4',w,one,'evening',false,NULL,NULL,'blocked',NULL,false);

 -- R5 ④ 夜に公演が無い: R4 から受付停止を外す → 午後 13:00〜20:00（夜にかかってよい）、夜は 16:00〜23:00 に繰り上げ
 w:=pg_temp.day_of(1,4); PERFORM pg_temp.dur(420); PERFORM pg_temp.ev(c.st2,w,'10:00','12:00');
 PERFORM pg_temp.check_row('R5',w,one,'afternoon',true,'13:00','20:00',NULL,NULL,false);
 PERFORM pg_temp.check_row('R5',w,one,'evening',true,'16:00','23:00',NULL,NULL,true);

 -- R6 夜の繰り上げ（旧「23:00−所要時間」の特例と同じ結果）: 公演なし、所要 5 時間 → 夜 18:00〜23:00
 w:=pg_temp.day_of(1,5); PERFORM pg_temp.dur(300);
 PERFORM pg_temp.check_row('R6',w,one,'evening',true,'18:00','23:00',NULL,NULL,true);

 -- R7 夜の繰り上げで前に公演: 13:00〜17:30 の公演、所要 5 時間 → 18:30 開始だと 23:30 で閉店を超える
 w:=pg_temp.day_of(1,6); PERFORM pg_temp.dur(300); PERFORM pg_temp.ev(c.st2,w,'13:00','17:30');
 PERFORM pg_temp.check_row('R7',w,one,'evening',false,NULL,NULL,'conflict','空き 4 時間 30 分・必要 5 時間',false);
 -- R8 同じで前の公演が 17:00 まで → 18:00〜23:00
 w:=pg_temp.day_of(1,7); PERFORM pg_temp.dur(300); PERFORM pg_temp.ev(c.st2,w,'13:00','17:00');
 PERFORM pg_temp.check_row('R8',w,one,'evening',true,'18:00','23:00',NULL,NULL,true);

 -- R9 午後に前の公演: 10:00〜13:30 の公演、所要 3 時間 → 午後は 14:30〜17:30（前の公演の終わり＋準備時間）
 w:=pg_temp.day_of(1,8); PERFORM pg_temp.dur(180); PERFORM pg_temp.ev(c.st2,w,'10:00','13:30');
 PERFORM pg_temp.check_row('R9',w,one,'afternoon',true,'14:30','17:30',NULL,NULL,true);

 -- R10 受付停止だけ: 午後・夜を受付停止、所要 7 時間 → 午前も入らない（受付停止）
 w:=pg_temp.day_of(1,9); PERFORM pg_temp.dur(420);
 INSERT INTO schedule_blocked_slots(organization_id,store_id,date,time_slot) VALUES(c.org,c.st2::text,w,'afternoon'),(c.org,c.st2::text,w,'evening');
 PERFORM pg_temp.check_row('R10',w,one,'morning',false,NULL,NULL,'blocked',NULL,false);

 -- R11 店舗の休業日 → 営業時間外
 w:=pg_temp.day_of(1,10); PERFORM pg_temp.dur(210);
 UPDATE business_hours_settings SET holidays=ARRAY[w::text] WHERE organization_id=c.org AND store_id=c.st2;
 PERFORM pg_temp.check_row('R11',w,one,'afternoon',false,NULL,NULL,'closed',NULL,false);
 UPDATE business_hours_settings SET holidays=NULL WHERE organization_id=c.org AND store_id=c.st2;

 -- R12 貸切募集停止期間 → 全日 受付停止
 w:=pg_temp.day_of(1,11); PERFORM pg_temp.dur(210);
 INSERT INTO store_recruitment_pauses(organization_id,store_id,pause_type,starts_on,ends_on) VALUES(c.org,c.st2,'private',w,w);
 PERFORM pg_temp.check_row('R12',w,one,'afternoon',false,NULL,NULL,'blocked',NULL,false);

 -- R13 複数店舗: 本店は 13:00〜16:00、二号店は 13:00〜14:00 に公演、所要 3 時間 → 早く始められる二号店の 15:00〜18:00
 w:=pg_temp.day_of(1,12); PERFORM pg_temp.dur(180); PERFORM pg_temp.ev(c.st1,w,'13:00','16:00'); PERFORM pg_temp.ev(c.st2,w,'13:00','14:00');
 PERFORM pg_temp.check_row('R13',w,two,'afternoon',true,'15:00','18:00',NULL,NULL,true);
 -- R14 複数店舗: 本店は空き、二号店は午後に公演 → 標準開始で入る本店の 13:00〜16:00
 w:=pg_temp.day_of(1,13); PERFORM pg_temp.dur(180); PERFORM pg_temp.ev(c.st2,w,'13:00','16:00');
 PERFORM pg_temp.check_row('R14',w,two,'afternoon',true,'13:00','16:00',NULL,NULL,false);

 -- R15 土曜: 公演なし、所要 3 時間 → 午後は土日祝の標準 14:00
 w:=pg_temp.day_of(6,0); PERFORM pg_temp.dur(180);
 PERFORM pg_temp.check_row('R15',w,one,'afternoon',true,'14:00','17:00',NULL,NULL,false);

 -- R16 特例（戦塵のレガストリア／BeatSpecter の土日祝の夜は 19:30）: 所要 3 時間 → 19:30〜22:30
 w:=pg_temp.day_of(6,1); PERFORM pg_temp.dur(180);
 UPDATE organization_scenarios SET override_title='戦塵のレガストリア（試験）' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R16',w,one,'evening',true,'19:30','22:30',NULL,NULL,false);
 -- R17 同じ特例で 17:00 まで公演があっても 19:30 より前には始めない
 w:=pg_temp.day_of(6,2); PERFORM pg_temp.dur(180); PERFORM pg_temp.ev(c.st2,w,'14:00','17:00');
 UPDATE organization_scenarios SET override_title='戦塵のレガストリア（試験）' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R17',w,one,'evening',true,'19:30','22:30',NULL,NULL,false);
 -- R18 同じ特例で所要 4 時間 → 19:30 開始だと 23:30 になるので 19:00〜23:00 に繰り上げ（旧特例と同じ）
 w:=pg_temp.day_of(6,3); PERFORM pg_temp.dur(240);
 UPDATE organization_scenarios SET override_title='戦塵のレガストリア（試験）' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R18',w,one,'evening',true,'19:00','23:00',NULL,NULL,true);

 -- R19 作品の時間帯設定で夜を選べない → slot_not_allowed
 w:=pg_temp.day_of(1,14); PERFORM pg_temp.dur(180);
 UPDATE organization_scenarios SET private_booking_time_slots=ARRAY['午前','午後'] WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R19',w,one,'evening',false,NULL,NULL,'slot_not_allowed',NULL,false);

 -- R20 作品を上演できる店舗が希望店舗に無い → no_store_for_scenario
 w:=pg_temp.day_of(1,15); PERFORM pg_temp.dur(180);
 UPDATE organization_scenarios SET available_stores=ARRAY[c.st1::text] WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R20',w,one,'afternoon',false,NULL,NULL,'no_store_for_scenario',NULL,false);
 UPDATE organization_scenarios SET available_stores=ARRAY[c.st1::text,c.st2::text] WHERE organization_id=c.org AND scenario_master_id=c.sm;

 -- R21 受付締切より前の日 → past_deadline
 PERFORM pg_temp.check_row('R21',current_date,one,'afternoon',false,NULL,NULL,'past_deadline',NULL,false);
END $$;
SELECT no,date,slot,ok,start_time,end_time,reason,detail,adjusted FROM _rule_rows ORDER BY substring(no FROM 2)::integer, date, array_position(ARRAY['morning','afternoon','evening'],slot);
ROLLBACK;
