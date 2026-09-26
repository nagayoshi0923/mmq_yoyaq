-- 保持する準備時間は日付境界でも有効。最大24時間と日跨ぎ公演を含め前後2日を検査。
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_private_booking';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$,'')))/length($old$AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$AND date = v_calendar_date
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$old$,$new$AND date BETWEEN v_calendar_date - 2 AND v_calendar_date + 2
    AND store_id = p_selected_store_id
    AND is_cancelled = false
    AND date + start_time$new$);
 IF (length(definition)-length(replace(definition,$old$v_calendar_date + p_selected_end_time + make_interval$old$,'')))/length($old$v_calendar_date + p_selected_end_time + make_interval$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$v_calendar_date + p_selected_end_time + make_interval$old$,$new$v_calendar_date + p_selected_end_time + CASE WHEN p_selected_end_time < p_selected_start_time THEN interval '1 day' ELSE interval '0 days' END + make_interval$new$);
 IF (length(definition)-length(replace(definition,$old$AND date + end_time > v_calendar_date$old$,'')))/length($old$AND date + end_time > v_calendar_date$old$)<>1 THEN RAISE EXCEPTION 'Unexpected approve_private_booking cross-day guard'; END IF;
 definition:=replace(definition,$old$AND date + end_time > v_calendar_date$old$,$new$AND date + end_time + CASE WHEN end_time < start_time THEN interval '1 day' ELSE interval '0 days' END > v_calendar_date$new$);
 EXECUTE definition;
END $migration$;
DO $migration$
DECLARE definition text; function_oid oid;
BEGIN
 SELECT p.oid INTO STRICT function_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_private_booking_request';
 definition:=pg_get_functiondef(function_oid);
 IF (length(definition)-length(replace(definition,$old$AND event.date = v_cand_date
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$,'')))/length($old$AND event.date = v_cand_date
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$AND event.date = v_cand_date
          AND event.is_cancelled = false
          AND event.date + event.start_time$old$,$new$AND event.date BETWEEN v_cand_date - 2 AND v_cand_date + 2
          AND event.is_cancelled = false
          AND event.date + event.start_time$new$);
 IF (length(definition)-length(replace(definition,$old$v_cand_date + v_cand_end + make_interval$old$,'')))/length($old$v_cand_date + v_cand_end + make_interval$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$v_cand_date + v_cand_end + make_interval$old$,$new$v_cand_date + v_cand_end + CASE WHEN v_cand_end < v_cand_start THEN interval '1 day' ELSE interval '0 days' END + make_interval$new$);
 IF (length(definition)-length(replace(definition,$old$AND event.date + event.end_time > v_cand_date$old$,'')))/length($old$AND event.date + event.end_time > v_cand_date$old$)<>1 THEN RAISE EXCEPTION 'Unexpected create_private_booking_request cross-day guard'; END IF;
 definition:=replace(definition,$old$AND event.date + event.end_time > v_cand_date$old$,$new$AND event.date + event.end_time + CASE WHEN event.end_time < event.start_time THEN interval '1 day' ELSE interval '0 days' END > v_cand_date$new$);
 EXECUTE definition;
END $migration$;
