-- 店舗の「お客様向けの名前」（2026-10 トップページ刷新・社長決定）
-- 予約サイト・マイページ・グループページ・メールでお客様に見せる店舗名。NULL なら画面側で
-- 「店舗名から組織名の接頭辞を外したもの」を使う（src/lib/publicStoreName.ts の storeDisplayName）。
-- スタッフ向けの管理画面は従来どおり name / short_name を使う。データ（各店舗の値）はここでは入れない。
BEGIN;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS public_name text;

COMMENT ON COLUMN public.stores.public_name IS 'お客様向けの店舗名（空なら店舗名から組織名を外したもの）';

-- 公開の列として読めるようにする（20260927022000 の公開列と同じ扱い。費用・連絡先などの非公開列は変えない）
GRANT SELECT (public_name) ON public.stores TO anon, authenticated;

-- 公開ビューの末尾に列を足す（既存の列の並び・条件・権限は変えない）
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

NOTIFY pgrst, 'reload schema';

COMMIT;
