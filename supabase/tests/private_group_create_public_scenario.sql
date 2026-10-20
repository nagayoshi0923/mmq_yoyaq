-- 監査 C3（2026-10-20）: 公開停止（org_status が available 以外）・出張限定の作品では貸切グループを作れない。
-- 公開中の作品は従来どおり作れる。既存のグループには影響しない。手元の試験データ（supabase/seed.sql）を使い、最後に戻す。
-- 実行: npm run test:rpcs（または psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/private_group_create_public_scenario.sql）
BEGIN;
\ir fixtures/private_test_group.sql
DO $$
DECLARE
 org uuid:='00000000-0000-4000-a000-000000000001';
 sm uuid:='00000000-0000-4000-a000-000000000202';
 st2 uuid:='00000000-0000-4000-a000-000000000102';
 organizer uuid:='00000000-0000-4000-b000-000000000011';
 existing integer; v_status text; msg text; g jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',organizer,'role','authenticated')::text,true);
 SELECT count(*) INTO existing FROM private_groups WHERE organization_id=org AND scenario_master_id=sm;

 -- 1) 公開停止・近日公開・出張限定は、理由「この作品はいま貸切を受け付けていません」で弾く
 FOREACH v_status IN ARRAY ARRAY['unavailable','coming_soon','offsite_only'] LOOP
  IF v_status='offsite_only' THEN
   UPDATE organization_scenarios SET org_status='available',scenario_kind='offsite_only' WHERE organization_id=org AND scenario_master_id=sm;
  ELSE
   UPDATE organization_scenarios SET org_status=v_status,scenario_kind='regular' WHERE organization_id=org AND scenario_master_id=sm;
  END IF;
  BEGIN
   PERFORM create_private_group_atomic(org,sm,'公開停止の確認',ARRAY[st2],'[]'::jsonb,NULL);
   RAISE EXCEPTION '%: 受け付けない作品でグループを作れた', v_status;
  EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
   ASSERT msg='この作品はいま貸切を受け付けていません', format('%s: %s', v_status, msg);
  END;
 END LOOP;

 -- 2) 既存のグループは消えも変わりもしない（作成時の検査だけ）
 ASSERT (SELECT count(*) FROM private_groups WHERE organization_id=org AND scenario_master_id=sm)=existing, '既存のグループの件数が変わった';
 ASSERT EXISTS(SELECT 1 FROM private_groups WHERE id='0160f91a-f84c-43fd-8e46-dda15d1005d7' AND status='gathering'), '既存のグループが変わった';

 -- 3) 公開中に戻せば従来どおり作れる
 UPDATE organization_scenarios SET org_status='available',scenario_kind='regular' WHERE organization_id=org AND scenario_master_id=sm;
 g:=create_private_group_atomic(org,sm,'公開中の確認',ARRAY[st2],'[]'::jsonb,NULL);
 ASSERT g->>'id' IS NOT NULL, '公開中の作品でグループを作れない';
END $$;
ROLLBACK;
