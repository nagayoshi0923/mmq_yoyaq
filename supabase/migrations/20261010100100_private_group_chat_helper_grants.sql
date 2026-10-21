-- 20261010100000 の補助関数の実行権限をそろえる（2026-10-10）
-- 手元で作り直した DB では既定で service_role に実行権限が付くが、staging では付かなかった（環境の既定権限の差）。
-- 既存の private_group_message_payload と同じく postgres と service_role だけに明示する。ブラウザの役割には付けない。
GRANT EXECUTE ON FUNCTION public.private_group_member_display_name(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.private_group_message_is_system(text) TO service_role;
