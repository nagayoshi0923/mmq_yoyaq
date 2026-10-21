-- docs/product-spec/貸切受付ルール.md の「例」の表をそのまま確かめる（番号 R1〜 は表の番号と同じ）。
-- 表の行を変えたら、ここも同じ PR で変える。手元の試験データ（supabase/seed.sql）を使い、最後に戻す。
-- 実行: npm run test:rpcs（または psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/private_booking_rules_examples.sql）
-- 前提（表の「共通の前提」と同じ）: 店舗は毎日 10:00〜23:00 営業、枠の標準開始は 平日 午前10:00・午後13:00・夜19:00 /
-- 土日祝 午前10:00・午後14:00・夜19:00。準備時間 60 分。作品の時間帯の制限なし。
BEGIN;
-- 試験用の主催者とグループ（seed だけの新しい DB でも通るよう、無ければ作る。最後の ROLLBACK で消える）
\ir fixtures/private_test_group.sql
CREATE TEMP TABLE _rule_rows(no text, date date, slot text, ok boolean, start_time text, end_time text, reason text, detail text, adjusted boolean);
CREATE TEMP TABLE _ctx(org uuid, sm uuid, st1 uuid, st2 uuid, grp uuid);
INSERT INTO _ctx VALUES('00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000202',
 '00000000-0000-4000-a000-000000000101','00000000-0000-4000-a000-000000000102','0160f91a-f84c-43fd-8e46-dda15d1005d7');
-- 締切（14 日）より後の、祝日でない k 番目の月曜・土曜。申し込める範囲（I21。既定 180 日）を超えたら止める
CREATE FUNCTION pg_temp.day_of(p_isodow integer, p_k integer) RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE r date;
BEGIN
 SELECT d INTO r FROM (SELECT current_date+16+i AS d FROM generate_series(0,400) i) s
 WHERE extract(isodow FROM d)=p_isodow AND NOT public.is_booking_calendar_holiday(d)
 ORDER BY d OFFSET p_k LIMIT 1;
 ASSERT r <= (now() AT TIME ZONE 'Asia/Tokyo')::date+180, format('例の日付 %s が申し込める範囲（180 日）を超えます', r);
 RETURN r;
END $$;

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
-- 店舗への申込（申込シート・申込確認画面の送信と同じ RPC）。主催者として送る
CREATE FUNCTION pg_temp.request(p_stores uuid[], p_candidates jsonb) RETURNS uuid LANGUAGE sql AS $$
 SELECT create_private_booking_request((SELECT sm FROM _ctx),'00000000-0000-4000-d000-000000000011','試験 主催者','private-test-organizer@mmq.test','09012345678',5,
  jsonb_build_object('candidates',p_candidates,'requestedStores',(SELECT jsonb_agg(jsonb_build_object('storeId',s)) FROM unnest(p_stores) s)),
  NULL,'R-'||substr(md5(random()::text),1,8),(SELECT grp FROM _ctx)) $$;
CREATE FUNCTION pg_temp.ev(p_store uuid, p_date date, p_start text, p_end text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO schedule_events(organization_id,store_id,date,venue,scenario,start_time,end_time,is_cancelled)
 SELECT org,p_store,p_date,'試験','規則の例',p_start::time,p_end::time,false FROM _ctx $$;
CREATE FUNCTION pg_temp.dur(p_minutes integer) RETURNS void LANGUAGE sql AS $$
 UPDATE organization_scenarios SET duration=p_minutes,weekend_duration=NULL,override_title=NULL,private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL
 WHERE organization_id=(SELECT org FROM _ctx) AND scenario_master_id=(SELECT sm FROM _ctx) $$;

DO $$
DECLARE c _ctx; one uuid[]; two uuid[]; hours jsonb:='{}'; dname text; msg text; w date; created uuid;
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
 UPDATE organization_scenarios SET private_booking_time_slots='{}' WHERE organization_id=c.org AND scenario_master_id=c.sm;

 -- R22〜R24 作品の開始時刻は絶対（2026-10-15 社長決定）: 土日祝の午後 14:30・所要 4 時間 30 分
 UPDATE organization_scenarios SET private_booking_slot_start_times='{"weekend":{"afternoon":"14:30"}}'::jsonb
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 -- R22 夜 18:30 に公演あり → 14:30 では重なる。近い時刻にずらさず選べない
 w:=pg_temp.day_of(6,4); PERFORM pg_temp.dur(270); PERFORM pg_temp.ev(c.st2,w,'18:30','23:00');
 PERFORM pg_temp.check_row('R22',w,one,'afternoon',false,NULL,NULL,'start_fixed','この作品の開始時刻 14:30 では前後の公演と重なります',false);
 -- R23 夜に公演なし → 14:30〜19:00（夜の標準 19:00 にかかっても選べる）
 w:=pg_temp.day_of(6,5); PERFORM pg_temp.dur(270);
 PERFORM pg_temp.check_row('R23',w,one,'afternoon',true,'14:30','19:00',NULL,NULL,false);
 -- R24 保存で 14:30 以外（旧来の 14:00 など）を送ると弾く
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','14:00','end_time','18:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%この作品の開始時刻は 14:30 です%', format('R24: 14:00 の保存が弾かれない（%s）', msg);
 INSERT INTO _rule_rows VALUES('R24',w,'afternoon',false,'14:00',NULL,'fixed_start',msg,false);
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;

 -- R25〜R26 店舗の特別営業日（I5: 日曜の営業設定と土日祝の作品設定を使う。2026-10-15 Codex staging 点検）
 -- 平日（月曜）を二号店の特別営業日にする。作品は平日 3 時間・土日祝 4 時間、時間枠は平日 午前・午後／土日祝 午後・夜。
 w:=pg_temp.day_of(1,16); PERFORM pg_temp.dur(180);
 UPDATE organization_scenarios SET weekend_duration=240,private_booking_time_slots=ARRAY['午前','午後'],private_booking_time_slots_weekend=ARRAY['午後','夜']
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 UPDATE business_hours_settings SET special_open_days=jsonb_build_array(jsonb_build_object('date',w)) WHERE organization_id=c.org AND store_id=c.st2;
 -- R25 午前は土日祝の時間枠に無いので選べない／午後は日曜の 14:00 開始・土日祝の 4 時間／夜は土日祝の時間枠で選べる
 PERFORM pg_temp.check_row('R25',w,one,'morning',false,NULL,NULL,'slot_not_allowed',NULL,false);
 PERFORM pg_temp.check_row('R25',w,one,'afternoon',true,'14:00','18:00',NULL,NULL,false);
 PERFORM pg_temp.check_row('R25',w,one,'evening',true,'19:00','23:00',NULL,NULL,false);
 -- 平日の所要時間（3 時間）で送る古い画面の保存は弾く
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','14:00','end_time','17:00')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%公演時間が更新されている%', format('R25: 平日の所要時間での保存が弾かれない（%s）', msg);
 UPDATE business_hours_settings SET special_open_days=NULL WHERE organization_id=c.org AND store_id=c.st2;
 -- R26 特別営業日の夜は作品名の特例（19:30）も土日祝の扱い
 w:=pg_temp.day_of(1,17); PERFORM pg_temp.dur(180);
 UPDATE organization_scenarios SET override_title='戦塵のレガストリア（試験）' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 UPDATE business_hours_settings SET special_open_days=jsonb_build_array(jsonb_build_object('date',w)) WHERE organization_id=c.org AND store_id=c.st2;
 PERFORM pg_temp.check_row('R26',w,one,'evening',true,'19:30','22:30',NULL,NULL,false);
 UPDATE business_hours_settings SET special_open_days=NULL WHERE organization_id=c.org AND store_id=c.st2;

 -- R27 グループ作成（create_private_group_atomic）でも保存時に最新の空き状況を確かめる（2026-10-15 Codex staging 点検）
 -- 12:00〜16:30 に公演、所要 3 時間 30 分。画面を開いた後に公演が入った想定で、午後 13:00 開始を送る → 弾く
 w:=pg_temp.day_of(1,18); PERFORM pg_temp.dur(210); PERFORM pg_temp.ev(c.st2,w,'12:00','16:30');
 msg:=NULL;
 BEGIN
  PERFORM create_private_group_atomic(c.org,c.sm,'規則の例',one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午後','start_time','13:00','end_time','16:30')),NULL);
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%他の公演と重なります%', format('R27: 重なる候補でグループを作成できた（%s）', msg);
 INSERT INTO _rule_rows VALUES('R27',w,'afternoon',false,'13:00','16:30','conflict',msg,false);
 -- 所要時間が合わない（開始は入る）→ 公演時間の更新として弾く
 msg:=NULL;
 BEGIN
  PERFORM create_private_group_atomic(c.org,c.sm,'規則の例',one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午後','start_time','17:30','end_time','20:30')),NULL);
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%公演時間が更新されている%', format('R27: 所要時間の違う候補でグループを作成できた（%s）', msg);
 -- 空き状況が返す 17:30〜21:00 なら作成できる
 created:=(create_private_group_atomic(c.org,c.sm,'規則の例',one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午後','start_time','17:30','end_time','21:00')),NULL)->>'id')::uuid;
 ASSERT (SELECT count(*) FROM private_group_candidate_dates cd WHERE cd.group_id=created)=1, 'R27: 空いている候補でグループを作成できない';
 INSERT INTO _rule_rows VALUES('R27',w,'afternoon',true,'17:30','21:00',NULL,NULL,true);
 -- 候補なし（日程を決めずに作成）は従来どおり
 PERFORM create_private_group_atomic(c.org,c.sm,'規則の例','{}'::uuid[],'[]'::jsonb,NULL);

 -- R28〜R30 店舗の曜日設定で無効にした枠は候補にしない（2026-10-20 札幌店の平日朝。以前は朝・夜を常に足していた）
 -- 二号店を札幌店と同じ平日 open_time=13:00・available_slots=["afternoon","evening"]（朝の開始 10:00 は残ったまま）にする。
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('open_time','13:00','available_slots','["afternoon","evening"]'::jsonb) END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 -- R28 平日の朝は選べない（closed）。朝 10:00 の保存も弾く
 w:=pg_temp.day_of(1,19); PERFORM pg_temp.dur(210);
 PERFORM pg_temp.check_row('R28',w,one,'morning',false,NULL,NULL,'closed',NULL,false);
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','morning','start_time','10:00','end_time','13:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R28: 無効な平日朝を保存できた（%s）', msg);
 -- R29 平日の昼 13:00・夜 19:00 は従来どおり選べる
 PERFORM pg_temp.check_row('R29',w,one,'afternoon',true,'13:00','16:30',NULL,NULL,false);
 PERFORM pg_temp.check_row('R29',w,one,'evening',true,'19:00','22:30',NULL,NULL,false);
 -- R30・R37 枠の開始は店舗の開店時刻より前にしない（2026-10-21 issue #1200）。
 -- 二号店の平日を「開店 13:00・朝も有効・朝の開始 10:00」、土日を「開店 09:00」にする（本番のクインズワルツの店舗と同じ組み合わせ）。
 -- 以前は朝の開始時刻の設定が開店時刻より優先され、平日の朝 10:00〜13:30 が選べた。
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('available_slots','["afternoon","evening","morning"]'::jsonb) END)||jsonb_build_object(
   'saturday',opening_hours->'saturday'||'{"open_time":"09:00"}','sunday',opening_hours->'sunday'||'{"open_time":"09:00"}') FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 -- R30 平日の朝は選べない（closed）。朝 10:00 の保存（候補の追加・グループ作成・店舗への申込）も弾く
 PERFORM pg_temp.check_row('R30',w,one,'morning',false,NULL,NULL,'closed',NULL,false);
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','morning','start_time','10:00','end_time','13:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R30: 開店 13:00 の平日朝 10:00 を候補に追加できた（%s）', msg);
 msg:=NULL;
 BEGIN
  PERFORM create_private_group_atomic(c.org,c.sm,'規則の例',one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午前','start_time','10:00','end_time','13:30')),NULL);
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R30: 開店 13:00 の平日朝 10:00 でグループを作成できた（%s）', msg);
 -- 既存の候補（開店時刻を守る前に入った平日朝 10:00 の架空の候補）: 消さない・読める・取り下げられる。店舗への申込では弾く
 INSERT INTO private_group_candidate_dates(id,group_id,date,time_slot,start_time,end_time,order_num)
  VALUES('00000000-0000-4000-e000-000000001200',c.grp,w,'午前','10:00','13:30',1);
 ASSERT (SELECT a.reason FROM private_group_candidate_slot_availability(c.grp,w,w) a WHERE a.time_slot='morning')='already_added',
  'R30: 既存の朝の候補が追加済みとして出ない';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(private_group_read_snapshot(c.grp)->'group'->'candidate_dates') x
  WHERE x->>'id'='00000000-0000-4000-e000-000000001200' AND x->>'start_time'='10:00'), 'R30: 既存の朝の候補がグループの読み取りに出ない';
 msg:=NULL;
 BEGIN
  PERFORM pg_temp.request(one,jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午前','startTime','10:00','endTime','13:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R30: 開店 13:00 の店舗へ平日朝 10:00 を申し込めた（%s）', msg);
 ASSERT (private_group_withdraw_candidate(c.grp,'00000000-0000-4000-e000-000000001200')->>'success')::boolean, 'R30: 既存の朝の候補を取り下げられない';
 INSERT INTO _rule_rows VALUES('R30',w,'morning',false,'10:00','13:30','closed',msg,false);
 -- R37 昼 13:00・夜 19:00 は従来どおり選べ、店舗への申込も通る
 PERFORM pg_temp.check_row('R37',w,one,'afternoon',true,'13:00','16:30',NULL,NULL,false);
 PERFORM pg_temp.check_row('R37',w,one,'evening',true,'19:00','22:30',NULL,NULL,false);
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
  jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','13:00','end_time','16:30')));
 ASSERT pg_temp.request(one,jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午後','startTime','13:00','endTime','16:30'))) IS NOT NULL,
  'R37: 開店 13:00 の店舗へ昼 13:00 を申し込めない';
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 -- R40 同じ店舗の土曜（開店 09:00）は朝 10:00 から選べる
 PERFORM pg_temp.check_row('R40',pg_temp.day_of(6,7),one,'morning',true,'10:00','13:30',NULL,NULL,false);
 -- R41 同じ店舗の平日を特別営業日にすると日曜の設定（開店 09:00）を使い、朝 10:00 から選べる
 w:=pg_temp.day_of(3,0);
 UPDATE business_hours_settings SET special_open_days=jsonb_build_array(jsonb_build_object('date',w)) WHERE organization_id=c.org AND store_id=c.st2;
 PERFORM pg_temp.check_row('R41',w,one,'morning',true,'10:00','13:30',NULL,NULL,false);
 UPDATE business_hours_settings SET special_open_days=NULL WHERE organization_id=c.org AND store_id=c.st2;
 -- R39 平日の開店を 11:00 にすると、朝は 11:00 から（朝の開始 10:00 の設定より開店が優先）
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('open_time','11:00') END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 w:=pg_temp.day_of(3,1);
 PERFORM pg_temp.check_row('R39',w,one,'morning',true,'11:00','14:30',NULL,NULL,false);
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','morning','start_time','10:00','end_time','13:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R39: 開店 11:00 の店舗に朝 10:00 を追加できた（%s）', msg);
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 -- R38 平日の開店を 10:00 にすると（朝に開いている店舗）、朝 10:00 から従来どおり選べる
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('open_time','10:00') END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 PERFORM pg_temp.check_row('R38',pg_temp.day_of(3,2),one,'morning',true,'10:00','13:30',NULL,NULL,false);
 -- R42 営業設定が無い店舗（希望店舗が 1 店だけのときの合成）の平日は、朝 10:00 から従来どおり選べる
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('open_time','13:00') END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 CREATE TEMP TABLE _r42_hours AS SELECT * FROM business_hours_settings WHERE organization_id=c.org AND store_id=c.st2;
 DELETE FROM business_hours_settings WHERE organization_id=c.org AND store_id=c.st2;
 PERFORM pg_temp.check_row('R42',pg_temp.day_of(3,3),one,'morning',true,'10:00','13:30',NULL,NULL,false);
 INSERT INTO business_hours_settings SELECT * FROM _r42_hours;
 -- R43 作品の開始時刻（I11）が店舗の開店時刻より前なら、開店時刻へずらさず選べない（closed）。開店以後の作品の開始時刻は従来どおり
 w:=pg_temp.day_of(3,4); PERFORM pg_temp.dur(210);
 UPDATE organization_scenarios SET private_booking_slot_start_times='{"weekday":{"morning":"09:00","afternoon":"12:00","evening":"18:30"},"weekend":{"morning":"09:00"}}'::jsonb
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.check_row('R43',w,one,'morning',false,NULL,NULL,'closed',NULL,false);
 PERFORM pg_temp.check_row('R43',w,one,'afternoon',false,NULL,NULL,'closed',NULL,false);
 PERFORM pg_temp.check_row('R43',w,one,'evening',true,'18:30','22:00',NULL,NULL,false);
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','12:00','end_time','15:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R43: 開店 13:00 の店舗に作品の開始時刻 12:00 を追加できた（%s）', msg);
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','13:00','end_time','16:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg IS NOT NULL, 'R43: 作品の開始時刻 12:00 の昼を開店 13:00 にずらして追加できた';
 -- 土曜（開店 09:00）の作品の朝 09:00 は開店と同じなので選べる
 PERFORM pg_temp.check_row('R43',pg_temp.day_of(6,8),one,'morning',true,'09:00','12:30',NULL,NULL,false);
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;

 -- R34〜R36 店舗への申込（create_private_booking_request）と希望店舗の変更でも、候補日の追加と同じ検査を通す（2026-10-20 Codex staging 点検「受付期間の一部の判定が抜けている」）
 -- 二号店は R28 と同じ札幌店の設定（平日の朝は無効）、本店は毎日 3 枠有効。グループの希望店舗は本店・二号店。
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('open_time','13:00','available_slots','["afternoon","evening"]'::jsonb) END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;
 UPDATE organization_scenarios SET private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL,override_title=NULL,private_booking_slot_start_times=NULL
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 -- R34 平日の朝 10:00〜13:30 は本店でだけ入る候補。申込シートで二号店だけに送ると弾く（以前は公演・受付停止しか見ず通っていた）
 w:=pg_temp.day_of(2,0); PERFORM pg_temp.dur(210);
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=two WHERE id=c.grp;
 PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,two,
  jsonb_build_array(jsonb_build_object('date',w,'time_slot','morning','start_time','10:00','end_time','13:30')));
 msg:=NULL;
 BEGIN
  PERFORM pg_temp.request(ARRAY[c.st2],jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午前','startTime','10:00','endTime','13:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%営業時間外です%', format('R34: 二号店だけに無効な平日朝を申し込めた（%s）', msg);
 INSERT INTO _rule_rows VALUES('R34',w,'morning',false,'10:00','13:30','closed',msg,false);

 -- R35 候補を追加した後に作品の開始時刻（土日祝の午後 14:30）を決めた → 14:00 開始の候補は申し込めない
 w:=pg_temp.day_of(6,6); PERFORM pg_temp.dur(270);
 PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,two,
  jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','14:00','end_time','18:30')));
 UPDATE organization_scenarios SET private_booking_slot_start_times='{"weekend":{"afternoon":"14:30"}}'::jsonb
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 msg:=NULL;
 BEGIN
  PERFORM pg_temp.request(two,jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午後','startTime','14:00','endTime','18:30')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%この作品の開始時刻は 14:30 です%', format('R35: 作品の開始時刻と違う候補を申し込めた（%s）', msg);
 INSERT INTO _rule_rows VALUES('R35',w,'afternoon',false,'14:00','18:30','fixed_start',msg,false);
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp AND date=w;

 -- R36 希望店舗を二号店だけに変えると、二号店で入らない R34 の朝の候補は外れる（以前は公演・受付停止しか見ず残っていた）
 w:=pg_temp.day_of(2,0); PERFORM pg_temp.dur(210);
 ASSERT private_group_set_preferred_stores(c.grp,ARRAY[c.st2],two)=1, 'R36: 二号店で入らない候補が外れない';
 ASSERT NOT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE group_id=c.grp AND date=w), 'R36: 朝の候補が残った';
 INSERT INTO _rule_rows VALUES('R36',w,'morning',false,'10:00','13:30','closed','希望店舗の変更で外れる',false);
 -- 本店に戻して同じ候補を入れ直すと、本店への申込は従来どおり通る
 PERFORM private_group_set_preferred_stores(c.grp,two,ARRAY[c.st2]);
 PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,two,
  jsonb_build_array(jsonb_build_object('date',w,'time_slot','morning','start_time','10:00','end_time','13:30')));
 ASSERT pg_temp.request(ARRAY[c.st1],jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午前','startTime','10:00','endTime','13:30'))) IS NOT NULL,
  'R34: 本店への申込が通らない';
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 UPDATE business_hours_settings SET opening_hours=(SELECT jsonb_object_agg(k,CASE WHEN k IN ('saturday','sunday') THEN v
   ELSE v||jsonb_build_object('available_slots','["afternoon","evening","morning"]'::jsonb) END) FROM jsonb_each(opening_hours) e(k,v))
  WHERE organization_id=c.org AND store_id=c.st2;

 -- R31〜R33 申し込める範囲（I21。設定「貸切を受け付ける範囲」: MMQ の既定 180 日 → 組織 → 作品 → 公演の順に上書き。2026-10-20 本番 #1140）
 UPDATE organization_scenarios SET private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL,override_title=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
 PERFORM pg_temp.dur(180);
 -- R31 既定 180 日: 181 日先は選べない（too_far）。180 日先は too_far にならない
 w:=(now() AT TIME ZONE 'Asia/Tokyo')::date+181;
 PERFORM pg_temp.check_row('R31',w,one,'afternoon',false,NULL,NULL,'too_far','申し込めるのは今日から 180 日先までです',false);
 ASSERT NOT EXISTS(SELECT 1 FROM private_booking_candidate_slot_availability(c.org,c.sm,one,w-1,w-1) a WHERE a.reason='too_far'), 'R31: 180 日先が too_far になった';
 -- 保存（候補の追加・グループ作成・日時付き申込）でも弾く
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=one WHERE id=c.grp;
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','13:00','end_time','16:00')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%申し込めるのは今日から 180 日先までです%', format('R31: 181 日先を候補に追加できた（%s）', msg);
 msg:=NULL;
 BEGIN
  PERFORM create_private_group_atomic(c.org,c.sm,'規則の例',one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午後','start_time','13:00','end_time','16:00')),NULL);
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%申し込めるのは今日から 180 日先までです%', format('R31: 181 日先でグループを作成できた（%s）', msg);
 msg:=NULL;
 BEGIN
  UPDATE reservations SET candidate_datetimes=jsonb_set(candidate_datetimes,'{candidates}',candidate_datetimes->'candidates'||jsonb_build_array(jsonb_build_object('date',w,'order',9,'status','pending','timeSlot','午後','startTime','13:00','endTime','16:00')))
   WHERE id=(SELECT r.id FROM reservations r WHERE r.organization_id=c.org AND r.reservation_source='web_private' ORDER BY r.id LIMIT 1);
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%申し込めるのは今日から 180 日先までです%', format('R31: 日時付き申込に 181 日先を入れられた（%s）', msg);
 INSERT INTO _rule_rows VALUES('R31',w,'afternoon',false,'13:00','16:00','too_far',msg,false);

 -- R32 組織の値を 90 日にすると 91 日先は選べず保存も弾く。90 日先は too_far にならない
 INSERT INTO operating_setting_overrides(organization_id,settings) VALUES(c.org,'{"private_booking_horizon_days":90}')
  ON CONFLICT (organization_id,store_id,organization_scenario_id,schedule_event_id) DO UPDATE SET settings=operating_setting_overrides.settings||EXCLUDED.settings;
 w:=(now() AT TIME ZONE 'Asia/Tokyo')::date+91;
 PERFORM pg_temp.check_row('R32',w,one,'afternoon',false,NULL,NULL,'too_far','申し込めるのは今日から 90 日先までです',false);
 ASSERT NOT EXISTS(SELECT 1 FROM private_booking_candidate_slot_availability(c.org,c.sm,one,w-1,w-1) a WHERE a.reason='too_far'), 'R32: 90 日先が too_far になった';
 ASSERT (SELECT reason FROM private_booking_scenario_date_reasons(c.org,w,ARRAY[c.sm]))='too_far', 'R32: 作品一覧の日付理由が too_far にならない';
 msg:=NULL;
 BEGIN
  PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,one,
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','afternoon','start_time','13:00','end_time','16:00')));
 EXCEPTION WHEN OTHERS THEN msg:=SQLERRM;
 END;
 ASSERT msg LIKE '%申し込めるのは今日から 90 日先までです%', format('R32: 91 日先を候補に追加できた（%s）', msg);
 ASSERT get_effective_private_booking_horizon_days(c.org,NULL,NULL)=90, 'R32: 入口（作品未選択）の日数が 90 にならない';
 INSERT INTO _rule_rows VALUES('R32',w,'afternoon',false,'13:00','16:00','too_far',msg,false);

 -- R33 組織 90・作品 120 → 作品の 120 が効く（121 日先は弾き、100 日先は選べる）。公演の上書きがあれば公演の値が効く
 INSERT INTO operating_setting_overrides(organization_id,organization_scenario_id,settings)
  SELECT c.org,s.id,'{"private_booking_horizon_days":120}'::jsonb FROM organization_scenarios s WHERE s.organization_id=c.org AND s.scenario_master_id=c.sm
  ON CONFLICT (organization_id,store_id,organization_scenario_id,schedule_event_id) DO UPDATE SET settings=operating_setting_overrides.settings||EXCLUDED.settings;
 ASSERT get_effective_private_booking_horizon_days(c.org,c.sm,NULL)=120, 'R33: 作品の 120 が効かない';
 w:=(now() AT TIME ZONE 'Asia/Tokyo')::date+121;
 PERFORM pg_temp.check_row('R33',w,one,'afternoon',false,NULL,NULL,'too_far','申し込めるのは今日から 120 日先までです',false);
 w:=(now() AT TIME ZONE 'Asia/Tokyo')::date+100;
 ASSERT NOT EXISTS(SELECT 1 FROM private_booking_candidate_slot_availability(c.org,c.sm,one,w,w) a WHERE a.reason='too_far'), 'R33: 作品 120 日なのに 100 日先が too_far になった';
 PERFORM assert_private_booking_candidate_date(c.org,c.sm,w);
 INSERT INTO _rule_rows VALUES('R33',w,'afternoon',NULL,NULL,NULL,NULL,'作品 120 日: 100 日先は範囲内',false);
 -- 入口（作品未選択）は、個別指定で受け付ける作品を隠さないよう最長（120）
 ASSERT get_effective_private_booking_horizon_days(c.org,NULL,NULL)=120, 'R33: 入口の日数が作品の 120 にならない';
 -- 公演の上書き（30 日）は作品の 120 より優先
 INSERT INTO schedule_events(organization_id,store_id,date,venue,scenario,start_time,end_time,is_cancelled,scenario_master_id)
  VALUES(c.org,c.st2,(now() AT TIME ZONE 'Asia/Tokyo')::date+20,'試験','規則の例','10:00','12:00',false,c.sm) RETURNING id INTO created;
 ASSERT get_effective_private_booking_horizon_days(c.org,NULL,created)=120, 'R33: 公演の上書きが無いのに作品の値にならない';
 INSERT INTO operating_setting_overrides(organization_id,schedule_event_id,settings) VALUES(c.org,created,'{"private_booking_horizon_days":30}');
 ASSERT get_effective_private_booking_horizon_days(c.org,NULL,created)=30, 'R33: 公演の上書き 30 が効かない';
 ASSERT get_effective_private_booking_horizon_days(c.org,c.sm,NULL)=120, 'R33: 公演の上書きが作品の値に混ざった';
END $$;
SELECT no,date,slot,ok,start_time,end_time,reason,detail,adjusted FROM _rule_rows ORDER BY substring(no FROM 2)::integer, date, array_position(ARRAY['morning','afternoon','evening'],slot);
ROLLBACK;
