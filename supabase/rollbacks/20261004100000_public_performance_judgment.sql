-- rollback: 公開の中止判定の読み取りを消す
DROP FUNCTION IF EXISTS public.get_public_performance_judgment(text,uuid,uuid,uuid);
