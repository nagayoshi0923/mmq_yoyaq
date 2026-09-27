-- 通信再試行は同じ承認結果を返し、明示的な再承認だけを新規要求で行う。
CREATE TABLE IF NOT EXISTS public.private_booking_approval_requests (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_booking_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_approval_requests FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.private_booking_approval_requests IS '貸切承認の再試行結果。同じ要求IDによる公演再作成・通知重複を防ぐ。';
