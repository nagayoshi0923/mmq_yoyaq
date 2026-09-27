-- 候補追加の通信再試行を識別する内部記録。候補・通知と同じトランザクションで作成する。
CREATE TABLE IF NOT EXISTS public.private_group_candidate_add_requests (
 request_id uuid PRIMARY KEY,
 group_id uuid NOT NULL REFERENCES public.private_groups(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 payload jsonb NOT NULL,
 candidate_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_group_candidate_add_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_group_candidate_add_requests FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS private_group_candidate_add_requests_group_idx ON public.private_group_candidate_add_requests(group_id);
