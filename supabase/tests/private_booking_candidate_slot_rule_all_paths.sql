-- 貸切の候補の検査（issue #1200・#1202 の 20261021144000 と、統合の reconcile 20261021170000）の試験（手元の使い捨て DB・架空データだけ。最後に ROLLBACK）
-- 実行: npm run test:rpcs（または psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/private_booking_candidate_slot_rule_all_paths.sql）
-- 前提: 基準 ＋ 全 migration（reconcile まで）済みの DB。最終本文は staging の private_booking_assert_candidate 経路（reconcile の説明）。
-- 確かめること:
--  店舗の曜日の枠設定（I2）で平日朝を止めた店（開店 13:00・昼／夜だけ = 札幌相当・設定修正後の東京 7 店）で、
--  (1) グループ作成・(2) 店舗への申込は平日朝 10:00 の候補を拒否（22023「選択した候補日時は現在受付できません…営業時間外です」）、
--  (3) 希望店舗の変更でその店だけにすると平日朝の候補が外れる（件数を返す）。
--  昼 13:00・夜 19:00、作品の固定時刻 昼 12:00・夜 16:00（開店前でも）は 3 経路とも通る。
--  朝を受け付ける店（土曜 09:00、平日も開店 10:00 の店）は通る。作品の時間枠（I10）に無い枠は拒否。
--  枠の可否と空きは同じ店舗で両方成り立つこと: 朝を止めた空いている店 ＋ 朝を受け付けるが朝が受付停止の店 では 3 経路とも通さない
--  （#1202 の本文では申込は P0040。reconcile 後は assert_candidate の 22023「受付停止中です」。どちらも拒否）。
--  特別営業日（その店舗だけ土日祝扱い）の店では、平日は朝不可・土日祝は朝可の作品の朝が通る。普通の平日の店では引き続き不可。
--  希望店舗が空のグループ作成は、候補があれば「希望店舗を選択してください」（staging の挙動。画面は店舗を必須にしている）。
--  既存の候補・申込の行は変わらない。
--  reconcile の rollback（本番の公開手順で reconcile の直前 = 29 本の後）でも同じ結果（3 関数の本文は同じ）で、#1202 の検査の関数だけが戻る。
--  staging の順（144000 → reconcile）で当て直しても同じ結果。
--  issue #1203: 希望店舗の変更でも貸切の募集停止で候補が外れる。候補の時間帯が別の枠（夜）の受付停止にかかればグループ作成は拒否・店舗変更で外れる。
\set ON_ERROR_STOP on
BEGIN;
\ir fixtures/private_test_group.sql
CREATE TEMP TABLE _ctx(org uuid, sm uuid, st1 uuid, st2 uuid, grp uuid);
INSERT INTO _ctx VALUES('00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000202',
 '00000000-0000-4000-a000-000000000101','00000000-0000-4000-a000-000000000102','0160f91a-f84c-43fd-8e46-dda15d1005d7');
CREATE FUNCTION pg_temp.day_of(p_isodow integer, p_k integer) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT d FROM (SELECT current_date+40+i AS d FROM generate_series(0,400) i) s
 WHERE extract(isodow FROM d)=p_isodow AND NOT public.is_booking_calendar_holiday(d) ORDER BY d OFFSET p_k LIMIT 1 $$;
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
-- グループ作成（候補 1 件）。成功なら作ったグループを取り消して 'ok'
CREATE FUNCTION pg_temp.create(p_stores uuid[], p_date date, p_label text, p_start text, p_end text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c _ctx;
BEGIN
 SELECT * INTO c FROM _ctx;
 BEGIN
  PERFORM create_private_group_atomic(c.org,c.sm,'規則の試験',p_stores,
   jsonb_build_array(jsonb_build_object('date',p_date,'time_slot',p_label,'start_time',p_start,'end_time',p_end)),NULL);
  RAISE EXCEPTION 'undo' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN RETURN 'ok'; WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM;
 END;
END $$;
-- 試験用グループの候補を 1 件にして（候補の追加 RPC は使わず直接入れる = 設定を変える前からある候補と同じ）、その店へ申し込む。成功なら戻して 'ok'
CREATE FUNCTION pg_temp.request(p_stores uuid[], p_date date, p_label text, p_start text, p_end text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c _ctx;
BEGIN
 SELECT * INTO c FROM _ctx;
 BEGIN
  DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
  UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=p_stores WHERE id=c.grp;
  INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num) VALUES(c.grp,p_date,p_label,p_start,p_end,1);
  PERFORM create_private_booking_request(c.sm,'00000000-0000-4000-d000-000000000011','試験 主催者','private-test-organizer@mmq.test','09012345678',5,
   jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object('date',p_date,'timeSlot',p_label,'startTime',p_start,'endTime',p_end)),
    'requestedStores',(SELECT jsonb_agg(jsonb_build_object('storeId',s)) FROM unnest(p_stores) s)),
   NULL,'SR-'||substr(md5(random()::text),1,8),c.grp);
  RAISE EXCEPTION 'undo' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN RETURN 'ok'; WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM;
 END;
END $$;
-- 希望店舗 p_from の候補（直接入れる）を p_to に変えたときに外れた件数。確かめたら戻す
CREATE FUNCTION pg_temp.change(p_from uuid[], p_to uuid[], p_date date, p_label text, p_start text, p_end text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c _ctx; n integer;
BEGIN
 SELECT * INTO c FROM _ctx;
 BEGIN
  DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
  UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=p_from WHERE id=c.grp;
  INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num) VALUES(c.grp,p_date,p_label,p_start,p_end,1);
  n:=private_group_set_preferred_stores(c.grp,p_to,p_from);
  RAISE EXCEPTION 'undo:%',n USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN RETURN 'removed '||split_part(SQLERRM,':',2); WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM;
 END;
END $$;
CREATE TEMP TABLE _log(step text, item text, result text);

-- 店舗: st1 = 平日も開店 10:00・3 枠（朝に正当に営業する店）。st2 = 平日 開店 13:00・昼／夜だけ（朝の開始 10:00 は設定に残す）、土日 開店 09:00・3 枠
DO $$
DECLARE c _ctx; d text; h1 jsonb:='{}'; h2 jsonb:='{}';
BEGIN
 SELECT * INTO c FROM _ctx;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-b000-000000000011','role','authenticated')::text,true);
 FOREACH d IN ARRAY ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] LOOP
  h1:=h1||jsonb_build_object(d,jsonb_build_object('is_open',true,'open_time','10:00','close_time','23:00','available_slots','["morning","afternoon","evening"]'::jsonb,
   'slot_start_times',jsonb_build_object('morning','10:00','afternoon',CASE WHEN d IN ('saturday','sunday') THEN '14:00' ELSE '13:00' END,'evening','19:00')));
  h2:=h2||jsonb_build_object(d,CASE WHEN d IN ('saturday','sunday')
   THEN jsonb_build_object('is_open',true,'open_time','09:00','close_time','23:00','available_slots','["morning","afternoon","evening"]'::jsonb,
    'slot_start_times',jsonb_build_object('afternoon','14:00','evening','19:00'))
   ELSE jsonb_build_object('is_open',true,'open_time','13:00','close_time','23:00','available_slots','["afternoon","evening"]'::jsonb,
    'slot_start_times',jsonb_build_object('morning','10:00','afternoon','13:00','evening','19:00')) END);
 END LOOP;
 DELETE FROM business_hours_settings WHERE organization_id=c.org;
 INSERT INTO business_hours_settings(organization_id,store_id,opening_hours) VALUES(c.org,c.st1,h1),(c.org,c.st2,h2);
 DELETE FROM schedule_events WHERE organization_id=c.org AND store_id IN (c.st1,c.st2);
 DELETE FROM schedule_blocked_slots WHERE organization_id=c.org;
 UPDATE organization_scenarios SET available_stores=ARRAY[c.st1::text,c.st2::text],duration=150,weekend_duration=NULL,
   private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL,private_booking_slot_start_times=NULL,accepts_private_booking=true
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
END $$;
CREATE TEMP TABLE _w AS SELECT pg_temp.day_of(3,1) AS w, pg_temp.day_of(6,1) AS sat, pg_temp.day_of(2,2) AS sp;
-- 朝を止めた店（st2）は火曜 sp だけ特別営業日（日曜の設定 = 土日祝・3 枠）
UPDATE business_hours_settings SET special_open_days=jsonb_build_array(jsonb_build_object('date',(SELECT sp FROM _w)))
 WHERE organization_id=(SELECT org FROM _ctx) AND store_id=(SELECT st2 FROM _ctx);

-- 既存の行（架空）: 設定を変える前からある平日朝の候補。migration では変わらない
CREATE TEMP TABLE _rows_before AS SELECT md5(coalesce(string_agg(to_jsonb(cd)::text,'|' ORDER BY cd.id),'')) AS fp FROM private_group_candidate_dates cd;

CREATE FUNCTION pg_temp.run(p_step text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c _ctx; w date; sat date; sp date; one uuid[]; st12 uuid[];
BEGIN
 SELECT * INTO c FROM _ctx; SELECT _w.w, _w.sat, _w.sp INTO w, sat, sp FROM _w; one:=ARRAY[c.st2]; st12:=ARRAY[c.st1,c.st2];
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-b000-000000000011','role','authenticated')::text,true);
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL,private_booking_time_slots='{}' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _log VALUES
  (p_step,'作成 朝止めた店 平日 朝 10:00',pg_temp.create(one,w,'午前','10:00','12:30')),
  (p_step,'作成 朝止めた店 平日 昼 13:00',pg_temp.create(one,w,'午後','13:00','15:30')),
  (p_step,'作成 朝止めた店 平日 夜 19:00',pg_temp.create(one,w,'夜間','19:00','21:30')),
  (p_step,'作成 朝止めた店 土曜 朝 09:00',pg_temp.create(one,sat,'午前','09:00','11:30')),
  (p_step,'作成 開店10時の店 平日 朝 10:00',pg_temp.create(ARRAY[c.st1],w,'午前','10:00','12:30')),
  (p_step,'作成 2 店（1 店は朝あり）平日 朝 10:00',pg_temp.create(st12,w,'午前','10:00','12:30')),
  (p_step,'申込 朝止めた店 平日 朝 10:00',pg_temp.request(one,w,'午前','10:00','12:30')),
  (p_step,'申込 朝止めた店 平日 昼 13:00',pg_temp.request(one,w,'午後','13:00','15:30')),
  (p_step,'申込 朝止めた店 平日 夜 19:00',pg_temp.request(one,w,'夜間','19:00','21:30')),
  (p_step,'申込 朝止めた店 土曜 朝 09:00',pg_temp.request(one,sat,'午前','09:00','11:30')),
  (p_step,'申込 開店10時の店 平日 朝 10:00',pg_temp.request(ARRAY[c.st1],w,'午前','10:00','12:30')),
  (p_step,'店舗変更 2 店→朝止めた店 平日 朝 10:00',pg_temp.change(st12,one,w,'午前','10:00','12:30')),
  (p_step,'店舗変更 2 店→朝止めた店 平日 昼 13:00',pg_temp.change(st12,one,w,'午後','13:00','15:30')),
  (p_step,'店舗変更 2 店→開店10時の店 平日 朝 10:00',pg_temp.change(st12,ARRAY[c.st1],w,'午前','10:00','12:30'));
 -- 作品の固定時刻 昼 12:00・夜 16:00（開店 13:00 より前・夜の標準 19:00 より前）
 UPDATE organization_scenarios SET private_booking_slot_start_times='{"weekday":{"morning":"10:00","afternoon":"12:00","evening":"16:00"}}'::jsonb
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _log VALUES
  (p_step,'固定 作成 朝止めた店 平日 朝 10:00',pg_temp.create(one,w,'午前','10:00','12:30')),
  (p_step,'固定 作成 朝止めた店 平日 昼 12:00',pg_temp.create(one,w,'午後','12:00','14:30')),
  (p_step,'固定 作成 朝止めた店 平日 夜 16:00',pg_temp.create(one,w,'夜間','16:00','18:30')),
  (p_step,'固定 申込 朝止めた店 平日 昼 12:00',pg_temp.request(one,w,'午後','12:00','14:30')),
  (p_step,'固定 申込 朝止めた店 平日 夜 16:00',pg_temp.request(one,w,'夜間','16:00','18:30')),
  (p_step,'固定 店舗変更 2 店→朝止めた店 平日 昼 12:00',pg_temp.change(st12,one,w,'午後','12:00','14:30')),
  (p_step,'固定 店舗変更 2 店→朝止めた店 平日 夜 16:00',pg_temp.change(st12,one,w,'夜間','16:00','18:30'));
 -- 作品の時間枠（I10）: 平日は昼・夜だけ。朝を受け付ける店でも朝は拒否
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL,private_booking_time_slots=ARRAY['午後','夜'] WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _log VALUES
  (p_step,'I10 申込 開店10時の店 平日 朝 10:00',pg_temp.request(ARRAY[c.st1],w,'午前','10:00','12:30')),
  (p_step,'I10 店舗変更 2 店→開店10時の店 平日 朝 10:00',pg_temp.change(st12,ARRAY[c.st1],w,'午前','10:00','12:30'));
 -- 交差条件: st2 = 朝を止めた・空いている店、st1 = 朝を受け付けるが平日 w の朝が受付停止。2 店とも希望しても朝は通さない
 UPDATE organization_scenarios SET private_booking_time_slots='{}' WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO schedule_blocked_slots(organization_id,store_id,date,time_slot) VALUES(c.org,c.st1::text,w,'morning');
 INSERT INTO _log VALUES
  (p_step,'交差 作成 2 店 平日 朝 10:00',pg_temp.create(st12,w,'午前','10:00','12:30')),
  (p_step,'交差 申込 2 店 平日 朝 10:00',pg_temp.request(st12,w,'午前','10:00','12:30')),
  (p_step,'交差 店舗変更 開店10時の店→2 店 平日 朝 10:00',pg_temp.change(ARRAY[c.st1],st12,w,'午前','10:00','12:30')),
  (p_step,'交差 申込 2 店 平日 昼 13:00',pg_temp.request(st12,w,'午後','13:00','15:30'));
 DELETE FROM schedule_blocked_slots WHERE organization_id=c.org AND store_id=c.st1::text AND date=w;
 -- 特別営業日: 作品は 平日 = 昼・夜だけ、土日祝 = 3 枠
 UPDATE organization_scenarios SET private_booking_time_slots=ARRAY['午後','夜'],private_booking_time_slots_weekend=ARRAY['午前','午後','夜']
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _log VALUES
  (p_step,'特別営業日 作成 朝止めた店 火曜 朝 10:00',pg_temp.create(one,sp,'午前','10:00','12:30')),
  (p_step,'特別営業日 申込 朝止めた店 火曜 朝 10:00',pg_temp.request(one,sp,'午前','10:00','12:30')),
  (p_step,'特別営業日 店舗変更 開店10時の店→朝止めた店 火曜 朝 10:00',pg_temp.change(ARRAY[c.st1],one,sp,'午前','10:00','12:30')),
  (p_step,'普通の平日 作成 開店10時の店 火曜 朝 10:00',pg_temp.create(ARRAY[c.st1],sp,'午前','10:00','12:30')),
  (p_step,'普通の平日 作成 開店10時の店 火曜 昼 13:00',pg_temp.create(ARRAY[c.st1],sp,'午後','13:00','15:30')),
  (p_step,'希望店舗なし 作成 火曜 朝 10:00',pg_temp.create('{}'::uuid[],sp,'午前','10:00','12:30')),
  (p_step,'希望店舗なし 作成 火曜 昼 13:00',pg_temp.create('{}'::uuid[],sp,'午後','13:00','15:30')),
  (p_step,'普通の平日 申込 開店10時の店 火曜 朝 10:00',pg_temp.request(ARRAY[c.st1],sp,'午前','10:00','12:30')),
  (p_step,'普通の平日 店舗変更 朝止めた店→開店10時の店 火曜 朝 10:00',pg_temp.change(one,ARRAY[c.st1],sp,'午前','10:00','12:30'));
 UPDATE organization_scenarios SET private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
 -- issue #1203 P2: 希望店舗の変更でも貸切の募集停止を見る（開店10時の店 st1 を w の日だけ募集停止）
 INSERT INTO store_recruitment_pauses(organization_id,store_id,pause_type,starts_on,ends_on) VALUES(c.org,c.st1,'private',w,w);
 INSERT INTO _log VALUES
  (p_step,'募集停止 店舗変更 朝止めた店→開店10時の店 平日 昼 13:00',pg_temp.change(one,ARRAY[c.st1],w,'午後','13:00','15:30')),
  (p_step,'募集停止 申込 開店10時の店 平日 昼 13:00',pg_temp.request(ARRAY[c.st1],w,'午後','13:00','15:30'));
 DELETE FROM store_recruitment_pauses WHERE organization_id=c.org AND store_id=c.st1;
 -- issue #1203 P1: 候補の時間帯が別の枠にかかる受付停止も見る（昼 13:00〜20:00 の候補、st1 の w の夜が受付停止）
 UPDATE organization_scenarios SET duration=420 WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO schedule_blocked_slots(organization_id,store_id,date,time_slot) VALUES(c.org,c.st1::text,w,'evening');
 INSERT INTO _log VALUES
  (p_step,'別枠の停止 作成 開店10時の店 平日 昼 13:00〜20:00',pg_temp.create(ARRAY[c.st1],w,'午後','13:00','20:00')),
  (p_step,'別枠の停止 店舗変更 朝止めた店→開店10時の店 平日 昼 13:00〜20:00',pg_temp.change(one,ARRAY[c.st1],w,'午後','13:00','20:00'));
 DELETE FROM schedule_blocked_slots WHERE organization_id=c.org AND store_id=c.st1::text AND date=w;
 INSERT INTO _log VALUES
  (p_step,'別枠の停止なし 作成 開店10時の店 平日 昼 13:00〜20:00',pg_temp.create(ARRAY[c.st1],w,'午後','13:00','20:00'));
 UPDATE organization_scenarios SET duration=150 WHERE organization_id=c.org AND scenario_master_id=c.sm;
END $$;

-- 1. reconcile 適用後（この DB には適用済み。改めて当てても同じ = 冪等）
\ir ../migrations/20261021170000_private_booking_candidate_rule_reconcile.sql
DO $$ BEGIN ASSERT to_regprocedure('public.private_booking_store_slot_rule(uuid,uuid,uuid,date,text,boolean)') IS NULL, 'reconcile 後に #1202 の検査の関数が残った'; END $$;
SELECT pg_temp.run('適用後');
DO $$ BEGIN ASSERT (SELECT md5(coalesce(string_agg(to_jsonb(cd)::text,'|' ORDER BY cd.id),'')) FROM private_group_candidate_dates cd)=(SELECT fp FROM _rows_before), '既存の候補の行が変わった'; END $$;
-- 2. reconcile の rollback 後（本番の公開手順で reconcile の直前 = 29 本の後。3 関数は同じ本文、#1202 の検査の関数が戻るだけ）
\ir ../rollbacks/20261021170000_private_booking_candidate_rule_reconcile.sql
DO $$ BEGIN ASSERT to_regprocedure('public.private_booking_store_slot_rule(uuid,uuid,uuid,date,text,boolean)') IS NOT NULL, 'rollback で #1202 の検査の関数が戻らない'; END $$;
SELECT pg_temp.run('rollback 後');
-- 3. staging の順（20261020210000 済み → 20261021144000 → reconcile）で当て直す。144000 が 3 関数を本番の旧本文に戻しても、reconcile で同じ結果に戻る
\ir ../migrations/20261021144000_private_booking_candidate_slot_rule_all_paths.sql
\ir ../migrations/20261021170000_private_booking_candidate_rule_reconcile.sql
SELECT pg_temp.run('当て直し');

SELECT item, max(result) FILTER (WHERE step='適用後') AS after, max(result) FILTER (WHERE step='rollback 後') AS rolled_back, max(result) FILTER (WHERE step='当て直し') AS reapplied
FROM _log GROUP BY item ORDER BY min(ctid::text);

DO $$
DECLARE r record; rej text:='22023 選択した候補日時は現在受付できません%営業時間外です%'; rej10 text:='22023 %この作品では選択できない時間帯です%';
 blk text:='22023 選択した候補日時は現在受付できません%受付停止中です%'; nostore text:='22023 希望店舗を選択してください';
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('作成 朝止めた店 平日 朝 10:00',rej),
  ('作成 朝止めた店 平日 昼 13:00','ok'),
  ('作成 朝止めた店 平日 夜 19:00','ok'),
  ('作成 朝止めた店 土曜 朝 09:00','ok'),
  ('作成 開店10時の店 平日 朝 10:00','ok'),
  ('作成 2 店（1 店は朝あり）平日 朝 10:00','ok'),
  ('申込 朝止めた店 平日 朝 10:00',rej),
  ('申込 朝止めた店 平日 昼 13:00','ok'),
  ('申込 朝止めた店 平日 夜 19:00','ok'),
  ('申込 朝止めた店 土曜 朝 09:00','ok'),
  ('申込 開店10時の店 平日 朝 10:00','ok'),
  ('店舗変更 2 店→朝止めた店 平日 朝 10:00','removed 1'),
  ('店舗変更 2 店→朝止めた店 平日 昼 13:00','removed 0'),
  ('店舗変更 2 店→開店10時の店 平日 朝 10:00','removed 0'),
  ('固定 作成 朝止めた店 平日 朝 10:00',rej),
  ('固定 作成 朝止めた店 平日 昼 12:00','ok'),
  ('固定 作成 朝止めた店 平日 夜 16:00','ok'),
  ('固定 申込 朝止めた店 平日 昼 12:00','ok'),
  ('固定 申込 朝止めた店 平日 夜 16:00','ok'),
  ('固定 店舗変更 2 店→朝止めた店 平日 昼 12:00','removed 0'),
  ('固定 店舗変更 2 店→朝止めた店 平日 夜 16:00','removed 0'),
  ('I10 申込 開店10時の店 平日 朝 10:00',rej10),
  ('I10 店舗変更 2 店→開店10時の店 平日 朝 10:00','removed 1'),
  ('交差 作成 2 店 平日 朝 10:00',blk),
  ('交差 申込 2 店 平日 朝 10:00',blk),
  ('交差 店舗変更 開店10時の店→2 店 平日 朝 10:00','removed 1'),
  ('交差 申込 2 店 平日 昼 13:00','ok'),
  -- グループ作成も希望店舗ごとの平日／土日祝で読む
  ('特別営業日 作成 朝止めた店 火曜 朝 10:00','ok'),
  ('普通の平日 作成 開店10時の店 火曜 朝 10:00',rej10),
  ('普通の平日 作成 開店10時の店 火曜 昼 13:00','ok'),
  ('希望店舗なし 作成 火曜 朝 10:00',nostore),
  ('希望店舗なし 作成 火曜 昼 13:00',nostore),
  ('特別営業日 申込 朝止めた店 火曜 朝 10:00','ok'),
  ('特別営業日 店舗変更 開店10時の店→朝止めた店 火曜 朝 10:00','removed 0'),
  ('普通の平日 申込 開店10時の店 火曜 朝 10:00',rej10),
  ('普通の平日 店舗変更 朝止めた店→開店10時の店 火曜 朝 10:00','removed 1'),
  ('募集停止 店舗変更 朝止めた店→開店10時の店 平日 昼 13:00','removed 1'),
  ('募集停止 申込 開店10時の店 平日 昼 13:00','P0040 %'),
  ('別枠の停止 作成 開店10時の店 平日 昼 13:00〜20:00',blk),
  ('別枠の停止 店舗変更 朝止めた店→開店10時の店 平日 昼 13:00〜20:00','removed 1'),
  ('別枠の停止なし 作成 開店10時の店 平日 昼 13:00〜20:00','ok')) e(item,want)
 LOOP
  ASSERT (SELECT result FROM _log WHERE step='適用後' AND item=r.item) LIKE r.want, format('適用後 %s: 期待 %s / 実際 %s', r.item, r.want, (SELECT result FROM _log WHERE step='適用後' AND item=r.item));
  ASSERT (SELECT result FROM _log WHERE step='rollback 後' AND item=r.item) IS NOT DISTINCT FROM (SELECT result FROM _log WHERE step='適用後' AND item=r.item), format('rollback 後 %s', r.item);
  ASSERT (SELECT result FROM _log WHERE step='当て直し' AND item=r.item) IS NOT DISTINCT FROM (SELECT result FROM _log WHERE step='適用後' AND item=r.item), format('当て直し %s', r.item);
 END LOOP;
 ASSERT (SELECT count(DISTINCT item) FROM _log)=41, '試験の件数が 41 ではない';
 RAISE NOTICE '20261021144000 ＋ reconcile 20261021170000 の試験: すべて合格';
END $$;
ROLLBACK;
