-- Staging only; applied migrations required. All fixtures are rolled back; no committed notifications.
BEGIN;
DO $test$
DECLARE o uuid; sm uuid; sid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); v integer; marker uuid; gm uuid; caller uuid;
BEGIN
 SELECT v.organization_id,v.scenario_master_id INTO o,sm FROM organization_scenarios_with_master v JOIN organizations org ON org.id=v.organization_id WHERE org.is_active AND v.accepts_private_booking ORDER BY v.id LIMIT 1;
 SELECT st.id,st.user_id INTO gm,caller FROM staff st JOIN public.users u ON u.id=st.user_id WHERE st.organization_id=o AND st.status='active' AND u.role='admin' LIMIT 1;
 ASSERT caller IS NOT NULL;
 PERFORM set_config('request.jwt.claim.sub',caller::text,true);
 INSERT INTO stores(id,organization_id,name,short_name) VALUES(sid,o,'QW policy fixture','fixture');
 INSERT INTO operating_setting_overrides(organization_id,store_id,settings)
 VALUES(o,sid,'{"private_reservation_change_deadline_hours":48}');
 INSERT INTO reservations(id,organization_id,title,requested_datetime,duration,participant_count,status,reservation_source,reservation_type,scenario_id,scenario_master_id,candidate_datetimes)
 VALUES(rid,o,'QW policy fixture',now()+interval '90 days',180,6,'pending','web_private','private_booking',sm,sm,jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object('date',current_date+90,'timeSlot','afternoon','startTime','14:00','endTime','17:00')),'requestedStores',jsonb_build_array(jsonb_build_object('storeId',sid))));
 ASSERT (SELECT cancellation_policy_snapshot_version FROM reservations WHERE id=rid)=1;
 eid:=public.approve_private_booking(rid,current_date+90,'14:00','17:00',sid,gm,'{}'::jsonb,'QW policy fixture','Fixture');
 ASSERT (SELECT scenario_master_id FROM schedule_events WHERE id=eid)=sm;
 ASSERT (SELECT organization_scenario_id FROM schedule_events WHERE id=eid) IS NOT NULL;
 SELECT reservation_change_deadline_hours_snapshot,cancellation_policy_store_id INTO v,marker FROM reservations WHERE id=rid;
 ASSERT v=48; ASSERT marker=sid;
 UPDATE operating_setting_overrides SET settings='{"private_reservation_change_deadline_hours":0}' WHERE organization_id=o AND store_id=sid;
 UPDATE reservations SET customer_notes='fixture: unrelated update',reservation_change_deadline_hours_snapshot=999 WHERE id=rid;
 ASSERT (SELECT reservation_change_deadline_hours_snapshot FROM reservations WHERE id=rid)=48;
 UPDATE reservations SET store_id=NULL,schedule_event_id=NULL WHERE id=rid;
 UPDATE reservations SET store_id=sid,schedule_event_id=eid WHERE id=rid;
 ASSERT (SELECT reservation_change_deadline_hours_snapshot FROM reservations WHERE id=rid)=48;
 RAISE NOTICE 'PASS actual stage: actual approval uses store48, cancellation marker retained, setting update/tampering/unlink-relink keep48';
END $test$;

ROLLBACK;
