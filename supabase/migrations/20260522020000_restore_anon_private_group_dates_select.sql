-- ゲスト (anon) が /group/invite/<code> から
-- candidate_dates と date_responses を読めるよう、SELECT ポリシーを true に戻す。
--
-- 背景:
--   20260519040000 (Phase 2) で「全認証ユーザー閲覧可」を「メンバー・自組織staff」に
--   restrict したが、その RLS は `EXISTS ... JOIN staff` を含むため anon は staff への
--   SELECT 権限がなく 42501 → PostgREST が 401 を返してゲスト入室が壊れていた。
--
--   そもそも親テーブル private_groups の SELECT ポリシーは USING (true) のため、
--   子テーブル (candidate_dates / date_responses) だけ閉じても意味がない（group_id が分かれば
--   private_groups は読める前提）。整合性のため SELECT を true に戻す。
--
--   INSERT/UPDATE/DELETE の制約は変更しない（書き込みは引き続きメンバー・自組織 staff のみ）。

DROP POLICY IF EXISTS "private_group_candidate_dates_select" ON public.private_group_candidate_dates;
CREATE POLICY "private_group_candidate_dates_select"
  ON public.private_group_candidate_dates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "private_group_date_responses_select" ON public.private_group_date_responses;
CREATE POLICY "private_group_date_responses_select"
  ON public.private_group_date_responses
  FOR SELECT
  USING (true);
