-- AI Manager専用ゲートウェイの承認・冪等性・監査台帳。
-- リクエスト本文や認証情報は保存せず、承認番号とfingerprintだけを保持する。

CREATE TABLE IF NOT EXISTS public.ai_manager_gateway_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  approval_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  approved_by TEXT NOT NULL CHECK (approved_by = 'PRESIDENT'),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (organization_id, approval_id)
);

CREATE TABLE IF NOT EXISTS public.ai_manager_gateway_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  approval_id TEXT NOT NULL,
  request_status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (request_status IN ('accepted', 'succeeded', 'failed')),
  response_status INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_manager_gateway_requests_org_created
  ON public.ai_manager_gateway_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_manager_gateway_requests_operation_created
  ON public.ai_manager_gateway_requests (operation_id, created_at DESC);

ALTER TABLE public.ai_manager_gateway_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_manager_gateway_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_manager_gateway_approvals FROM anon, authenticated;
REVOKE ALL ON public.ai_manager_gateway_requests FROM anon, authenticated;
GRANT ALL ON public.ai_manager_gateway_approvals TO service_role;
GRANT ALL ON public.ai_manager_gateway_requests TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_manager_gateway_write(
  p_organization_id UUID,
  p_operation_id TEXT,
  p_approval_id TEXT,
  p_idempotency_key TEXT,
  p_fingerprint TEXT
)
RETURNS TABLE (request_id UUID, reservation_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.ai_manager_gateway_requests%ROWTYPE;
  v_approval public.ai_manager_gateway_approvals%ROWTYPE;
  v_request_id UUID;
BEGIN
  SELECT * INTO v_existing
  FROM public.ai_manager_gateway_requests
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT v_existing.id, 'DUPLICATE_WRITE_BLOCKED'::TEXT;
    ELSE
      RETURN QUERY SELECT v_existing.id, 'IDEMPOTENCY_KEY_CONFLICT'::TEXT;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO v_approval
  FROM public.ai_manager_gateway_approvals
  WHERE organization_id = p_organization_id
    AND approval_id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, 'APPROVAL_NOT_FOUND'::TEXT;
    RETURN;
  END IF;
  IF v_approval.operation_id <> p_operation_id OR v_approval.fingerprint <> p_fingerprint THEN
    RETURN QUERY SELECT NULL::UUID, 'APPROVAL_MISMATCH'::TEXT;
    RETURN;
  END IF;
  IF v_approval.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, 'APPROVAL_REVOKED'::TEXT;
    RETURN;
  END IF;
  IF v_approval.expires_at <= NOW() THEN
    RETURN QUERY SELECT NULL::UUID, 'APPROVAL_EXPIRED'::TEXT;
    RETURN;
  END IF;
  IF v_approval.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, 'APPROVAL_ALREADY_CONSUMED'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.ai_manager_gateway_requests (
    organization_id, operation_id, approval_id, idempotency_key, fingerprint, request_status
  ) VALUES (
    p_organization_id, p_operation_id, p_approval_id, p_idempotency_key, p_fingerprint, 'accepted'
  ) RETURNING id INTO v_request_id;

  UPDATE public.ai_manager_gateway_approvals
  SET consumed_at = NOW()
  WHERE id = v_approval.id;

  RETURN QUERY SELECT v_request_id, 'RESERVED'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_manager_gateway_write(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_manager_gateway_write(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.ai_manager_gateway_requests IS
  'AI Manager gatewayの二重実行防止と監査。本文・秘密情報は保存しない。';
COMMENT ON TABLE public.ai_manager_gateway_approvals IS
  'AI ManagerのL3書き込み承認。社長承認したoperationとfingerprintを期限付きで1回だけ消費する。';
