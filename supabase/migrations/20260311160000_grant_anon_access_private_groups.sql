-- ゲストユーザー（anon）にprivate_group関連テーブルへのアクセス権限を付与

-- private_groups テーブル
GRANT SELECT ON public.private_groups TO anon;

-- private_group_members テーブル
GRANT SELECT, INSERT, UPDATE ON public.private_group_members TO anon;

-- private_group_candidate_dates テーブル
GRANT SELECT ON public.private_group_candidate_dates TO anon;

-- private_group_date_responses テーブル
GRANT SELECT, INSERT, UPDATE ON public.private_group_date_responses TO anon;

-- private_group_messages テーブル（チャット）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_group_messages' AND table_schema = 'public') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.private_group_messages TO anon';
  END IF;
END $$;

-- group_chat_messages テーブル（旧名、存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_chat_messages' AND table_schema = 'public') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.group_chat_messages TO anon';
  END IF;
END $$;

-- users テーブル（メンバー情報取得用、SELECT のみ）
GRANT SELECT ON public.users TO anon;

-- scenario_masters テーブル（シナリオ情報取得用、SELECT のみ）
GRANT SELECT ON public.scenario_masters TO anon;

-- organization_scenarios テーブル
GRANT SELECT ON public.organization_scenarios TO anon;

-- RPC関数へのアクセス権限（authenticate_guest_by_pin）
-- 注意: この関数は20260311150000_add_pin_auth_rpc.sql で既にGRANTされている

-- authenticated ロールにも同様の権限を付与（念のため）
GRANT SELECT ON public.private_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_members TO authenticated;
GRANT SELECT ON public.private_group_candidate_dates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_group_date_responses TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_chat_messages' AND table_schema = 'public') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.group_chat_messages TO authenticated';
  END IF;
END $$;

-- 通知用: マイグレーション完了
DO $$
BEGIN
  RAISE NOTICE 'private_group関連テーブルへのanon/authenticatedアクセス権限を付与しました';
END $$;
