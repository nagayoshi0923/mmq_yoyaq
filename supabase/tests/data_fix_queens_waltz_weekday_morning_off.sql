-- データ修正 supabase/data-fixes/20261021_queens_waltz_weekday_morning_off*.sql の試験（手元の使い捨て DB・架空データだけ）
-- 全部 1 つの取引で、最後に ROLLBACK する（手元 DB は変わらない）。各ファイルの BEGIN; / COMMIT; は外して読み込む。
-- 実行: npm run test:rpcs（または psql "$DB_URL" -X -f supabase/tests/data_fix_queens_waltz_weekday_morning_off.sql）
-- 確かめること（PR #1201・2026-10-21）:
--  (a) 平日 朝 10:00 が 作品ページ（空き判定）・候補追加・公開入口（営業枠）で closed（main。グループ作成・申込・店舗変更は下の注記）
--  (b) 平日 昼 13:00・昼 12:00 固定（作者不詳相当）・夜 19:00 は変わらない  (c) 土曜 09:00 の朝は変わらない
--  (d) 平日 open_time 10:00 の店舗（正当な朝営業）は朝が残る  (e) 他の組織（札幌相当）は不変
--  (f) 既存の候補・予約の行は変わらない。未申込の平日朝候補は、main（本番の DB 関数）では申込も店舗変更も通る（staging では拒否・除外）
--  (g) 復旧で元に戻る  (h) 2 回流しても同じ
\set ON_ERROR_STOP on
\set qw_fix `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/data-fixes/20261021_queens_waltz_weekday_morning_off.sql`
\set qw_rb `sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_rollback.sql`
BEGIN;
\ir fixtures/private_test_group.sql
CREATE TEMP TABLE _ctx(org uuid, sm uuid, st1 uuid, st2 uuid, st3 uuid, grp uuid, other_org uuid, other_st uuid);
INSERT INTO _ctx VALUES('00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000202',
 '00000000-0000-4000-a000-000000000101','00000000-0000-4000-a000-000000000102','4206bcea-43b3-4a6e-a03b-fe674c800982',
 '0160f91a-f84c-43fd-8e46-dda15d1005d7','00000000-0000-4000-a000-0000000f1201','00000000-0000-4000-a000-0000000f1202');
CREATE TEMP TABLE _qw(k text PRIMARY KEY, v jsonb);
CREATE TEMP TABLE _qw_log(step text, item text, result text);
CREATE FUNCTION pg_temp.day_of(p_isodow integer, p_k integer) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT d FROM (SELECT current_date+16+i AS d FROM generate_series(0,170) i) s
 WHERE extract(isodow FROM d)=p_isodow AND NOT public.is_booking_calendar_holiday(d) ORDER BY d OFFSET p_k LIMIT 1 $$;
-- 作品ページ・候補追加画面の空き判定
CREATE FUNCTION pg_temp.slot(p_store uuid, p_date date, p_slot text) RETURNS text LANGUAGE sql AS $$
 SELECT CASE WHEN a.available THEN 'ok '||a.start_time||'-'||a.end_time ELSE 'closed:'||coalesce(a.reason,'') END
 FROM private_booking_candidate_slot_availability((SELECT org FROM _ctx),(SELECT sm FROM _ctx),ARRAY[p_store],p_date,p_date) a WHERE a.time_slot=p_slot $$;
-- 公開トップの入口と同じ営業枠（private_booking_store_day_slots。画面 getPerStoreSlotsForDate と一致することは別の試験で確認済み）
CREATE FUNCTION pg_temp.entry(p_store uuid, p_date date) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(x.slot_key||'@'||lpad((x.start_minutes/60)::text,2,'0')||':'||lpad((x.start_minutes%60)::text,2,'0'),',' ORDER BY x.start_minutes),'')
 FROM business_hours_settings b, private_booking_store_day_slots(p_date,to_jsonb(b),public.is_booking_calendar_holiday(p_date),false) x
 WHERE b.store_id=p_store $$;
CREATE FUNCTION pg_temp.request(p_group uuid, p_stores uuid[], p_candidates jsonb) RETURNS uuid LANGUAGE sql AS $$
 SELECT create_private_booking_request((SELECT sm FROM _ctx),'00000000-0000-4000-d000-000000000011','試験 主催者','private-test-organizer@mmq.test','09012345678',5,
  jsonb_build_object('candidates',p_candidates,'requestedStores',(SELECT jsonb_agg(jsonb_build_object('storeId',s)) FROM unnest(p_stores) s)),
  NULL,'QW-'||substr(md5(random()::text),1,8),p_group) $$;
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'no error'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;
-- 既存の候補・予約の行の指紋（(f)）
CREATE FUNCTION pg_temp.rows_fp() RETURNS text LANGUAGE sql AS $$
 SELECT md5(coalesce((SELECT string_agg(to_jsonb(cd)::text,'|' ORDER BY cd.id) FROM private_group_candidate_dates cd WHERE cd.group_id IN (SELECT (v->>0)::uuid FROM _qw WHERE k LIKE 'grp_%')),'')
  ||coalesce((SELECT string_agg((to_jsonb(r)-'updated_at')::text,'|' ORDER BY r.id) FROM reservations r WHERE r.private_group_id IN (SELECT (v->>0)::uuid FROM _qw WHERE k LIKE 'grp_%')),'')
  ||coalesce((SELECT string_agg(to_jsonb(g)::text,'|' ORDER BY g.id) FROM private_groups g WHERE g.id IN (SELECT (v->>0)::uuid FROM _qw WHERE k LIKE 'grp_%')),'')) $$;
CREATE FUNCTION pg_temp.hours_fp() RETURNS text LANGUAGE sql AS $$
 SELECT string_agg(store_id::text||'='||md5(opening_hours::text),',' ORDER BY store_id) FROM business_hours_settings $$;

DO $$
DECLARE c _ctx; tokyo jsonb:='{}'; legit jsonb:='{}'; mixed jsonb; d text; w date; sat date;
  g2 uuid; g3 uuid; r3 uuid; staging jsonb; expected jsonb;
BEGIN
 SELECT * INTO c FROM _ctx;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-b000-000000000011','role','authenticated')::text,true);
 -- 東京 7 店と同じ形（staging・本番 2026-10-21 の値そのまま）
 staging:='{"friday": {"is_open": true, "open_time": "13:00", "close_time": "23:00", "available_slots": ["afternoon", "evening", "morning"], "slot_start_times": {"evening": "19:00", "morning": "10:00", "afternoon": "13:00"}}, "monday": {"is_open": true, "open_time": "13:00", "close_time": "23:00", "available_slots": ["afternoon", "evening", "morning"], "slot_start_times": {"evening": "19:00", "morning": "10:00", "afternoon": "13:00"}}, "sunday": {"is_open": true, "open_time": "09:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"evening": "19:00", "morning": "09:00", "afternoon": "14:00"}}, "tuesday": {"is_open": true, "open_time": "13:00", "close_time": "23:00", "available_slots": ["afternoon", "evening", "morning"], "slot_start_times": {"evening": "19:00", "morning": "10:00", "afternoon": "13:00"}}, "saturday": {"is_open": true, "open_time": "09:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"evening": "19:00", "morning": "09:00", "afternoon": "14:00"}}, "thursday": {"is_open": true, "open_time": "13:00", "close_time": "23:00", "available_slots": ["afternoon", "evening", "morning"], "slot_start_times": {"evening": "19:00", "morning": "10:00", "afternoon": "13:00"}}, "wednesday": {"is_open": true, "open_time": "13:00", "close_time": "23:00", "available_slots": ["afternoon", "evening", "morning"], "slot_start_times": {"evening": "19:00", "morning": "10:00", "afternoon": "13:00"}}}'::jsonb;
 tokyo:=staging;
 -- 正当な朝営業: 平日も開店 10:00（3 枠）
 FOREACH d IN ARRAY ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] LOOP
  legit:=legit||jsonb_build_object(d,(staging->d)||jsonb_build_object('open_time','10:00'));
 END LOOP;
 -- 境界: 月曜は朝だけ（外すと空 = 3 枠とも有効になるため対象外）、火曜は定休日、水〜金は対象
 mixed:=staging||jsonb_build_object('monday',(staging->'monday')||'{"available_slots":["morning"]}','tuesday',(staging->'tuesday')||'{"is_open":false}');
 INSERT INTO _qw VALUES('tokyo',tokyo),('legit',legit),('mixed',mixed);
 DELETE FROM business_hours_settings WHERE organization_id=c.org;
 INSERT INTO business_hours_settings(organization_id,store_id,opening_hours) VALUES(c.org,c.st2,tokyo),(c.org,c.st1,legit),(c.org,c.st3,mixed);
 -- 札幌相当: 別の組織（同じ形 = もし組織で絞らなければ対象になる）
 INSERT INTO organizations(id,name,slug) VALUES(c.other_org,'試験 別組織','test-other-org-qw') ON CONFLICT DO NOTHING;
 INSERT INTO stores(id,name,short_name,organization_id) VALUES(c.other_st,'試験 別組織の店','別',c.other_org) ON CONFLICT DO NOTHING;
 INSERT INTO business_hours_settings(organization_id,store_id,opening_hours) VALUES(c.other_org,c.other_st,tokyo);
 UPDATE organization_scenarios SET available_stores=ARRAY[c.st1::text,c.st2::text],duration=210,weekend_duration=NULL,
   private_booking_time_slots='{}',private_booking_time_slots_weekend=NULL,private_booking_slot_start_times=NULL,override_title=NULL
  WHERE organization_id=c.org AND scenario_master_id=c.sm;

 -- 変換だけ: staging の値 → 平日 available_slots が ["afternoon","evening"]、他は同じ
 expected:=staging;
 FOREACH d IN ARRAY ARRAY['monday','tuesday','wednesday','thursday','friday'] LOOP
  expected:=expected||jsonb_build_object(d,(staging->d)||'{"available_slots":["afternoon","evening"]}');
 END LOOP;
 INSERT INTO _qw VALUES('expected_after',expected);

 w:=pg_temp.day_of(3,2); sat:=pg_temp.day_of(6,2);
 INSERT INTO _qw VALUES('w',to_jsonb(w)),('sat',to_jsonb(sat));
 -- 既存の行（架空）: (1) 未申込グループ・平日 10:00 と 13:00 の候補 (2) 申請中 (3) 確定済み（いずれも平日 10:00）
 g2:=(create_private_group_atomic(c.org,c.sm,'未申込',ARRAY[c.st2],
   jsonb_build_array(jsonb_build_object('date',w,'time_slot','午前','start_time','10:00','end_time','13:30'),
    jsonb_build_object('date',w,'time_slot','午後','start_time','13:00','end_time','16:30')),NULL)->>'id')::uuid;
 INSERT INTO _qw VALUES('grp_unapplied',jsonb_build_array(g2));
 DELETE FROM private_group_candidate_dates WHERE group_id=c.grp;
 UPDATE private_groups SET status='gathering',reservation_id=NULL,preferred_store_ids=ARRAY[c.st2] WHERE id=c.grp;
 PERFORM private_group_add_candidate_dates(c.grp,gen_random_uuid(),c.sm,ARRAY[c.st2],
  jsonb_build_array(jsonb_build_object('date',pg_temp.day_of(2,3),'time_slot','morning','start_time','10:00','end_time','13:30')));
 PERFORM pg_temp.request(c.grp,ARRAY[c.st2],jsonb_build_array(jsonb_build_object('date',pg_temp.day_of(2,3),'timeSlot','午前','startTime','10:00','endTime','13:30')));
 INSERT INTO _qw VALUES('grp_pending',jsonb_build_array(c.grp));
 g3:=(create_private_group_atomic(c.org,c.sm,'確定済み',ARRAY[c.st2],
   jsonb_build_array(jsonb_build_object('date',pg_temp.day_of(4,3),'time_slot','午前','start_time','10:00','end_time','13:30')),NULL)->>'id')::uuid;
 r3:=pg_temp.request(g3,ARRAY[c.st2],jsonb_build_array(jsonb_build_object('date',pg_temp.day_of(4,3),'timeSlot','午前','startTime','10:00','endTime','13:30')));
 UPDATE reservations SET status='confirmed',store_id=c.st2 WHERE id=r3;
 UPDATE private_groups SET status='confirmed' WHERE id=g3;
 INSERT INTO _qw VALUES('grp_confirmed',jsonb_build_array(g3));
END $$;
SET mmq_fix.expected_days = '8';

-- 前の状態を記録
CREATE FUNCTION pg_temp.snapshot(p_step text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c _ctx; w date; sat date;
BEGIN
 SELECT * INTO c FROM _ctx; SELECT (v#>>'{}')::date INTO w FROM _qw WHERE k='w'; SELECT (v#>>'{}')::date INTO sat FROM _qw WHERE k='sat';
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _qw_log VALUES
  (p_step,'作品ページ 平日 朝',pg_temp.slot(c.st2,w,'morning')),
  (p_step,'作品ページ 平日 昼',pg_temp.slot(c.st2,w,'afternoon')),
  (p_step,'作品ページ 平日 夜',pg_temp.slot(c.st2,w,'evening')),
  (p_step,'作品ページ 土曜 朝',pg_temp.slot(c.st2,sat,'morning')),
  (p_step,'作品ページ 開店10時の店 平日 朝',pg_temp.slot(c.st1,w,'morning')),
  (p_step,'公開入口 平日',pg_temp.entry(c.st2,w)),
  (p_step,'公開入口 土曜',pg_temp.entry(c.st2,sat)),
  (p_step,'公開入口 開店10時の店 平日',pg_temp.entry(c.st1,w));
 UPDATE organization_scenarios SET private_booking_slot_start_times='{"weekday":{"morning":"10:00","afternoon":"12:00","evening":"16:00"}}'::jsonb
  WHERE organization_id=c.org AND scenario_master_id=c.sm;
 INSERT INTO _qw_log VALUES
  (p_step,'固定時刻の作品 平日 朝 10:00',pg_temp.slot(c.st2,w,'morning')),
  (p_step,'固定時刻の作品 平日 昼 12:00',pg_temp.slot(c.st2,w,'afternoon')),
  (p_step,'固定時刻の作品 平日 夜 16:00',pg_temp.slot(c.st2,w,'evening'));
 UPDATE organization_scenarios SET private_booking_slot_start_times=NULL WHERE organization_id=c.org AND scenario_master_id=c.sm;
END $$;
SELECT pg_temp.snapshot('1 前');
CREATE TEMP TABLE _fp AS SELECT pg_temp.rows_fp() AS rows_before, pg_temp.hours_fp() AS hours_before;

-- 安全装置: 見込み件数が違えば中止（何も変わらない）
SET mmq_fix.expected_days = '35';
SAVEPOINT guard;
\echo '--- 次の ERROR（対象の曜日が 8 件（見込み 35 件））は安全装置の確認で、期待どおり ---'
\set ON_ERROR_STOP off
:qw_fix
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT guard;
DO $$ BEGIN ASSERT pg_temp.hours_fp()=(SELECT hours_before FROM _fp), '安全装置: 件数が違うのに書き換わった'; END $$;
SET mmq_fix.expected_days = '8';

-- 適用 1 回目
:qw_fix
SELECT pg_temp.snapshot('2 後');
CREATE TEMP TABLE _after1 AS SELECT store_id, opening_hours FROM business_hours_settings;
-- 適用 2 回目（冪等）
:qw_fix
DO $$
DECLARE c _ctx; w date; g2 uuid; msg text; tokyo jsonb; legit jsonb; mixed jsonb;
BEGIN
 SELECT * INTO c FROM _ctx; SELECT (v#>>'{}')::date INTO w FROM _qw WHERE k='w';
 SELECT (v->>0)::uuid INTO g2 FROM _qw WHERE k='grp_unapplied';
 SELECT v INTO tokyo FROM _qw WHERE k='tokyo'; SELECT v INTO legit FROM _qw WHERE k='legit'; SELECT v INTO mixed FROM _qw WHERE k='mixed';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-b000-000000000011','role','authenticated')::text,true);
 -- (h) 2 回目は何も変えない・退避は 1 回目の値（3 店）
 ASSERT NOT EXISTS(SELECT 1 FROM business_hours_settings b JOIN _after1 a USING(store_id) WHERE b.opening_hours IS DISTINCT FROM a.opening_hours), '(h) 2 回目で値が変わった';
 ASSERT (SELECT count(*) FROM business_hours_settings_backup_20261021)=2, '(h) 退避が 2 店（東京相当・境界の店）でない';
 ASSERT (SELECT opening_hours FROM business_hours_settings_backup_20261021 WHERE store_id=c.st2)=tokyo, '(h) 退避が元の値でない';
 -- 変換の結果 = staging の値から平日の朝だけを外したもの
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.st2)=(SELECT v FROM _qw WHERE k='expected_after'), '変換の結果が見込みと違う';
 -- (d) 正当な朝営業の店は不変。境界: 月曜（朝だけ）・火曜（定休日）は不変、水〜金だけ外れる。土日は不変
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.st1)=legit, '(d) 開店 10:00 の店が変わった';
 ASSERT (SELECT opening_hours->'monday' FROM business_hours_settings WHERE store_id=c.st3)=mixed->'monday', '境界: 朝だけの月曜が変わった';
 ASSERT (SELECT opening_hours->'tuesday' FROM business_hours_settings WHERE store_id=c.st3)=mixed->'tuesday', '境界: 定休日の火曜が変わった';
 ASSERT (SELECT opening_hours->'wednesday'->'available_slots' FROM business_hours_settings WHERE store_id=c.st3)='["afternoon","evening"]', '境界: 水曜の朝が外れていない';
 ASSERT (SELECT opening_hours-ARRAY['monday','tuesday','wednesday','thursday','friday'] FROM business_hours_settings WHERE store_id=c.st2)
   =tokyo-ARRAY['monday','tuesday','wednesday','thursday','friday'], '(c) 土日が変わった';
 -- (e) 別の組織は不変
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.other_st)=tokyo, '(e) 別の組織の店が変わった';
 -- (f) 既存の候補・予約・グループの行は変わらない
 ASSERT pg_temp.rows_fp()=(SELECT rows_before FROM _fp), '(f) 既存の候補・予約の行が変わった';
 -- (a) 保存の 4 経路。main（本番と同じ DB 関数）では、候補追加だけが店舗の枠設定（I2）で平日朝を拒否する。
 --   グループ作成・店舗への申込・希望店舗の変更は本番の DB 関数が営業時間を確かめないので通る（外れない）。
 --   staging では 4 経路とも拒否・除外する（staging の DB 変更。本番に出たらこの試験を staging と同じに戻す）。
 --   画面（作品ページ・候補の追加・公開入口）は表示の判定で平日朝を出さないので、通常の操作では選べない。
 msg:=pg_temp.err(format($q$SELECT private_group_add_candidate_dates(%L,gen_random_uuid(),%L,ARRAY[%L]::uuid[],
   jsonb_build_array(jsonb_build_object('date',%L,'time_slot','morning','start_time','10:00','end_time','13:30')))$q$,g2,c.sm,c.st2,pg_temp.day_of(5,2)));
 INSERT INTO _qw_log VALUES('2 後','候補追加 平日 朝 10:00',msg); ASSERT msg LIKE '%営業時間外です%', '(a) 候補追加で平日朝が通った: '||msg;
 msg:=pg_temp.err(format($q$SELECT create_private_group_atomic(%L,%L,'x',ARRAY[%L]::uuid[],
   jsonb_build_array(jsonb_build_object('date',%L,'time_slot','午前','start_time','10:00','end_time','13:30')),NULL)$q$,c.org,c.sm,c.st2,pg_temp.day_of(5,2)));
 INSERT INTO _qw_log VALUES('2 後','グループ作成 平日 朝 10:00（main: 本番の DB 関数は通す）',msg); ASSERT msg='no error', '(a)(main) グループ作成の動きが本番の DB 関数と違う: '||msg;
 -- main: 平日朝の候補を含む申込も通る（本番の DB 関数）。確かめたら戻す
 BEGIN
  PERFORM pg_temp.request(g2,ARRAY[c.st2],jsonb_build_array(
   jsonb_build_object('date',w,'timeSlot','午前','startTime','10:00','endTime','13:30'),jsonb_build_object('date',w,'timeSlot','午後','startTime','13:00','endTime','16:30')));
  RAISE EXCEPTION 'undo' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
 END;
 INSERT INTO _qw_log VALUES('2 後','申込（未申込グループの平日朝候補を含む。main: 本番の DB 関数は通す・確かめて戻す）','ok');
 ASSERT pg_temp.rows_fp()=(SELECT rows_before FROM _fp), '(f) 戻したはずの申込が残った';
 -- 昼 13:00 だけなら申込める（(b) の保存側）。確かめたら戻す
 BEGIN
  PERFORM pg_temp.request(g2,ARRAY[c.st2],jsonb_build_array(jsonb_build_object('date',w,'timeSlot','午後','startTime','13:00','endTime','16:30')));
  RAISE EXCEPTION 'undo' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
 END;
 ASSERT pg_temp.rows_fp()=(SELECT rows_before FROM _fp), '(f) 戻したはずの申込が残った';
 INSERT INTO _qw_log VALUES('2 後','申込（平日 昼 13:00 だけ・確かめて戻す）','ok');
 -- 店舗変更（同じ店のまま再設定）。main: 本番の DB 関数は営業時間を見ないので平日朝の候補も外れない。確かめたら戻す
 BEGIN
  ASSERT private_group_set_preferred_stores(g2,ARRAY[c.st2],ARRAY[c.st2])=0, '(a)(main) 店舗変更の動きが本番の DB 関数と違う';
  ASSERT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE group_id=g2 AND start_time LIKE '10:00%'), '(a)(main) 平日朝の候補が外れた';
  ASSERT EXISTS(SELECT 1 FROM private_group_candidate_dates WHERE group_id=g2 AND start_time LIKE '13:00%'), '(f) 昼の候補が外れた';
  RAISE EXCEPTION 'undo' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
 END;
 ASSERT pg_temp.rows_fp()=(SELECT rows_before FROM _fp), '(f) 戻したはずの店舗変更が残った';
 INSERT INTO _qw_log VALUES('2 後','店舗変更（未申込グループ・確かめて戻す。main: 本番の DB 関数は外さない）','平日朝も昼 13:00 も残る');
END $$;
SELECT pg_temp.snapshot('3 2回目の後');

-- (g) 復旧: 修正後に設定画面で変えられた店（境界の店の日曜を変更）は書き戻さず、他は元の値へ
UPDATE business_hours_settings SET opening_hours=jsonb_set(opening_hours,'{sunday,close_time}','"22:00"') WHERE store_id=(SELECT st3 FROM _ctx);
:qw_rb
DO $$
DECLARE c _ctx; tokyo jsonb; legit jsonb; mixed jsonb;
BEGIN
 SELECT * INTO c FROM _ctx;
 SELECT v INTO tokyo FROM _qw WHERE k='tokyo'; SELECT v INTO legit FROM _qw WHERE k='legit'; SELECT v INTO mixed FROM _qw WHERE k='mixed';
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.st2)=tokyo, '(g) 東京相当が元に戻らない';
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.st1)=legit, '(g) 開店 10:00 の店が変わった';
 ASSERT (SELECT opening_hours->'wednesday'->'available_slots' FROM business_hours_settings WHERE store_id=c.st3)='["afternoon","evening"]', '(g) 後から変えられた店を上書きした';
 ASSERT (SELECT opening_hours FROM business_hours_settings WHERE store_id=c.other_st)=tokyo, '(g) 別の組織の店が変わった';
 ASSERT pg_temp.rows_fp()=(SELECT rows_before FROM _fp), '(g) 既存の行が変わった';
END $$;
SELECT pg_temp.snapshot('4 復旧後');
-- 復旧 2 回目（冪等）
CREATE TEMP TABLE _rb1 AS SELECT store_id, opening_hours FROM business_hours_settings;
:qw_rb
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM business_hours_settings b JOIN _rb1 a USING(store_id) WHERE b.opening_hours IS DISTINCT FROM a.opening_hours), '(h) 復旧 2 回目で値が変わった';
END $$;
-- 後から変えられた店も設定画面で直した想定（日曜を戻す）→ 復旧すると全店が元の値
UPDATE business_hours_settings SET opening_hours=jsonb_set(opening_hours,'{sunday,close_time}','"23:00"') WHERE store_id=(SELECT st3 FROM _ctx);
:qw_rb
DO $$ BEGIN ASSERT pg_temp.hours_fp()=(SELECT hours_before FROM _fp), '(g) 全店が元の値に戻らない'; END $$;
-- 復旧の後にもう一度当てても同じ結果（退避は最初の値のまま）
:qw_fix
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM business_hours_settings b JOIN _after1 a USING(store_id) WHERE b.opening_hours IS DISTINCT FROM a.opening_hours), '(h) 当て直しの結果が 1 回目と違う';
END $$;

-- 結果の一覧（前 → 後 → 2 回目の後 → 復旧後）
SELECT item,
  max(result) FILTER (WHERE step='1 前') AS before,
  max(result) FILTER (WHERE step='2 後') AS after,
  max(result) FILTER (WHERE step='3 2回目の後') AS after_twice,
  max(result) FILTER (WHERE step='4 復旧後') AS after_rollback
FROM _qw_log GROUP BY item ORDER BY min(ctid::text);
-- 期待との突き合わせ
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('作品ページ 平日 朝','ok 10:00-13:30','closed:closed'),
  ('作品ページ 平日 昼','ok 13:00-16:30','ok 13:00-16:30'),
  ('作品ページ 平日 夜','ok 19:00-22:30','ok 19:00-22:30'),
  ('作品ページ 土曜 朝','ok 09:00-12:30','ok 09:00-12:30'),
  ('作品ページ 開店10時の店 平日 朝','ok 10:00-13:30','ok 10:00-13:30'),
  ('公開入口 平日','morning@10:00,afternoon@13:00,evening@19:00','afternoon@13:00,evening@19:00'),
  ('公開入口 土曜','morning@09:00,afternoon@14:00,evening@19:00','morning@09:00,afternoon@14:00,evening@19:00'),
  ('公開入口 開店10時の店 平日','morning@10:00,afternoon@13:00,evening@19:00','morning@10:00,afternoon@13:00,evening@19:00'),
  ('固定時刻の作品 平日 朝 10:00','ok 10:00-13:30','closed:closed'),
  ('固定時刻の作品 平日 昼 12:00','ok 12:00-15:30','ok 12:00-15:30'),
  ('固定時刻の作品 平日 夜 16:00','ok 16:00-19:30','ok 16:00-19:30')) e(item,b,a)
 LOOP
  ASSERT (SELECT result FROM _qw_log WHERE step='1 前' AND item=r.item)=r.b, format('前 %s: 期待 %s / 実際 %s', r.item, r.b, (SELECT result FROM _qw_log WHERE step='1 前' AND item=r.item));
  ASSERT (SELECT result FROM _qw_log WHERE step='2 後' AND item=r.item)=r.a, format('後 %s: 期待 %s / 実際 %s', r.item, r.a, (SELECT result FROM _qw_log WHERE step='2 後' AND item=r.item));
  ASSERT (SELECT result FROM _qw_log WHERE step='3 2回目の後' AND item=r.item)=r.a, format('2 回目 %s', r.item);
  ASSERT (SELECT result FROM _qw_log WHERE step='4 復旧後' AND item=r.item)=r.b, format('復旧後 %s: 期待 %s / 実際 %s', r.item, r.b, (SELECT result FROM _qw_log WHERE step='4 復旧後' AND item=r.item));
 END LOOP;
 RAISE NOTICE 'データ修正の試験 (a)〜(h): すべて合格';
END $$;
ROLLBACK;
