-- coupon_usages に INSERT されたら customer_coupons を自動更新するトリガー
-- SECURITY DEFINER で実行するため RLS を回避できる

CREATE OR REPLACE FUNCTION update_customer_coupon_on_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.customer_coupons
  SET
    uses_remaining = GREATEST(uses_remaining - 1, 0),
    status = CASE
      WHEN uses_remaining - 1 <= 0 THEN 'fully_used'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.customer_coupon_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_coupon_on_usage ON public.coupon_usages;

CREATE TRIGGER trigger_update_coupon_on_usage
  AFTER INSERT ON public.coupon_usages
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_coupon_on_usage();
