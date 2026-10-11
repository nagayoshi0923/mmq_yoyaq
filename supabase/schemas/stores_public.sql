-- 正規ソース: supabase/schemas/stores_public.sql
-- 最終更新: 2026-10-12
-- 予約サイト・マイページなど顧客向け画面が読む店舗の公開ビュー。
-- 列は公開してよいものだけ（費用・連絡先・メモなどの非公開列は含めない）。オフィス（ownership_type='office'）は出さない。
-- 経緯: 20260412190000（office 除外）→ 20260425000000（ownership_type 追加）→ 20260802090000（書き込み権限の剥奪）
--       → 20261011210000（public_name を末尾に追加）
CREATE OR REPLACE VIEW public.stores_public AS
SELECT
  id, name, short_name, address,
  opening_date, status, capacity, rooms, color,
  is_temporary, temporary_date, temporary_dates,
  organization_id, display_order, region,
  temporary_venue_names, kit_group_id, access_info,
  created_at, updated_at,
  ownership_type,
  public_name
FROM public.stores
WHERE ownership_type IS NULL OR ownership_type <> 'office';

-- 顧客向け公開ページが読むビュー: SELECT だけ許可し、書き込みは剥奪（20260802090000）
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.stores_public
  FROM anon, authenticated;
GRANT SELECT ON public.stores_public TO anon, authenticated;
