-- 20261010130000 の補助関数・トリガー関数の実行権限をそろえる（2026-10-10）
-- 手元で作り直した DB では既定で service_role に実行権限が付くが、staging では付かなかった（環境の既定権限の差。段階 2 の 20261010100100 と同じ）。
-- postgres と service_role だけに明示する。ブラウザの役割には付けない。
GRANT EXECUTE ON FUNCTION public.web_push_kick() TO service_role;
GRANT EXECUTE ON FUNCTION public.web_push_on_group_message() TO service_role;
GRANT EXECUTE ON FUNCTION public.web_push_on_user_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.private_group_on_date_response() TO service_role;
GRANT EXECUTE ON FUNCTION public.web_push_group_title(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.web_push_snippet(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.web_push_group_enabled(uuid, uuid) TO service_role;
