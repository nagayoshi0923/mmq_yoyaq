-- 公開予約トップ（/{slug}）ヒーロー直下の紹介文（設定画面から編集）

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_booking_hero_description TEXT;

COMMENT ON COLUMN public.organizations.public_booking_hero_description IS
  '公開予約サイトトップのヒーロー説明文。空のときはアプリ側のデフォルト文言を表示。';

-- 既存のクインズワルツ向け文言を初期値として投入（未設定のときのみ）
UPDATE public.organizations
SET public_booking_hero_description =
  '都内（大久保、高田馬場、大塚）に4店舗、埼玉に1店舗を運営するマーダーミステリー専門店クインズワルツ。160種類以上のマーダーミステリーシナリオをご用意しています。あなたの気に入る物語がきっと見つかる！'
WHERE slug = 'queens-waltz'
  AND (public_booking_hero_description IS NULL OR btrim(public_booking_hero_description) = '');
