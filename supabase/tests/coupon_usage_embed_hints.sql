-- 読み取りのみ。coupon_usages と reservations の間の外部キーが 2 本あり（PostgREST の素の埋め込みは PGRST201）、
-- API が埋め込みのヒントに使う外部キー名（api/_lib/coupons/usageSelects.ts）が実在して向きも正しいことを確かめる。
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND ((c.conrelid = 'public.coupon_usages'::regclass AND c.confrelid = 'public.reservations'::regclass)
      OR (c.conrelid = 'public.reservations'::regclass AND c.confrelid = 'public.coupon_usages'::regclass));
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'coupon_usages と reservations の外部キーは 2 本の前提（実際 % 本）。usageSelects.ts のヒントを見直す', v_count;
  END IF;

  -- API のヒント: coupon_usages.reservation_id → reservations.id
  PERFORM 1
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.conname = 'coupon_usages_reservation_id_fkey'
    AND c.contype = 'f'
    AND c.conrelid = 'public.coupon_usages'::regclass
    AND c.confrelid = 'public.reservations'::regclass
    AND array_length(c.conkey, 1) = 1
    AND a.attname = 'reservation_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_usages_reservation_id_fkey（coupon_usages.reservation_id → reservations.id）が見つからない';
  END IF;

  -- 逆向き（予約に付いている使用）: reservations.coupon_usage_id → coupon_usages.id
  PERFORM 1
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.conname = 'reservations_coupon_usage_id_fkey'
    AND c.contype = 'f'
    AND c.conrelid = 'public.reservations'::regclass
    AND c.confrelid = 'public.coupon_usages'::regclass
    AND a.attname = 'coupon_usage_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservations_coupon_usage_id_fkey（reservations.coupon_usage_id → coupon_usages.id）が見つからない';
  END IF;

  RAISE NOTICE 'PASS: coupon_usages ↔ reservations の外部キー 2 本と、API が使うヒント名';
END $$;
