-- ============================================================
-- 公開用ビューを更新：オフィス店舗を除外
-- ============================================================
-- stores_public ビューからオフィス（ownership_type='office'）を除外
-- これにより公開ページで ownership_type カラムなしでもオフィスが表示されない

-- ============================================================
-- 1. stores_public ビュー更新
-- ============================================================
CREATE OR REPLACE VIEW public.stores_public AS
SELECT
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at
FROM stores
WHERE ownership_type IS NULL OR ownership_type != 'office';

-- 権限再付与（既存のGRANTがある場合でも安全）
GRANT SELECT ON public.stores_public TO anon;
GRANT SELECT ON public.stores_public TO authenticated;

-- ============================================================
-- 完了通知
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ stores_public からオフィス店舗を除外しました';
END $$;
