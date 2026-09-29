CREATE OR REPLACE FUNCTION public.approve_private_booking_with_notifications(
 p_request_id uuid,p_reservation_id uuid,p_selected_date date,p_selected_start_time time,p_selected_end_time time,
 p_selected_store_id uuid,p_selected_gm_id uuid,p_candidate_datetimes jsonb,p_scenario_title text,
 p_customer_name text,p_selected_sub_gm_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE approval_result jsonb;
BEGIN
 approval_result:=public.approve_private_booking_with_delivery(p_request_id,p_reservation_id,p_selected_date,p_selected_start_time,
  p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 -- 旧版の通信再試行を、新しい通知要求と誤認しない。
 IF approval_result->>'replayed'='true' THEN RETURN approval_result; END IF;
 PERFORM public.enqueue_private_approval_deliveries(p_request_id);
 approval_result:=approval_result||jsonb_build_object('approval_delivery_queued',true);
 UPDATE public.private_booking_approval_requests AS receipt SET result=approval_result WHERE receipt.id=p_request_id;
 RETURN approval_result;
END $$;
REVOKE ALL ON FUNCTION public.approve_private_booking_with_notifications(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_private_booking_with_notifications(uuid,uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO authenticated,service_role;
