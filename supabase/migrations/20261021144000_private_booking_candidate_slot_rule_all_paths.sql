-- issue #1200（main 向け hotfix #1202）: 店舗への申込・グループ作成・希望店舗の変更でも、店舗の曜日ごとの枠設定（I2 available_slots）と
-- 作品の時間枠（I10）を確かめる。本番（main）ではこの 3 経路が I2 を見ておらず、設定で平日朝を止めても
-- 平日朝の候補から申込・グループ作成ができ、希望店舗を変えても候補が外れなかった（staging は #1168 / 20261020210000 で対応済み。
-- それを丸ごと移さず、main にある関数だけで最小の検査を足す）。
-- 店舗ごとの検査: private_booking_store_slot_rule（新規）。店舗 1 つで I10（その店舗の平日／土日祝。特別営業日は土日祝）と
--   I2（表示・候補の追加と同じ private_booking_store_day_slots。本番 c0bec3c1cd17722fe446b23745ce89b8）を確かめる。
--   開店時刻では決めない（昼 12:00・夜 16:00 固定は通る）。
-- 3 経路とも「同じ店舗で 枠が有効 AND 空き（受付停止・募集停止・公演と重ならない）」が、希望店舗・送る店舗のどれか 1 店で成り立つときだけ通す
--   （枠の可否と空きを別々の店で満たして通ることはない）:
--   create_private_booking_request: 成り立たない候補があれば申込全体を拒否。どの店も枠が無効なら 22023「選択した候補日時は現在受付できません…」、
--     それ以外は従来どおり受付停止（P0040）／公演と重なる（P0030）
--   create_private_group_atomic: 成り立たない候補があれば 22023（同じ文面。理由は 受付停止中／他の公演と重なります／営業時間外／作品の時間帯）で拒否。
--     作品の時間枠（I10）は希望店舗があれば店舗ごとの平日／土日祝で読む（組織の平日／土日祝での事前検査は希望店舗が空のときだけ）。
--     希望店舗が空なら店舗は見ない（従来どおり）
--   private_group_set_preferred_stores: 新しい希望店舗で成り立たない候補を外す（外した件数を返す既存の動き）
-- 既存の候補・申請中・確定済みの行は変えない（関数の差し替えだけ）。
-- 各関数の本体は本番の定義（2026-10-21 読み取り、supabase/rpcs/ と同じ）に検査を足しただけ。正本: supabase/rpcs/*.sql
-- 巻き戻し: supabase/rollbacks/20261021144000_private_booking_candidate_slot_rule_all_paths.sql
-- 仕様: docs/product-spec/貸切受付ルール.md（例 R39・経緯）。試験: supabase/tests/private_booking_candidate_slot_rule_all_paths.sql ほか

-- 貸切の候補 1 件（日付 × 枠）が、店舗 1 つで、作品の時間枠（I10）と店舗の曜日ごとの枠設定（I2 available_slots）の両方で有効か（issue #1200、main 向け）。
-- 戻り値: NULL = 有効 / 'slot_not_allowed' = 作品の時間枠に無い / 'closed' = この店舗はこの日のこの枠を受け付けていない（上演できない店舗も）。
-- 店舗ごとに判定する（呼び出し側は「この店舗で枠が有効 AND この店舗で空いている」を店舗ごとに確かめ、どれか 1 店で成り立てば通す）。
-- 平日／土日祝の扱いも店舗ごと: 土日・祝日・組織の独自休日に加え、その店舗の特別営業日（special_open_days）は土日祝（I5）。
--   I10 の平日／土日祝の枠、作品の開始時刻（I11）はこの店舗ごとの扱いで読む（private_booking_slot_store_fit と同じ）。
-- 店舗の枠は表示・候補の追加と同じ private_booking_store_day_slots で読む。開店時刻（open_time）では決めない
--   （昼 12:00・夜 16:00 などの固定開始は、枠が有効なら通る）。公演・受付停止・募集停止は呼び出し側で見る。
-- p_single: 希望店舗・送る店舗が 1 店だけか（営業設定の無い店舗を 3 枠とも有効とみなすのはそのときだけ。表示と同じ）。
-- 店舗の絞り込み（同じ組織・有効・オフィス以外・作品の上演店舗／臨時会場以外）は private_booking_slot_store_fit と同じ。
CREATE OR REPLACE FUNCTION public.private_booking_store_slot_rule(p_org uuid, p_scenario_id uuid, p_store_id uuid, p_date date, p_slot text, p_single boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_available_stores text[]; v_weekday text[]; v_weekend text[]; v_start_times jsonb; v_custom jsonb;
 v_holiday boolean; v_hours jsonb; v_weekend_day boolean; v_allowed text[]; v_eff jsonb;
BEGIN
 IF p_store_id IS NULL OR p_date IS NULL OR p_slot IS NULL OR p_slot NOT IN ('morning','afternoon','evening') THEN RETURN 'closed'; END IF;
 SELECT s.available_stores, s.private_booking_time_slots, s.private_booking_time_slots_weekend, s.private_booking_slot_start_times
   INTO v_available_stores, v_weekday, v_weekend, v_start_times
 FROM public.organization_scenarios s
 WHERE s.organization_id=p_org AND (s.scenario_master_id=p_scenario_id OR s.id=p_scenario_id)
 ORDER BY (s.id=p_scenario_id) DESC LIMIT 1;
 SELECT to_jsonb(h) INTO v_hours FROM public.stores s
  LEFT JOIN public.business_hours_settings h ON h.store_id=s.id AND h.organization_id=p_org
 WHERE s.id=p_store_id AND s.organization_id=p_org AND s.status='active'
  AND s.ownership_type IS DISTINCT FROM 'office'
  AND CASE WHEN coalesce(cardinality(v_available_stores),0)>0 THEN s.id::text=ANY(v_available_stores) ELSE NOT coalesce(s.is_temporary,false) END
 ORDER BY h.id LIMIT 1;
 IF NOT FOUND THEN RETURN 'closed'; END IF;
 SELECT coalesce(os.custom_holidays,'[]'::jsonb) INTO v_custom FROM public.organization_settings os WHERE os.organization_id=p_org;
 v_holiday:=extract(dow FROM p_date) IN (0,6) OR public.is_booking_calendar_holiday(p_date) OR coalesce(v_custom ? p_date::text,false);
 v_weekend_day:=v_holiday OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(v_hours->'special_open_days','null'::jsonb),'[]'::jsonb)) d WHERE d->>'date'=p_date::text);
 -- I10（この店舗での平日／土日祝で読む）
 v_allowed:=CASE WHEN v_weekend_day THEN v_weekend ELSE v_weekday END;
 IF coalesce(cardinality(v_allowed),0)>0 AND NOT EXISTS(
  SELECT 1 FROM unnest(v_allowed) value WHERE value=ANY(CASE p_slot
   WHEN 'morning' THEN ARRAY['午前','朝公演','朝'] WHEN 'afternoon' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
 ) THEN RETURN 'slot_not_allowed'; END IF;
 -- I2（private_booking_slot_store_fit と同じ読み方）
 v_eff:=public.apply_scenario_slot_start_times(v_hours,v_start_times,v_weekend_day);
 IF EXISTS(SELECT 1 FROM public.private_booking_store_day_slots(p_date,v_eff,v_holiday,coalesce(p_single,false)) x WHERE x.slot_key=p_slot) THEN
  RETURN NULL;
 END IF;
 RETURN 'closed';
END $function$;
REVOKE ALL ON FUNCTION public.private_booking_store_slot_rule(uuid,uuid,uuid,date,text,boolean) FROM PUBLIC,anon,authenticated;

-- QW-20260917-001 A04: either the complete invitation group is created, or nothing is.
CREATE OR REPLACE FUNCTION public.create_private_group_atomic(
 p_organization_id uuid,p_scenario_master_id uuid,p_name text DEFAULT NULL,
 p_preferred_store_ids uuid[] DEFAULT '{}',p_candidate_dates jsonb DEFAULT '[]',p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
 v_user uuid:=auth.uid(); v_group public.private_groups; v_member uuid;
 v_name text; v_settings public.global_settings; v_date jsonb; v_order bigint;
 v_custom_holidays jsonb; v_weekday_slots text[]; v_weekend_slots text[]; v_cand date; v_holiday boolean; v_allowed text[];
 v_slot text; v_start time; v_end time; v_store uuid; v_r text; v_rule text; v_busy text; v_ok boolean; v_single boolean;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_organization_id AND is_active IS TRUE) THEN
  RAISE EXCEPTION '組織情報が取得できません' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_scenarios_with_master
   WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id
   AND player_count_min>=1 AND player_count_max>=player_count_min AND accepts_private_booking IS TRUE) THEN
  RAISE EXCEPTION 'この作品は現在貸切を受け付けていません' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_preferred_store_ids,'{}')) s(id)
   WHERE NOT EXISTS(SELECT 1 FROM stores WHERE stores.id=s.id AND organization_id=p_organization_id AND status='active')) THEN
  RAISE EXCEPTION '選択した店舗はこの組織で利用できません' USING ERRCODE='22023';
 END IF;
 IF p_candidate_dates IS NULL OR jsonb_typeof(p_candidate_dates)<>'array' THEN
  RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_candidate_dates)>100 OR length(coalesce(p_name,''))>200 OR length(coalesce(p_notes,''))>10000 THEN
  RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(nullif(nickname,''),nullif(name,'')) INTO v_name FROM customers WHERE user_id=v_user ORDER BY id LIMIT 1;
 SELECT * INTO v_settings FROM global_settings WHERE organization_id=p_organization_id LIMIT 1;
 SELECT coalesce(custom_holidays,'[]'::jsonb) INTO v_custom_holidays FROM organization_settings WHERE organization_id=p_organization_id LIMIT 1;
 v_custom_holidays:=coalesce(v_custom_holidays,'[]'::jsonb);
 SELECT private_booking_time_slots,private_booking_time_slots_weekend INTO v_weekday_slots,v_weekend_slots
   FROM organization_scenarios WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id LIMIT 1;
 INSERT INTO private_groups(organization_id,scenario_master_id,organizer_id,name,invite_code,status,preferred_store_ids,notes)
 VALUES(p_organization_id,p_scenario_master_id,v_user,nullif(trim(p_name),''),encode(extensions.gen_random_bytes(16),'hex'),'gathering',coalesce(p_preferred_store_ids,'{}'),p_notes)
 RETURNING * INTO v_group;
 INSERT INTO private_group_members(group_id,user_id,guest_name,is_organizer,status,joined_at)
 VALUES(v_group.id,v_user,coalesce(v_name,'主催者'),true,'joined',clock_timestamp()) RETURNING id INTO v_member;
 FOR v_date,v_order IN SELECT value,ordinality FROM jsonb_array_elements(p_candidate_dates) WITH ORDINALITY LOOP
  IF jsonb_typeof(v_date)<>'object' OR coalesce(v_date->>'time_slot','') NOT IN ('午前','午後','夜間')
    OR coalesce(v_date->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(v_date->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
   RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
  END IF;
  -- 作品の貸切受付枠（平日・土日祝は別々。未設定は全枠受付）。候補追加時の判定と同じ。
  -- 希望店舗があるときは、店舗ごとの平日／土日祝（特別営業日を含む）で下の private_booking_store_slot_rule が判定する（issue #1200）。
  -- ここ（組織の平日／土日祝）で判定するのは希望店舗が空のときだけ（従来どおり）。
  v_cand:=(v_date->>'date')::date;
  v_holiday:=extract(dow FROM v_cand) IN (0,6) OR public.is_booking_calendar_holiday(v_cand) OR coalesce(v_custom_holidays ? v_cand::text,false);
  v_allowed:=CASE WHEN v_holiday THEN v_weekend_slots ELSE v_weekday_slots END;
  IF coalesce(cardinality(p_preferred_store_ids),0)=0 AND coalesce(cardinality(v_allowed),0)>0 AND NOT EXISTS(
   SELECT 1 FROM unnest(v_allowed) value WHERE value=ANY(CASE v_date->>'time_slot'
    WHEN '午前' THEN ARRAY['午前','朝公演','朝'] WHEN '午後' THEN ARRAY['午後','昼公演','昼'] ELSE ARRAY['夜','夜公演'] END)
  ) THEN RAISE EXCEPTION 'この作品では選択できない時間帯です' USING ERRCODE='22023'; END IF;
  -- 希望店舗のどれか 1 店で「枠が有効（I2・I10。private_booking_store_slot_rule）AND 受付停止・募集停止・公演と重ならない」が
  -- 成り立つ候補だけ作る（issue #1200）。店舗ごとに両方を確かめ、他店の条件を混ぜない。希望店舗が空なら店舗は見ない（従来どおり）
  IF coalesce(cardinality(p_preferred_store_ids),0)>0 THEN
   v_slot:=CASE v_date->>'time_slot' WHEN '午前' THEN 'morning' WHEN '午後' THEN 'afternoon' ELSE 'evening' END;
   v_start:=(v_date->>'start_time')::time; v_end:=(v_date->>'end_time')::time;
   v_rule:=NULL; v_busy:=NULL; v_ok:=false;
   SELECT count(DISTINCT s)=1 INTO v_single FROM unnest(p_preferred_store_ids) s;
   FOR v_store IN SELECT DISTINCT s FROM unnest(p_preferred_store_ids) s ORDER BY s LOOP
    v_r:=public.private_booking_store_slot_rule(p_organization_id,p_scenario_master_id,v_store,v_cand,v_slot,v_single);
    IF v_r IS NOT NULL THEN v_rule:=CASE WHEN v_rule='closed' OR v_r='closed' THEN 'closed' ELSE v_r END; CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM schedule_blocked_slots b WHERE b.organization_id=p_organization_id AND b.store_id=v_store::text AND b.date=v_cand AND b.time_slot=v_slot)
     OR public.is_store_recruitment_paused(v_store,'private',v_cand) THEN v_busy:='blocked'; CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM schedule_events e WHERE e.organization_id=p_organization_id AND e.store_id=v_store AND e.is_cancelled=false
     AND e.date BETWEEN v_cand-2 AND v_cand+2
     AND e.date+e.start_time < v_cand+v_end+CASE WHEN v_end<v_start THEN interval '1 day' ELSE interval '0 days' END+make_interval(mins=>public.resolve_preparation_minutes(p_organization_id,NULL,NULL,e.id))
     AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand+v_start-make_interval(mins=>public.resolve_preparation_minutes(p_organization_id,v_store,p_scenario_master_id,NULL))
    ) THEN v_busy:=coalesce(v_busy,'conflict'); CONTINUE; END IF;
    v_ok:=true; EXIT;
   END LOOP;
   IF NOT v_ok THEN
    RAISE EXCEPTION '選択した候補日時は現在受付できません（%/% %: %）。空き状況を更新して選び直してください',
     extract(month FROM v_cand),extract(day FROM v_cand),CASE v_date->>'time_slot' WHEN '夜間' THEN '夜' ELSE v_date->>'time_slot' END,
     CASE WHEN v_busy='blocked' THEN '受付停止中です' WHEN v_busy='conflict' THEN '他の公演と重なります'
      WHEN v_rule='slot_not_allowed' THEN 'この作品では選択できない時間帯です' ELSE '営業時間外です' END
     USING ERRCODE='22023';
   END IF;
  END IF;
  INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num)
  VALUES(v_group.id,(v_date->>'date')::date,v_date->>'time_slot',v_date->>'start_time',v_date->>'end_time',coalesce((v_date->>'order_num')::integer,v_order::integer));
 END LOOP;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(v_group.id,v_member,jsonb_build_object(
  'type','system','action','group_created','organizerName',coalesce(v_name,'主催者'),
  'title',coalesce(nullif(v_settings.system_msg_group_created_title,''),'貸切リクエストグループを作成しました'),
  'body',coalesce(nullif(v_settings.system_msg_group_created_body,''),'招待リンクを共有して、参加メンバーを招待してください。'),
  'note',coalesce(nullif(v_settings.system_msg_group_created_note,''),'※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'))::text);
 RETURN to_jsonb(v_group);
END $$;
REVOKE ALL ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) TO authenticated,service_role;

-- 正本: 顧客QA回帰修正（本番取得定義から最小変更）
CREATE OR REPLACE FUNCTION public.create_private_booking_request(p_scenario_id uuid, p_customer_id uuid, p_customer_name text, p_customer_email text, p_customer_phone text, p_participant_count integer, p_candidate_datetimes jsonb, p_notes text DEFAULT NULL::text, p_reservation_number text DEFAULT NULL::text, p_private_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scenario_title TEXT;
  v_duration INTEGER;
  v_participation_fee NUMERIC;
  v_total_price NUMERIC;
  v_participation_costs JSONB;
  v_custom_holidays JSONB;
  v_unit_price INTEGER;
  v_pricing_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_reservation_id UUID;
  v_gm_id UUID;
  v_org_id UUID;
  v_row_org_id UUID;
  v_scenario_org_count INTEGER;
  v_first_candidate JSONB;
  v_requested_datetime TIMESTAMPTZ;
  v_scenario_master_id UUID;
  -- 空き判定用
  v_cand JSONB;
  v_cand_date DATE;
  v_cand_start TIME;
  v_cand_end TIME;
  v_store_id_text TEXT;
  v_store_uuid UUID;
  v_store_available BOOLEAN;
  v_blocked_store_count INTEGER;
  v_requested_store_count INTEGER;
  v_candidate_count INTEGER;
  v_candidate_time_slot TEXT;
  v_caller_user_id UUID;
  v_customer_org_id UUID;
  v_group RECORD;
  v_group_candidate_id UUID;
  v_group_candidate_date DATE;
  v_group_candidate_time_slot TEXT;
  v_group_candidate_start TIME;
  v_group_candidate_end TIME;
  v_group_candidate_order INTEGER;
  v_store_name TEXT;
  v_store_short_name TEXT;
  v_seen_store_ids UUID[] := '{}'::UUID[];
  v_seen_group_candidate_ids UUID[] := '{}'::UUID[];
  v_trusted_candidates JSONB := '[]'::JSONB;
  v_trusted_requested_stores JSONB := '[]'::JSONB;
  v_trusted_candidate_datetimes JSONB;
  v_candidate_order INTEGER := 0;
  v_updated_count INTEGER;
  v_accepts_private_booking BOOLEAN;
  v_player_count_min INTEGER;
  v_player_count_max INTEGER;
  v_scenario_kind TEXT;
  v_slot_rule TEXT;
  v_store_rule TEXT;
  v_rule_store_count INTEGER;
BEGIN
  -- 20260414150000 の認可境界を維持する。SECURITY DEFINERでもanon/なりすましを許可しない。
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0401';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated customer is required' USING ERRCODE = 'P0401';
  END IF;

  SELECT customer.organization_id
  INTO v_customer_org_id
  FROM customers customer
  WHERE customer.id = p_customer_id
    AND customer.user_id = v_caller_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: customer does not belong to authenticated user'
      USING ERRCODE = 'P0401';
  END IF;

  IF p_customer_email IS NULL OR btrim(p_customer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(btrim(p_customer_email))>254 THEN
    RAISE EXCEPTION '有効なメールアドレスを入力してください' USING ERRCODE='P0021';
  END IF;
  IF p_customer_phone IS NULL OR regexp_replace(p_customer_phone,'[-[:space:]]','','g') !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION '電話番号は10〜11桁で入力してください' USING ERRCODE='P0022';
  END IF;

  -- 貸切リクエストは必ずグループから申し込む（画面は送信前にグループを作る）。#834 #842
  -- 本人確認（P0401）の後に判定する。店舗の誤りと区別できるよう専用のコード P0047 を使う。
  IF p_private_group_id IS NULL THEN
    RAISE EXCEPTION '貸切リクエストはグループから申し込んでください' USING ERRCODE = 'P0047';
  END IF;

  -- ===========================================================================
  -- 組織の決定（最優先: グループの組織 = 申込ページの組織コンテキスト）
  -- ===========================================================================
  IF p_private_group_id IS NOT NULL THEN
    SELECT *
    INTO v_group
    FROM private_groups
    WHERE id = p_private_group_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_group.organizer_id IS DISTINCT FROM v_caller_user_id
       OR (
         v_customer_org_id IS NOT NULL
         AND v_group.organization_id IS DISTINCT FROM v_customer_org_id
       )
    THEN
      RAISE EXCEPTION 'Unauthorized private group'
        USING ERRCODE = 'P0401';
    END IF;

    v_org_id := v_group.organization_id;
  END IF;

  -- ===========================================================================
  -- シナリオ情報の取得
  -- 1) p_scenario_id を organization_scenarios.id（org固有ID）として検索。
  --    組織が確定済みの場合はその組織の行に限定する。
  -- ===========================================================================
  SELECT
    COALESCE(os.override_title, sm.title),
    COALESCE(os.duration, sm.official_duration),
    os.participation_fee, os.participation_costs,
    os.organization_id,
    os.scenario_master_id
  INTO
    v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_row_org_id, v_scenario_master_id
  FROM organization_scenarios os
  JOIN scenario_masters sm ON os.scenario_master_id = sm.id
  WHERE os.id = p_scenario_id
    AND (v_org_id IS NULL OR os.organization_id = v_org_id);

  IF FOUND THEN
    v_org_id := COALESCE(v_org_id, v_row_org_id);
  END IF;

  -- 2) 見つからない場合、p_scenario_id を scenario_master_id として検索（組織確定済み）
  IF v_scenario_title IS NULL AND v_org_id IS NOT NULL THEN
    SELECT
      COALESCE(os.override_title, sm.title),
      COALESCE(os.duration, sm.official_duration),
      os.participation_fee, os.participation_costs,
      os.scenario_master_id
    INTO
      v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_scenario_master_id
    FROM organization_scenarios os
    JOIN scenario_masters sm ON os.scenario_master_id = sm.id
    WHERE os.scenario_master_id = p_scenario_id
      AND os.organization_id = v_org_id
    ORDER BY os.created_at
    LIMIT 1;
  END IF;

  -- 3) 組織未確定で master_id 検索: 登録が1組織のみの場合に限り採用。
  --    複数組織に登録されている場合は不定な選択をせずエラーにする。
  IF v_scenario_title IS NULL AND v_org_id IS NULL THEN
    SELECT COUNT(DISTINCT os.organization_id) INTO v_scenario_org_count
    FROM organization_scenarios os
    WHERE os.scenario_master_id = p_scenario_id;

    IF v_scenario_org_count > 1 THEN
      RAISE EXCEPTION 'Scenario % is registered in multiple organizations; organization context (private group) is required', p_scenario_id
        USING ERRCODE = 'P0031';
    ELSIF v_scenario_org_count = 1 THEN
      SELECT
        COALESCE(os.override_title, sm.title),
        COALESCE(os.duration, sm.official_duration),
        os.participation_fee, os.participation_costs,
        os.organization_id,
        os.scenario_master_id
      INTO
        v_scenario_title, v_duration, v_participation_fee, v_participation_costs, v_row_org_id, v_scenario_master_id
      FROM organization_scenarios os
      JOIN scenario_masters sm ON os.scenario_master_id = sm.id
      WHERE os.scenario_master_id = p_scenario_id
      ORDER BY os.created_at
      LIMIT 1;

      IF FOUND THEN
        v_org_id := v_row_org_id;
      END IF;
    END IF;
  END IF;

  -- 4) organization_scenarios で見つからない場合は scenarios_v2 ビューから取得
  --    （組織はここでは確定しない — グループ由来の v_org_id のみ有効）
  IF v_scenario_title IS NULL THEN
    SELECT title, duration, participation_fee, participation_costs
    INTO v_scenario_title, v_duration, v_participation_fee, v_participation_costs
    FROM scenarios_v2
    WHERE id = p_scenario_id;

    v_scenario_master_id := p_scenario_id;
  END IF;

  -- 5) scenarios_v2 でも見つからない場合は scenario_masters のタイトルだけ取得
  IF v_scenario_title IS NULL THEN
    SELECT title, official_duration
    INTO v_scenario_title, v_duration
    FROM scenario_masters
    WHERE id = p_scenario_id;

    v_scenario_master_id := p_scenario_id;
  END IF;

  IF v_scenario_title IS NULL THEN
    RAISE EXCEPTION 'Scenario not found: %', p_scenario_id USING ERRCODE = 'P0001';
  END IF;

  -- platform customerはorganization_id=NULLを正規形とする。org固定customerだけ不一致を拒否する。
  IF v_customer_org_id IS NOT NULL
     AND v_org_id IS DISTINCT FROM v_customer_org_id
  THEN
    RAISE EXCEPTION 'Customer organization does not match booking organization'
      USING ERRCODE = 'P0401';
  END IF;

  IF p_private_group_id IS NOT NULL
     AND v_group.scenario_master_id IS NOT NULL
     AND v_group.scenario_master_id IS DISTINCT FROM v_scenario_master_id
  THEN
    RAISE EXCEPTION 'Private group scenario does not match booking scenario'
      USING ERRCODE = 'P0043';
  END IF;

  -- デフォルト値の設定
  v_duration := COALESCE(v_duration, 240);
  v_participation_fee := COALESCE(v_participation_fee, 4000);

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for scenario' USING ERRCODE = 'P0026';
  END IF;

  SELECT COALESCE(os.custom_holidays, '[]'::JSONB) INTO v_custom_holidays
  FROM organization_settings os WHERE os.organization_id = v_org_id;
  v_custom_holidays := COALESCE(v_custom_holidays, '[]'::JSONB);

  -- 貸切受付OFF / 出張限定（offsite_only）は顧客リクエストを拒否する
  SELECT
    COALESCE(os.accepts_private_booking, true),
    COALESCE(os.scenario_kind, 'regular')
  INTO
    v_accepts_private_booking,
    v_scenario_kind
  FROM organization_scenarios os
  WHERE os.organization_id = v_org_id
    AND (
      os.id = p_scenario_id
      OR os.scenario_master_id = COALESCE(v_scenario_master_id, p_scenario_id)
    )
  ORDER BY
    CASE WHEN os.id = p_scenario_id THEN 0 ELSE 1 END,
    os.created_at
  LIMIT 1;

  IF FOUND AND (
    v_accepts_private_booking IS FALSE
    OR v_scenario_kind = 'offsite_only'
  ) THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_NOT_ACCEPTED' USING ERRCODE = 'P0044';
  END IF;

  -- 店舗側の不要な人数制限ではなく、導入作品の実効プレイ人数を検証する。
  SELECT COALESCE(os.override_player_count_min,sm.player_count_min),
         COALESCE(os.override_player_count_max,sm.player_count_max)
    INTO v_player_count_min,v_player_count_max
  FROM public.organization_scenarios os
  JOIN public.scenario_masters sm ON sm.id=os.scenario_master_id
  WHERE os.organization_id=v_org_id AND os.scenario_master_id=v_scenario_master_id;
  IF NOT FOUND OR v_player_count_min IS NULL OR v_player_count_max IS NULL
     OR v_player_count_min<1 OR v_player_count_max<v_player_count_min THEN
    RAISE EXCEPTION 'PRIVATE_BOOKING_PLAYER_COUNT_NOT_CONFIGURED' USING ERRCODE='P0051';
  END IF;
  IF p_participant_count IS NULL OR p_participant_count<v_player_count_min OR p_participant_count>v_player_count_max THEN
    RAISE EXCEPTION 'Participant count must be between % and %',v_player_count_min,v_player_count_max USING ERRCODE='P0025';
  END IF;

  IF jsonb_typeof(p_candidate_datetimes) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_candidate_datetimes->'requestedStores') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_candidate_datetimes->'candidates') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'INVALID_CANDIDATE_PAYLOAD' USING ERRCODE = 'P0041';
  END IF;

  v_requested_store_count := jsonb_array_length(p_candidate_datetimes->'requestedStores');
  v_candidate_count := jsonb_array_length(p_candidate_datetimes->'candidates');
  IF v_requested_store_count = 0 OR v_candidate_count = 0 THEN
    RAISE EXCEPTION 'CANDIDATES_AND_REQUESTED_STORES_REQUIRED' USING ERRCODE = 'P0023';
  END IF;

  -- store名を含む保存payloadはDBから再構築する。group経路ではpreferred_store_idsと完全一致を必須化。
  IF p_private_group_id IS NOT NULL
     AND v_requested_store_count IS DISTINCT FROM cardinality(
       COALESCE(v_group.preferred_store_ids, '{}'::UUID[])
     )
  THEN
    RAISE EXCEPTION 'REQUESTED_STORES_DO_NOT_MATCH_PRIVATE_GROUP' USING ERRCODE = 'P0042';
  END IF;

  FOR v_store_id_text IN
    SELECT value->>'storeId'
    FROM jsonb_array_elements(p_candidate_datetimes->'requestedStores')
  LOOP
    BEGIN
      v_store_uuid := v_store_id_text::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END;

    IF v_store_uuid = ANY(v_seen_store_ids) THEN
      RAISE EXCEPTION 'DUPLICATE_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END IF;

    IF p_private_group_id IS NOT NULL
       AND NOT (
         v_store_uuid = ANY(COALESCE(v_group.preferred_store_ids, '{}'::UUID[]))
       )
    THEN
      RAISE EXCEPTION 'REQUESTED_STORE_NOT_IN_PRIVATE_GROUP' USING ERRCODE = 'P0042';
    END IF;

    SELECT store.name, store.short_name
    INTO v_store_name, v_store_short_name
    FROM stores store
    WHERE store.id = v_store_uuid
      AND store.organization_id = v_org_id
      AND store.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_REQUESTED_STORE' USING ERRCODE = 'P0042';
    END IF;

    v_seen_store_ids := array_append(v_seen_store_ids, v_store_uuid);
    v_trusted_requested_stores := v_trusted_requested_stores || jsonb_build_array(
      jsonb_build_object(
        'storeId', v_store_uuid::TEXT,
        'storeName', v_store_name,
        'storeShortName', COALESCE(v_store_short_name, v_store_name)
      )
    );
  END LOOP;

  -- group経路はclient値をselectorとしてのみ使い、locked DB候補から全フィールドを復元する。
  FOR v_cand IN
    SELECT value FROM jsonb_array_elements(p_candidate_datetimes->'candidates')
  LOOP
    v_candidate_order := v_candidate_order + 1;
    BEGIN
      v_cand_date  := (v_cand->>'date')::DATE;
      v_cand_start := (v_cand->>'startTime')::TIME;
      v_cand_end   := (v_cand->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END;

    IF v_cand_date IS NULL
       OR v_cand_start IS NULL
       OR v_cand_end IS NULL
       OR v_cand_start >= v_cand_end
    THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END IF;

    v_candidate_time_slot := CASE v_cand->>'timeSlot'
      WHEN 'morning' THEN 'morning'
      WHEN '朝' THEN 'morning'
      WHEN '午前' THEN 'morning'
      WHEN 'afternoon' THEN 'afternoon'
      WHEN '昼' THEN 'afternoon'
      WHEN '午後' THEN 'afternoon'
      WHEN 'evening' THEN 'evening'
      WHEN '夜' THEN 'evening'
      WHEN '夜間' THEN 'evening'
      ELSE NULL
    END;
    IF v_candidate_time_slot IS NULL THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_TIME_SLOT' USING ERRCODE = 'P0041';
    END IF;

    IF p_private_group_id IS NOT NULL THEN
      SELECT
        candidate.id,
        candidate.date,
        candidate.time_slot,
        candidate.start_time::TIME,
        candidate.end_time::TIME,
        candidate.order_num
      INTO
        v_group_candidate_id,
        v_group_candidate_date,
        v_group_candidate_time_slot,
        v_group_candidate_start,
        v_group_candidate_end,
        v_group_candidate_order
      FROM private_group_candidate_dates candidate
      WHERE candidate.group_id = p_private_group_id
        AND candidate.status IS DISTINCT FROM 'rejected'
        AND candidate.date = v_cand_date
        AND candidate.start_time::TIME = v_cand_start
        AND CASE candidate.time_slot
          WHEN 'morning' THEN 'morning'
          WHEN '朝' THEN 'morning'
          WHEN '午前' THEN 'morning'
          WHEN 'afternoon' THEN 'afternoon'
          WHEN '昼' THEN 'afternoon'
          WHEN '午後' THEN 'afternoon'
          WHEN 'evening' THEN 'evening'
          WHEN '夜' THEN 'evening'
          WHEN '夜間' THEN 'evening'
          ELSE NULL
        END = v_candidate_time_slot
      ORDER BY candidate.order_num, candidate.id
      LIMIT 1
      FOR SHARE;

      IF NOT FOUND OR v_group_candidate_id = ANY(v_seen_group_candidate_ids) THEN
        RAISE EXCEPTION 'CANDIDATE_NOT_IN_PRIVATE_GROUP' USING ERRCODE = 'P0041';
      END IF;

      v_seen_group_candidate_ids := array_append(
        v_seen_group_candidate_ids,
        v_group_candidate_id
      );
      v_cand_date := v_group_candidate_date;
      v_cand_start := v_group_candidate_start;
      v_cand_end := v_group_candidate_end;
      v_candidate_time_slot := CASE v_group_candidate_time_slot
        WHEN 'morning' THEN 'morning'
        WHEN '朝' THEN 'morning'
        WHEN '午前' THEN 'morning'
        WHEN 'afternoon' THEN 'afternoon'
        WHEN '昼' THEN 'afternoon'
        WHEN '午後' THEN 'afternoon'
        WHEN 'evening' THEN 'evening'
        WHEN '夜' THEN 'evening'
        WHEN '夜間' THEN 'evening'
        ELSE NULL
      END;
      v_candidate_order := v_group_candidate_order;
    END IF;

    v_unit_price := public.calculate_booking_participation_fee(
      v_participation_fee::INTEGER, v_participation_costs, v_cand_date, v_cand_start,
      v_custom_holidays ? v_cand_date::TEXT, v_pricing_date
    );

    v_trusted_candidates := v_trusted_candidates || jsonb_build_array(
      jsonb_build_object(
        'order', v_candidate_order,
        'date', v_cand_date::TEXT,
        'timeSlot', CASE v_candidate_time_slot
          WHEN 'morning' THEN '午前'
          WHEN 'afternoon' THEN '午後'
          ELSE '夜間'
        END,
        'startTime', to_char(v_cand_start, 'HH24:MI'),
        'endTime', to_char(v_cand_end, 'HH24:MI'),
        'status', 'pending',
        'unitPrice', v_unit_price,
        'totalPrice', v_unit_price * p_participant_count
      )
    );
  END LOOP;

  v_trusted_candidate_datetimes := jsonb_build_object(
    'candidates', v_trusted_candidates,
    'requestedStores', v_trusted_requested_stores
  );

  -- block/unblock・公演追加との競合を直列化し、同一transactionの最新状態で判定する。
  LOCK TABLE schedule_blocked_slots IN SHARE MODE;
  -- 店舗の募集停止期間の追加・削除とも直列化する（#696）。保存側は単発の書き込みなので行き詰まりは起きない。
  LOCK TABLE public.store_recruitment_pauses IN SHARE MODE;
  LOCK TABLE schedule_events IN SHARE MODE;

  -- =========================================================================
  -- サーバー側空き判定: 全候補がそれぞれ1店舗以上で受付可能であることを強制する。
  -- =========================================================================
  v_requested_store_count := jsonb_array_length(
    v_trusted_candidate_datetimes->'requestedStores'
  );
  v_candidate_count := jsonb_array_length(
    v_trusted_candidate_datetimes->'candidates'
  );

  FOR v_cand IN
    SELECT value FROM jsonb_array_elements(v_trusted_candidate_datetimes->'candidates')
  LOOP
    BEGIN
      v_cand_date  := (v_cand->>'date')::DATE;
      v_cand_start := (v_cand->>'startTime')::TIME;
      v_cand_end   := (v_cand->>'endTime')::TIME;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END;

    IF v_cand_date IS NULL
       OR v_cand_start IS NULL
       OR v_cand_end IS NULL
       OR v_cand_start >= v_cand_end
    THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_DATETIME' USING ERRCODE = 'P0041';
    END IF;

    v_candidate_time_slot := CASE v_cand->>'timeSlot'
      WHEN 'morning' THEN 'morning'
      WHEN '朝' THEN 'morning'
      WHEN '午前' THEN 'morning'
      WHEN 'afternoon' THEN 'afternoon'
      WHEN '昼' THEN 'afternoon'
      WHEN '午後' THEN 'afternoon'
      WHEN 'evening' THEN 'evening'
      WHEN '夜' THEN 'evening'
      WHEN '夜間' THEN 'evening'
      ELSE NULL
    END;
    IF v_candidate_time_slot IS NULL THEN
      RAISE EXCEPTION 'INVALID_CANDIDATE_TIME_SLOT' USING ERRCODE = 'P0041';
    END IF;

    v_store_available := false;
    v_blocked_store_count := 0;
    v_rule_store_count := 0;
    v_slot_rule := NULL;

    FOR v_store_id_text IN
      SELECT value->>'storeId'
      FROM jsonb_array_elements(v_trusted_candidate_datetimes->'requestedStores')
    LOOP
      v_store_uuid := v_store_id_text::UUID;

      -- この店舗で枠が有効か（店舗の曜日の枠 I2・作品の時間枠 I10。issue #1200）。無効なら空きを見ずに次の店へ
      -- （「枠が有効 AND 空き」を同じ店舗で確かめる。他店の条件を混ぜない）
      v_store_rule := public.private_booking_store_slot_rule(
        v_org_id, COALESCE(v_scenario_master_id, p_scenario_id), v_store_uuid, v_cand_date, v_candidate_time_slot,
        v_requested_store_count = 1);
      IF v_store_rule IS NOT NULL THEN
        v_rule_store_count := v_rule_store_count + 1;
        v_slot_rule := CASE WHEN v_slot_rule = 'closed' OR v_store_rule = 'closed' THEN 'closed' ELSE v_store_rule END;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM schedule_blocked_slots blocked
        WHERE blocked.organization_id = v_org_id
          AND blocked.store_id = v_store_uuid::TEXT
          AND blocked.date = v_cand_date
          AND blocked.time_slot = v_candidate_time_slot
      ) OR public.is_store_recruitment_paused(v_store_uuid, 'private', v_cand_date) THEN
        v_blocked_store_count := v_blocked_store_count + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM schedule_events event
        WHERE event.organization_id = v_org_id
          AND event.store_id = v_store_uuid
          AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time < v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval(mins => public.resolve_preparation_minutes(v_org_id,NULL,NULL,event.id))
          AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date + v_cand_start - make_interval(mins => public.resolve_preparation_minutes(v_org_id,v_store_uuid,COALESCE(v_scenario_master_id,p_scenario_id),NULL))
      ) THEN
        CONTINUE;
      END IF;

      v_store_available := true;
      EXIT;
    END LOOP;

    IF NOT v_store_available THEN
      -- 送る店舗のどれもこの枠を受け付けていない（I2・I10）: 申込全体を拒否する
      IF v_rule_store_count = v_requested_store_count THEN
        RAISE EXCEPTION '選択した候補日時は現在受付できません（%/% %: %）。空き状況を更新して選び直してください',
          extract(month FROM v_cand_date), extract(day FROM v_cand_date),
          CASE v_candidate_time_slot WHEN 'morning' THEN '午前' WHEN 'afternoon' THEN '午後' ELSE '夜' END,
          CASE WHEN v_slot_rule = 'slot_not_allowed' THEN 'この作品では選択できない時間帯です' ELSE '営業時間外です' END
          USING ERRCODE = '22023';
      END IF;
      IF v_blocked_store_count > 0 AND v_blocked_store_count = v_requested_store_count - v_rule_store_count THEN
        RAISE EXCEPTION 'PRIVATE_BOOKING_SLOT_BLOCKED:%:%', v_cand_date, v_candidate_time_slot
          USING ERRCODE = 'P0040';
      END IF;
      RAISE EXCEPTION 'PRIVATE_BOOKING_CANDIDATE_CONFLICT:%:%', v_cand_date, v_candidate_time_slot
        USING ERRCODE = 'P0030';
    END IF;
  END LOOP;
  -- =========================================================================

  -- 料金計算
  v_unit_price := (v_trusted_candidate_datetimes->'candidates'->0->>'unitPrice')::INTEGER;
  v_total_price := p_participant_count * v_unit_price;

  -- 最初の候補日時を取得
  v_first_candidate := v_trusted_candidate_datetimes->'candidates'->0;
  v_requested_datetime := (
    (v_first_candidate->>'date') || 'T' ||
    COALESCE(v_first_candidate->>'startTime', '10:00') ||
    '+09:00'
  )::TIMESTAMPTZ;

  IF v_scenario_master_id IS NULL THEN
    RAISE EXCEPTION 'Scenario master not resolved: %', p_scenario_id USING ERRCODE = 'P0001';
  END IF;

  -- 予約を作成
  INSERT INTO reservations (
    title,
    reservation_number,
    scenario_id,
    scenario_master_id,
    customer_id,
    requested_datetime,
    duration,
    participant_count,
    total_price, base_price, final_price, unit_price,
    status,
    customer_notes,
    organization_id,
    customer_name,
    customer_email,
    customer_phone,
    candidate_datetimes,
    priority,
    reservation_type,
    reservation_source,
    private_group_id
  ) VALUES (
    '【貸切希望】' || v_scenario_title,
    COALESCE(p_reservation_number, 'PB-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8)),
    v_scenario_master_id,
    v_scenario_master_id,
    p_customer_id,
    v_requested_datetime,
    v_duration,
    p_participant_count,
    v_total_price, v_total_price, v_total_price, v_unit_price,
    'pending',
    p_notes,
    v_org_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_trusted_candidate_datetimes,
    0,
    'private_booking',
    'web_private',
    p_private_group_id
  )
  RETURNING id INTO v_reservation_id;

  INSERT INTO public.private_booking_pricing_snapshots(
    reservation_id, organization_id, base_fee, participation_costs, custom_holidays, pricing_date
  ) VALUES (
    v_reservation_id, v_org_id, v_participation_fee::INTEGER,
    COALESCE(v_participation_costs, '[]'::JSONB), v_custom_holidays, v_pricing_date
  );

  -- private_group_id が指定されている場合、private_groups.reservation_id を更新
  IF p_private_group_id IS NOT NULL THEN
    UPDATE private_groups
    SET reservation_id = v_reservation_id,
        status = 'booking_requested',
        updated_at = NOW()
    WHERE id = p_private_group_id
      AND organization_id = v_org_id
      AND organizer_id = v_caller_user_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_UPDATE_FAILED' USING ERRCODE = 'P0043';
    END IF;
  END IF;

  -- GM確認レコードを作成（担当GMがいる場合のみ）
  -- staff_scenario_assignments から担当GMを取得
  -- ✅ v_org_id 所属のスタッフに限定（他組織GMへの pending 行生成を防ぐ）
  FOR v_gm_id IN
    SELECT ssa.staff_id
    FROM staff_scenario_assignments ssa
    JOIN staff s ON s.id = ssa.staff_id
    WHERE ssa.scenario_master_id = v_scenario_master_id
      AND ssa.organization_id = v_org_id
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
      AND s.organization_id = v_org_id
      AND s.status = 'active'
  LOOP
    INSERT INTO gm_availability_responses (
      organization_id,
      reservation_id,
      staff_id,
      response_status,
      available_candidates
    ) VALUES (
      v_org_id,
      v_reservation_id,
      v_gm_id,
      'pending',
      NULL
    )
    ON CONFLICT (reservation_id, staff_id) DO NOTHING;
  END LOOP;

  RETURN v_reservation_id;
END;
$function$;

-- 予約画面は通知付き入口へ統一。旧本体の直接呼び出しを許可しない。
REVOKE EXECUTE ON FUNCTION public.create_private_booking_request(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.private_group_set_preferred_stores(p_group_id uuid, p_store_ids uuid[], p_expected_store_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; allowed text[]; selected uuid[]; cd record; store uuid;
 slot text; v_candidate_start_at timestamp; v_candidate_end_at timestamp; available boolean; removed integer:=0; res_status text;
BEGIN
 IF public.private_group_actor_role(p_group_id) IS NULL THEN RAISE EXCEPTION '希望店舗を変更する権限がありません' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.private_groups WHERE id=p_group_id FOR UPDATE;
 IF g.status NOT IN ('gathering','date_adjusting') THEN RAISE EXCEPTION '店舗の返答待ち、確定後、取消後は希望店舗を変更できません' USING ERRCODE='22023'; END IF;
 IF g.reservation_id IS NOT NULL THEN
  SELECT status INTO res_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE;
  IF res_status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION '予約申請中は希望店舗を変更できません' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_expected_store_ids IS NULL OR coalesce(g.preferred_store_ids,'{}'::uuid[]) IS DISTINCT FROM p_expected_store_ids THEN
  RAISE EXCEPTION '希望店舗が変更されています。画面を更新して選び直してください' USING ERRCODE='40001';
 END IF;
 IF coalesce(cardinality(p_store_ids),0)=0 OR array_position(p_store_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION '店舗を1つ以上選択してください' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT s ORDER BY s) INTO selected FROM unnest(p_store_ids) s;
 SELECT s.available_stores INTO allowed FROM public.organization_scenarios s WHERE s.organization_id=g.organization_id
  AND (s.scenario_master_id=g.scenario_master_id OR s.id=g.scenario_master_id)
  ORDER BY (s.id=g.scenario_master_id) DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '組織内の作品設定を確認できません' USING ERRCODE='22023'; END IF;
 FOREACH store IN ARRAY selected LOOP
  PERFORM 1 FROM public.stores s WHERE s.id=store AND s.organization_id=g.organization_id AND s.status='active'
   AND s.ownership_type IS DISTINCT FROM 'office'
   AND (CASE WHEN coalesce(cardinality(allowed),0)>0 THEN store::text=ANY(allowed) ELSE NOT coalesce(s.is_temporary,false) END) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION '選択できない店舗が含まれています。店舗一覧を再読み込みしてください' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR cd IN SELECT * FROM public.private_group_candidate_dates WHERE group_id=g.id AND status IS DISTINCT FROM 'rejected' ORDER BY id FOR UPDATE LOOP
  slot:=CASE cd.time_slot WHEN 'morning' THEN 'morning' WHEN '朝' THEN 'morning' WHEN '午前' THEN 'morning' WHEN 'afternoon' THEN 'afternoon' WHEN '昼' THEN 'afternoon' WHEN '午後' THEN 'afternoon' WHEN 'evening' THEN 'evening' WHEN '夜' THEN 'evening' WHEN '夜間' THEN 'evening' END;
  IF slot IS NULL OR cd.start_time IS NULL OR cd.end_time IS NULL THEN RAISE EXCEPTION '候補日時を確認できません' USING ERRCODE='22023'; END IF;
  v_candidate_start_at:=cd.date+cd.start_time::time;
  v_candidate_end_at:=cd.date+cd.end_time::time+CASE WHEN cd.end_time::time<cd.start_time::time THEN interval '1 day' ELSE interval '0 days' END;
  IF v_candidate_start_at=v_candidate_end_at THEN RAISE EXCEPTION '候補日時を確認できません' USING ERRCODE='22023'; END IF;
  -- 全店舗を1つのSELECTの同じスナップショットで確認する。
  -- 店舗間の公演移動の前後を混ぜて「全店満席」と誤認しない。
  SELECT EXISTS(
   SELECT 1 FROM unnest(selected) AS choice(store_id)
   -- 同じ店舗で「枠が有効（I2・I10）AND 空き」が成り立つこと（issue #1200。他店の条件を混ぜない）
   WHERE public.private_booking_store_slot_rule(g.organization_id,g.scenario_master_id,choice.store_id,cd.date,slot,cardinality(selected)=1) IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.schedule_blocked_slots b WHERE b.organization_id=g.organization_id AND b.store_id=choice.store_id::text AND b.date=cd.date AND b.time_slot=slot)
   AND NOT EXISTS(SELECT 1 FROM public.schedule_events e WHERE e.organization_id=g.organization_id AND e.store_id=choice.store_id AND e.is_cancelled=false
    AND e.date BETWEEN cd.date-2 AND cd.date+2
    AND e.date+e.start_time < v_candidate_end_at+make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,NULL,NULL,e.id))
    AND e.date+e.end_time+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END > v_candidate_start_at-make_interval(mins=>public.resolve_preparation_minutes(g.organization_id,choice.store_id,g.scenario_master_id,NULL)))
  ) INTO available;
  IF NOT available THEN
   DELETE FROM public.private_group_candidate_dates WHERE id=cd.id AND group_id=g.id;
   removed:=removed+1;
  END IF;
 END LOOP;
 UPDATE public.private_groups SET preferred_store_ids=selected,updated_at=now() WHERE id=g.id;
 RETURN removed;
END $function$
;

REVOKE ALL ON FUNCTION public.private_group_set_preferred_stores(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_set_preferred_stores(uuid,uuid[],uuid[]) TO authenticated,service_role;
