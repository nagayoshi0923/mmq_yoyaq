-- rollback: 公演前アンケートの画面の状態の記録を取り除く（画面側の記録の送信は失敗しても黙って続く作り）
DROP FUNCTION IF EXISTS public.record_private_group_survey_event(uuid,uuid,text,text,jsonb);
DROP TABLE IF EXISTS public.private_group_survey_client_events;
