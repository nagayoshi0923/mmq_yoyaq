-- 新しい画面はこの入口で予約・グループ・申込通知を同じTXに保存する。
-- 配信中の旧画面との互換性のため、従来RPCの権限はこの段階では変更しない。
CREATE OR REPLACE FUNCTION public.create_private_booking_request_with_notice(
 p_scenario_id uuid,p_customer_id uuid,p_customer_name text,p_customer_email text,p_customer_phone text,
 p_participant_count integer,p_candidate_datetimes jsonb,p_notes text DEFAULT NULL,
 p_reservation_number text DEFAULT NULL,p_private_group_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reservation uuid; saved public.reservations%ROWTYPE; member uuid; title text; body text; g public.private_groups%ROWTYPE; linked_status text;
BEGIN
 IF p_private_group_id IS NOT NULL THEN
  SELECT * INTO g FROM public.private_groups WHERE id=p_private_group_id FOR UPDATE;
  IF NOT FOUND OR g.organizer_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'このグループの予約を申し込む権限がありません' USING ERRCODE='42501';
  END IF;
  IF g.status IS NULL OR g.status NOT IN ('gathering','date_adjusting') THEN
   RAISE EXCEPTION '既に申込済み、確定済み、または取消済みです。画面を更新してください' USING ERRCODE='22023';
  END IF;
  IF g.reservation_id IS NOT NULL THEN
   SELECT status INTO linked_status FROM public.reservations WHERE id=g.reservation_id AND organization_id=g.organization_id FOR SHARE;
   IF linked_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION '処理中の予約があるため再申込できません。画面を更新してください' USING ERRCODE='22023';
   END IF;
  END IF;
 END IF;
 reservation:=public.create_private_booking_request(p_scenario_id,p_customer_id,p_customer_name,p_customer_email,p_customer_phone,
  p_participant_count,p_candidate_datetimes,p_notes,p_reservation_number,p_private_group_id);
 IF p_private_group_id IS NOT NULL THEN
  SELECT * INTO STRICT saved FROM public.reservations WHERE id=reservation AND private_group_id=p_private_group_id;
  SELECT m.id INTO member FROM public.private_group_members m
   WHERE m.group_id=p_private_group_id AND m.user_id=auth.uid() AND m.is_organizer=true
   ORDER BY m.created_at,m.id LIMIT 1;
  SELECT s.system_msg_booking_requested_title,s.system_msg_booking_requested_body INTO title,body
   FROM public.global_settings s WHERE s.organization_id=saved.organization_id;
  INSERT INTO public.private_group_messages(group_id,member_id,message) VALUES(p_private_group_id,member,
   jsonb_build_object('type','system','action','booking_requested','reservationId',reservation,
    'candidateCount',jsonb_array_length(saved.candidate_datetimes->'candidates'),
    'title',coalesce(nullif(title,''),'貸切リクエストを送信しました'),
    'body',coalesce(nullif(body,''),'店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。'))::text);
 END IF;
 RETURN reservation;
END $$;
REVOKE ALL ON FUNCTION public.create_private_booking_request_with_notice(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_private_booking_request_with_notice(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid) TO authenticated,service_role;
