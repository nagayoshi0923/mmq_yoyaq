-- Run after 20260908120000_cancellation_billing.sql in an isolated database.
BEGIN;
INSERT INTO public.organizations(id) VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.reservations(id) VALUES ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.cancellation_billing_claims(id, organization_id, reservation_id, data) VALUES
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"assessment":{"status":"payable"},"paidAt":null,"notifiedAt":"2026-09-08T00:00:00Z"}'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','{"assessment":{"status":"payable"},"paidAt":null,"notifiedAt":"2026-09-08T00:00:00Z"}');
DO $$
BEGIN
  ASSERT NOT public.settle_cancellation_billing_snapshot('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'entry','[]'), 'invoice added after snapshot';
  ASSERT NOT public.settle_cancellation_billing_claim('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',1,'entry'), 'other tenant';
  ASSERT NOT public.settle_cancellation_billing_claim('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'entry'), 'stale revision';
  ASSERT public.claim_cancellation_billing_notice('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'reminder1','reminder'), 'notice claim';
  ASSERT NOT public.claim_cancellation_billing_notice('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'reminder1','reminder'), 'duplicate notice';
  ASSERT NOT public.settle_cancellation_billing_claim('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'entry'), 'send/settle race';
  ASSERT NOT public.update_cancellation_billing_claim('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'{}'), 'edit/send race';
  UPDATE public.cancellation_billing_notices SET status='sent' WHERE notice_key='reminder1';
  ASSERT public.settle_cancellation_billing_claim('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'entry'), 'settle';
  ASSERT NOT public.settle_cancellation_billing_claim('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',1,'entry'), 'entry reused';
  ASSERT (SELECT data->>'paidAt' IS NULL FROM public.cancellation_billing_claims WHERE id='20000000-0000-4000-8000-000000000002'), 'partial update rollback';
  ASSERT NOT public.claim_cancellation_billing_notice('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'reminder2','reminder'), 'paid invoice reminder';
  ASSERT public.claim_cancellation_billing_notice('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'paid1','paid'), 'paid notice';
  ASSERT NOT has_table_privilege('anon','public.cancellation_billing_claims','SELECT'), 'anon data leak';
  ASSERT NOT has_table_privilege('authenticated','public.cancellation_billing_claims','SELECT'), 'authenticated data leak';
  ASSERT NOT has_function_privilege('authenticated','public.settle_cancellation_billing_claim(uuid,uuid,integer,text)','EXECUTE'), 'settle bypass';
END;
$$;
ROLLBACK;
