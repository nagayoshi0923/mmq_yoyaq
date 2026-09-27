
CREATE OR REPLACE FUNCTION public.cancel_reservation_and_group_with_notice(
 p_reservation_id uuid,p_customer_id uuid,p_cancellation_reason text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE r record; title text; body text;
BEGIN
 PERFORM public.cancel_reservation_and_group_with_lock(p_reservation_id,p_customer_id,p_cancellation_reason);
 SELECT * INTO STRICT r FROM reservations WHERE id=p_reservation_id;
 IF r.private_group_id IS NOT NULL THEN
   SELECT system_msg_booking_cancelled_title,system_msg_booking_cancelled_body INTO title,body
   FROM global_settings WHERE organization_id=r.organization_id;
   INSERT INTO private_group_messages(group_id,sender_type,message) VALUES(r.private_group_id,'system',
     jsonb_build_object('type','system','action','booking_cancelled','reservationId',r.id,
       'title',coalesce(nullif(title,''),'ご予約がキャンセルされました'),
       'body',coalesce(nullif(body,''),nullif(p_cancellation_reason,''),'誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。'))::text);
 END IF;
 RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.cancel_reservation_and_group_with_notice(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_notice(uuid,uuid,text) TO authenticated,service_role;
