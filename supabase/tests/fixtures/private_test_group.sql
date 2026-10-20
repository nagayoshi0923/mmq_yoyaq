-- 貸切の DB テスト（private_candidate_slot_availability.sql / private_booking_rules_examples.sql）が使う
-- 試験用の主催者とグループ。seed.sql だけの新しい DB でも通るよう、無ければここで作る（あれば触らない）。
-- 呼び出し側のトランザクションの中で \ir して使い、最後の ROLLBACK で消える。手元の DB 専用（staging・本番では流さない）。
-- 主催者: 00000000-0000-4000-b000-000000000011（seed の customer1 と同じ ID）
-- グループ: 0160f91a-f84c-43fd-8e46-dda15d1005d7（seed の組織 ...a000-000000000001・作品 ...a000-000000000202）
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
VALUES('00000000-0000-0000-0000-000000000000','00000000-0000-4000-b000-000000000011','authenticated','authenticated',
  'private-test-organizer@mmq.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')
ON CONFLICT DO NOTHING;
INSERT INTO public.private_groups(id,organization_id,scenario_master_id,organizer_id,name,invite_code,status,preferred_store_ids)
VALUES('0160f91a-f84c-43fd-8e46-dda15d1005d7','00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000202',
  '00000000-0000-4000-b000-000000000011','試験 空き判定用','private-test-group-0160f91a','gathering',ARRAY['00000000-0000-4000-a000-000000000102']::uuid[])
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.private_group_members(group_id,user_id,guest_name,is_organizer,status,joined_at)
SELECT g.id,g.organizer_id,'試験 主催者',true,'joined',now() FROM public.private_groups g
WHERE g.id='0160f91a-f84c-43fd-8e46-dda15d1005d7'
  AND NOT EXISTS(SELECT 1 FROM public.private_group_members m WHERE m.group_id=g.id AND m.user_id=g.organizer_id AND m.status='joined');
