-- QW-20260908-001: 独立したキャンセル料台帳。予約・freee会計の支払状態は変更しない。
BEGIN;
CREATE TABLE public.cancellation_billing_reconciliations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cancellation_billing_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cancellation_billing_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cancellation_billing_reconciliations TO service_role;
CREATE TABLE public.cancellation_billing_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cancellation_billing_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reservation_id),
  UNIQUE (organization_id, id)
);
CREATE TABLE public.cancellation_billing_matches (
  organization_id uuid NOT NULL,
  entry_id text NOT NULL,
  claim_id uuid NOT NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entry_id),
  UNIQUE (organization_id, claim_id),
  FOREIGN KEY (organization_id, claim_id) REFERENCES public.cancellation_billing_claims(organization_id, id)
);
CREATE TABLE public.cancellation_billing_notices (
  organization_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  notice_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('initial', 'reminder', 'paid', 'account_changed', 'review')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'unknown', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (organization_id, notice_key),
  FOREIGN KEY (organization_id, claim_id) REFERENCES public.cancellation_billing_claims(organization_id, id)
);
ALTER TABLE public.cancellation_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_billing_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_billing_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_billing_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cancellation_billing_settings, public.cancellation_billing_claims,
  public.cancellation_billing_matches, public.cancellation_billing_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cancellation_billing_settings, public.cancellation_billing_claims,
  public.cancellation_billing_matches, public.cancellation_billing_notices TO service_role;

-- 照合記録と入金済み更新は一つのトランザクション。同じ明細・請求の再利用を拒否。
CREATE FUNCTION public.settle_cancellation_billing_claim(
  p_organization_id uuid, p_claim_id uuid, p_revision integer, p_entry_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim public.cancellation_billing_claims;
BEGIN
  SELECT * INTO v_claim FROM public.cancellation_billing_claims
    WHERE organization_id = p_organization_id AND id = p_claim_id FOR UPDATE;
  IF NOT FOUND OR v_claim.revision <> p_revision OR v_claim.data->>'paidAt' IS NOT NULL
    OR v_claim.data->'assessment'->>'status' <> 'payable'
    OR v_claim.data->>'notifiedAt' IS NULL THEN
    RETURN false;
  END IF;
  -- 配信中の未入金案内とは競合させない。送信結果不明も運営確認まで保留。
  IF EXISTS (SELECT 1 FROM public.cancellation_billing_notices
    WHERE organization_id = p_organization_id AND claim_id = p_claim_id AND status IN ('sending', 'unknown')) THEN
    RETURN false;
  END IF;
  INSERT INTO public.cancellation_billing_matches(organization_id, entry_id, claim_id)
    VALUES (p_organization_id, p_entry_id, p_claim_id);
  UPDATE public.cancellation_billing_claims
    SET data = jsonb_set(data, '{paidAt}', to_jsonb(now())), revision = revision + 1, updated_at = now()
    WHERE organization_id = p_organization_id AND id = p_claim_id;
  RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_cancellation_billing_claim(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cancellation_billing_claim(uuid, uuid, integer, text) TO service_role;

-- 照合と同じ行ロックを取得してから送信権を予約する。
CREATE FUNCTION public.claim_cancellation_billing_notice(
  p_organization_id uuid, p_claim_id uuid, p_revision integer, p_notice_key text, p_kind text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim public.cancellation_billing_claims;
BEGIN
  SELECT * INTO v_claim FROM public.cancellation_billing_claims
    WHERE organization_id = p_organization_id AND id = p_claim_id FOR UPDATE;
  IF NOT FOUND OR v_claim.revision <> p_revision THEN RETURN false; END IF;
  IF p_kind IN ('initial', 'reminder', 'account_changed') AND v_claim.data->>'paidAt' IS NOT NULL THEN RETURN false; END IF;
  IF p_kind = 'paid' AND v_claim.data->>'paidAt' IS NULL THEN RETURN false; END IF;
  INSERT INTO public.cancellation_billing_notices(organization_id, claim_id, notice_key, kind)
    VALUES (p_organization_id, p_claim_id, p_notice_key, p_kind)
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_cancellation_billing_notice(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cancellation_billing_notice(uuid, uuid, integer, text, text) TO service_role;
CREATE FUNCTION public.update_cancellation_billing_claim(
  p_organization_id uuid, p_claim_id uuid, p_revision integer, p_data jsonb, p_notice_key text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim public.cancellation_billing_claims;
BEGIN
  SELECT * INTO v_claim FROM public.cancellation_billing_claims
    WHERE organization_id=p_organization_id AND id=p_claim_id FOR UPDATE;
  IF NOT FOUND OR v_claim.revision <> p_revision THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.cancellation_billing_notices
    WHERE organization_id=p_organization_id AND claim_id=p_claim_id AND status IN ('sending','unknown')
      AND (p_notice_key IS NULL OR notice_key <> p_notice_key)) THEN RETURN false; END IF;
  IF p_notice_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cancellation_billing_notices
    WHERE organization_id=p_organization_id AND claim_id=p_claim_id AND notice_key=p_notice_key AND status='sending') THEN RETURN false; END IF;
  UPDATE public.cancellation_billing_claims SET data=p_data, revision=revision+1, updated_at=now()
    WHERE organization_id=p_organization_id AND id=p_claim_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.update_cancellation_billing_claim(uuid, uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cancellation_billing_claim(uuid, uuid, integer, jsonb, text) TO service_role;
COMMIT;
