-- QW-20260917-001: candidate and response baselines are checked under the reservation lock.
-- Service only: the API / signed Discord handler authorizes the actor before calling.
CREATE FUNCTION public.save_gm_response_atomic(p_org uuid,p_reservation uuid,p_staff uuid,p_candidates jsonb,p_expected_response jsonb,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE booking public.reservations; previous public.gm_availability_responses; saved public.gm_availability_responses; gm public.staff; indices jsonb; response_state text;
BEGIN
 SELECT * INTO booking FROM reservations WHERE id=p_reservation AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reservation unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO gm FROM staff WHERE id=p_staff AND organization_id=p_org AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff unavailable' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' OR coalesce(booking.candidate_datetimes->'candidates','[]') IS DISTINCT FROM p_candidates THEN
   RAISE EXCEPTION 'Candidates changed' USING ERRCODE='40001';
 END IF;
 SELECT * INTO previous FROM gm_availability_responses WHERE reservation_id=p_reservation AND staff_id=p_staff FOR UPDATE;
 IF (previous.id IS NULL AND p_expected_response IS NOT NULL AND p_expected_response <> 'null') OR
    (previous.id IS NOT NULL AND (p_expected_response IS NULL OR p_expected_response='null' OR
      previous.id::text IS DISTINCT FROM p_expected_response->>'id' OR
      previous.updated_at IS DISTINCT FROM (p_expected_response->>'updated_at')::timestamptz)) THEN
   RAISE EXCEPTION 'Response changed' USING ERRCODE='40001';
 END IF;
 IF previous.id IS NOT NULL AND previous.organization_id IS DISTINCT FROM p_org THEN
   RAISE EXCEPTION 'Response organization mismatch' USING ERRCODE='42501';
 END IF;
 indices:=p_patch->'available_candidates'; response_state:=p_patch->>'response_status';
 IF jsonb_typeof(indices) IS DISTINCT FROM 'array' OR response_state IS NULL OR response_state NOT IN ('pending','available','all_unavailable') THEN
   RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(indices) i WHERE jsonb_typeof(i)<>'number' OR i::text !~ '^[0-9]+$') THEN
   RAISE EXCEPTION 'Invalid candidate index' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(indices) i WHERE (i::text)::numeric >= jsonb_array_length(p_candidates)) OR
    (SELECT count(*) FROM jsonb_array_elements(indices)) <> (SELECT count(DISTINCT i) FROM jsonb_array_elements(indices) i) OR
    ((response_state='available') <> (jsonb_array_length(indices)>0)) THEN
   RAISE EXCEPTION 'Invalid candidate selection' USING ERRCODE='22023';
 END IF;
 INSERT INTO gm_availability_responses(organization_id,reservation_id,staff_id,gm_name,gm_discord_id,response_status,
   available_candidates,selected_candidate_index,response_type,notes,response_history,responded_at,response_datetime,updated_at)
 VALUES(p_org,p_reservation,p_staff,gm.name,gm.discord_user_id,response_state,indices,
   CASE WHEN jsonb_array_length(indices)>0 THEN (indices->>0)::integer ELSE NULL END,
   CASE WHEN response_state='available' THEN 'available' WHEN response_state='pending' THEN NULL ELSE 'unavailable' END,
   p_patch->>'notes',coalesce(p_patch->'response_history',previous.response_history,'[]'),clock_timestamp(),clock_timestamp(),clock_timestamp())
 ON CONFLICT(reservation_id,staff_id) DO UPDATE SET
   gm_name=excluded.gm_name,gm_discord_id=excluded.gm_discord_id,response_status=excluded.response_status,
   available_candidates=excluded.available_candidates,selected_candidate_index=excluded.selected_candidate_index,
   response_type=excluded.response_type,notes=excluded.notes,response_history=excluded.response_history,
   responded_at=excluded.responded_at,response_datetime=excluded.response_datetime,updated_at=excluded.updated_at
 RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_gm_response_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_gm_response_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb) TO service_role;
