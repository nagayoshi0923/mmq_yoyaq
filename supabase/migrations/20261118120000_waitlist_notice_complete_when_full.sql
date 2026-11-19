-- キャンセル待ちの案内: 空席が出たあと満席に戻った知らせが、公演終了まで「送信待ち」のまま残る件を直す（#1309）。
-- 2026-11-18 本番で、11/15 に作られた知らせ1件が満席（6/6）・キャンセル待ち0人のまま5分ごとに試され続け、
-- 4時間ごとの送信点検に出続けていた。claim_waitlist_notice は空席0のとき何もせず NULL を返していたため。
-- 変更は「空席0なら、送信中・結果不明の配送が無い限りその知らせを完了にする」の1か所だけ。
-- 元は本番・検証環境の実物（md5(prosrc)=1f25becafef351efb33d9f6f0e4694d6、20261007110001 の版と同じ）。権限は CREATE OR REPLACE で引き継ぐ。
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_waitlist_notice(p_event uuid,p_actor uuid,p_system boolean,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.schedule_events; n public.waitlist_notice_events; seats integer; entries jsonb;
BEGIN
 SELECT * INTO e FROM public.schedule_events WHERE id=p_event FOR UPDATE;
 IF e.id IS NULL THEN RETURN NULL; END IF;
 IF NOT p_system AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_events w WHERE w.schedule_event_id=e.id
  AND w.actor_user_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor AND organization_id=e.organization_id AND status='active') THEN
  RAISE EXCEPTION '保存済みの空席発生操作が必要です' USING ERRCODE='42501';
 END IF;
 IF coalesce(e.is_cancelled,false) OR ((e.date+coalesce(e.end_time,e.start_time)+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END) AT TIME ZONE 'Asia/Tokyo')<=now() THEN
  UPDATE public.waitlist_notice_events SET completed_at=now() WHERE schedule_event_id=e.id AND completed_at IS NULL;
  RETURN NULL;
 END IF;
 SELECT * INTO n FROM public.waitlist_notice_events WHERE schedule_event_id=e.id AND completed_at IS NULL AND (NOT requires_review OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries d JOIN public.waitlist w ON w.id=d.waitlist_id
 WHERE d.notice_id=waitlist_notice_events.id AND d.sent_at IS NULL AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())
 AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours')
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,d.waitlist_id) AND NOT (other.notice_id=d.notice_id AND other.waitlist_id=d.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours'))))
 AND (p_system OR actor_user_id=p_actor OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_actor AND organization_id=e.organization_id AND status='active'))
 ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF n.id IS NULL THEN RETURN NULL; END IF;
 UPDATE public.waitlist_notice_events SET last_attempt_at=now() WHERE id=n.id;
 SELECT coalesce(e.max_participants,e.capacity,8)-coalesce(sum(participant_count),0) INTO seats FROM public.reservations
 WHERE schedule_event_id=e.id AND status IN ('pending','confirmed','gm_confirmed','checked_in');
 IF seats<=0 THEN
  -- 満席に戻った: この空席の知らせは役目を終えた。送信中・結果不明のものが無ければ終わりにする（2026-11-18、#1309）。
  -- 終わりにしないと公演が終わるまで5分ごとに試し続け、点検に「送信待ち」として出続ける。再び空けば取消時に新しい知らせが作られる。
  UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=n.id
   AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries d WHERE d.notice_id=n.id AND d.sent_at IS NULL
    AND (d.attempt_in_progress OR d.has_uncertain_attempt OR d.leased_until>now()));
  RETURN NULL;
 END IF;
 INSERT INTO public.waitlist_notice_deliveries(notice_id,waitlist_id)
 SELECT n.id,w.id FROM public.waitlist w WHERE w.schedule_event_id=e.id AND w.organization_id=e.organization_id AND w.status='waiting'
 AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats AND (w.expires_at IS NULL OR w.expires_at>now()) ON CONFLICT DO NOTHING;
 -- プロセス停止/ack消失で期限切れになった前試行は結果不明として保持する。
 UPDATE public.waitlist_notice_deliveries SET has_uncertain_attempt=true
 WHERE notice_id=n.id AND sent_at IS NULL AND attempt_in_progress AND leased_until<now();
 UPDATE public.waitlist_notice_deliveries d SET lease_id=p_lease,leased_until=now()+interval '5 minutes',last_error=NULL,
 claimed_waitlist_ids=CASE WHEN d.payload IS NULL THEN ARRAY(SELECT recipient.id FROM public.waitlist recipient
 WHERE public.waitlist_notice_same_recipient(recipient.id,d.waitlist_id) AND recipient.status='waiting' AND (recipient.expires_at IS NULL OR recipient.expires_at>now())) ELSE coalesce(d.claimed_waitlist_ids,'{}'::uuid[]) END
 WHERE d.notice_id=n.id AND d.sent_at IS NULL AND (d.first_attempt_at IS NULL OR d.first_attempt_at>now()-interval '23 hours') AND (d.leased_until IS NULL OR d.leased_until<now())
 AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=d.waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now()) AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats
 AND NOT EXISTS(SELECT 1 FROM public.waitlist earlier WHERE earlier.status='waiting' AND (earlier.expires_at IS NULL OR earlier.expires_at>now())
 AND (SELECT latest.participant_count FROM public.waitlist latest WHERE public.waitlist_notice_same_recipient(latest.id,earlier.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now()) ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1)<=seats AND public.waitlist_notice_same_recipient(earlier.id,w.id)
 AND (coalesce(earlier.created_at,'-infinity'::timestamptz),earlier.id)<(coalesce(w.created_at,'-infinity'::timestamptz),w.id)))
 AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,d.waitlist_id)
 AND NOT (other.notice_id=d.notice_id AND other.waitlist_id=d.waitlist_id) AND other.sent_at IS NULL AND (other.leased_until>now() OR (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours')));
 UPDATE public.waitlist_notice_events SET requires_review=true WHERE id=n.id AND EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())) AND (first_attempt_at<=now()-interval '23 hours' OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,waitlist_notice_deliveries.waitlist_id) AND NOT (other.notice_id=waitlist_notice_deliveries.notice_id AND other.waitlist_id=waitlist_notice_deliveries.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours'))));
 SELECT jsonb_agg(jsonb_build_object('id',w.id,'customer_name',contact.customer_name,'customer_email',btrim(contact.customer_email),
 'participant_count',contact.participant_count,'deliveryKey','waitlist-'||n.id::text||'-'||w.id::text) ORDER BY w.created_at)
 INTO entries FROM public.waitlist_notice_deliveries d JOIN public.waitlist w ON w.id=d.waitlist_id
 CROSS JOIN LATERAL (SELECT latest.customer_name,latest.customer_email,latest.participant_count FROM public.waitlist latest
 WHERE latest.id=ANY(d.claimed_waitlist_ids) AND public.waitlist_notice_same_recipient(latest.id,w.id) AND latest.status='waiting' AND (latest.expires_at IS NULL OR latest.expires_at>now())
 ORDER BY coalesce(latest.created_at,'-infinity'::timestamptz) DESC,latest.id DESC LIMIT 1) contact
 WHERE d.notice_id=n.id AND d.lease_id=p_lease AND d.sent_at IS NULL;
 IF entries IS NULL AND NOT EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())))
 THEN UPDATE public.waitlist_notice_events SET completed_at=now() WHERE id=n.id; END IF;
 RETURN jsonb_build_object('noticeId',n.id,'organizationId',e.organization_id,'metadata',n.metadata||jsonb_build_object('freedSeats',n.freed_seats),'entries',coalesce(entries,'[]'::jsonb),'pending',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now()))),'manualReview',EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries WHERE notice_id=n.id AND sent_at IS NULL AND EXISTS(SELECT 1 FROM public.waitlist w WHERE w.id=waitlist_id AND w.status='waiting' AND (w.expires_at IS NULL OR w.expires_at>now())) AND (first_attempt_at<=now()-interval '23 hours' OR EXISTS(SELECT 1 FROM public.waitlist_notice_deliveries other WHERE public.waitlist_notice_same_recipient(other.waitlist_id,waitlist_notice_deliveries.waitlist_id) AND NOT (other.notice_id=waitlist_notice_deliveries.notice_id AND other.waitlist_id=waitlist_notice_deliveries.waitlist_id) AND other.sent_at IS NULL AND (other.has_uncertain_attempt OR (other.attempt_in_progress AND other.leased_until<now()) OR other.first_attempt_at<=now()-interval '23 hours')))));
END $$;
COMMIT;
