-- private_group_members_pii から anon 権限を全剥奪する
--
-- 背景（本番実測 2026-08-02）:
--   anon が INSERT / SELECT / REFERENCES / TRIGGER を保持していた。
--   前migration（20260802120000）では「ゲスト参加時にトリガー経由で
--   書かれる可能性がある」として保留していたもの。
--
-- 確認結果:
--   - private_group_members への INSERT で発火するトリガー関数
--     sync_private_group_member_pii は SECURITY DEFINER（pg_get_functiondef で実測）。
--     → PII テーブルへの書き込みは関数所有者権限で行われ、anon の GRANT は不要。
--   - src/ に .from('private_group_members_pii') の直接参照は 0 件。
--     ゲスト PIN 認証は Edge Function（send-guest-pin, service_role）の RPC 経由のみ。
--   - anon SELECT はポリシー（USING false）で既に0行だが、GRANT 自体も不要なので剥がす。
--
-- 影響:
--   authenticated / service_role の権限は変更しない。
--   ゲストの貸切参加フロー（private_group_members への anon INSERT）はそのまま動く。

BEGIN;

REVOKE ALL ON public.private_group_members_pii FROM anon;

COMMIT;
