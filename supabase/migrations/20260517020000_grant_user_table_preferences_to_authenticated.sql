-- user_table_preferences に authenticated ロールへの権限を付与
-- RLS ポリシーは存在するが GRANT がなかったため 403 が発生していた
grant select, insert, update, delete on public.user_table_preferences to authenticated;
