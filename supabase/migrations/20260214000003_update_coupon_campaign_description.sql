-- クーポンキャンペーンの説明文を修正
UPDATE public.coupon_campaigns
SET description = 'MMQに新規登録いただいた方に、500円OFFクーポンをプレゼント！'
WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'
  AND name = '新規登録キャンペーン';
