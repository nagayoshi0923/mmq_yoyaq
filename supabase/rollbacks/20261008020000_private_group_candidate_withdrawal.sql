DROP TRIGGER IF EXISTS guard_withdrawn_private_group_response ON public.private_group_date_responses;
DROP FUNCTION IF EXISTS public.guard_withdrawn_private_group_response();
DROP FUNCTION IF EXISTS public.private_group_withdraw_candidate(uuid,uuid);
-- 取り下げ済みのstatus=rejectedと回答は残る。先にフロントを旧版へ戻す。
ALTER TABLE public.private_group_candidate_dates DROP COLUMN IF EXISTS withdrawn_at;
