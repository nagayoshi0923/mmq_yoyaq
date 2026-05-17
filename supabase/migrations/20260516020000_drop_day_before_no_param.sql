-- check_performances_day_before() の引数なし版を削除
-- date DEFAULT NULL 版のみに統一してオーバーロード解消
DROP FUNCTION IF EXISTS public.check_performances_day_before();
