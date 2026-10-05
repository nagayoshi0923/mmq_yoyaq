-- 貸切グループの公演前アンケートで、参加者の画面の状態を記録する（2026-10-05、ゲストが回答できない報告 2 件の原因を特定するため）。
-- 手元・本番データ・Safari 系でも再現できなかったため、次に起きたときに画面で何が起きたかを自前の DB に残す。
-- 記録するのは画面の状態（読み込み結果・表示した質問の数・枠の大きさ・ブラウザの種類・誤りの文）だけで、回答の中身は残さない。
-- 書き込みは本人（ログイン中の参加者、または有効なゲストの印を持つゲスト）だけ。読み取りは DB の管理者のみ（画面からは読めない）。
CREATE TABLE public.private_group_survey_client_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('open','loaded','load_error','layout','submit','submitted','submit_error','js_error')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX private_group_survey_client_events_member_idx ON public.private_group_survey_client_events(member_id, created_at);
CREATE INDEX private_group_survey_client_events_created_idx ON public.private_group_survey_client_events(created_at);
ALTER TABLE public.private_group_survey_client_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_survey_client_events FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.private_group_survey_client_events IS '公演前アンケートを開いた参加者の画面の状態（不具合の特定用、60日で消す）。回答の中身は入れない';

CREATE FUNCTION public.record_private_group_survey_event(p_group_id uuid, p_member_id uuid, p_guest_token text, p_event text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.require_private_group_member(p_group_id, p_member_id, p_guest_token);
 IF p_event IS NULL OR p_event NOT IN ('open','loaded','load_error','layout','submit','submitted','submit_error','js_error') THEN
  RAISE EXCEPTION '記録の種類が正しくありません' USING ERRCODE='22023';
 END IF;
 IF p_detail IS NULL OR jsonb_typeof(p_detail)<>'object' OR octet_length(p_detail::text)>4000 THEN
  RAISE EXCEPTION '記録の内容が正しくありません' USING ERRCODE='22023';
 END IF;
 -- 1 人 1 日 300 件まで。超えた分は黙って捨てる（画面の動きは止めない）。
 IF (SELECT count(*) FROM public.private_group_survey_client_events WHERE member_id=p_member_id AND created_at>clock_timestamp()-interval '1 day')>=300 THEN
  RETURN;
 END IF;
 INSERT INTO public.private_group_survey_client_events(group_id, member_id, event, detail) VALUES (p_group_id, p_member_id, p_event, p_detail);
 DELETE FROM public.private_group_survey_client_events WHERE created_at<clock_timestamp()-interval '60 days';
END $$;
REVOKE ALL ON FUNCTION public.record_private_group_survey_event(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_private_group_survey_event(uuid,uuid,text,text,jsonb) TO anon, authenticated, service_role;
