-- ゲスト (anon) が /group/invite/<code> 内でチャットを見られるよう、
-- private_group_messages の SELECT ポリシーを true に戻す。
--
-- 20260522020000 と同じ事故。Phase 2 (20260519040000) の hardening でこれも
-- 「メンバー・自組織 staff」に restrict されたが、親 private_groups は USING (true)
-- のため整合性がなく、ゲスト入室後にチャットが表示されない症状を起こしていた。
--
-- INSERT/UPDATE/DELETE 制約は変更しない。
-- 関連: [[feedback-no-silent-scope-creep]]

DROP POLICY IF EXISTS "private_group_messages_select" ON public.private_group_messages;
CREATE POLICY "private_group_messages_select"
  ON public.private_group_messages
  FOR SELECT
  USING (true);
