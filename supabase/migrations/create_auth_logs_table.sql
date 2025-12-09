-- ============================================================
-- 認証イベントログテーブル作成
-- ============================================================
-- 
-- ログイン/ログアウト/ロール変更などの認証イベントを記録します。
-- 問題発生時のトレーサビリティ確保を目的とします。
-- ============================================================

-- 認証ログテーブル
CREATE TABLE IF NOT EXISTS public.auth_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'role_change', 'password_reset', 'password_set', 'signup')),
  old_role app_role,
  new_role app_role,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- インデックス作成（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON public.auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_event_type ON public.auth_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON public.auth_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_user_event ON public.auth_logs(user_id, event_type, created_at DESC);

-- RLS（Row Level Security）設定
ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;

-- ポリシー: 管理者は全ログを閲覧可能
CREATE POLICY "管理者は全ログを閲覧可能"
  ON public.auth_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ポリシー: ユーザーは自分のログのみ閲覧可能
CREATE POLICY "ユーザーは自分のログのみ閲覧可能"
  ON public.auth_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- ポリシー: 認証システムはログを記録可能（Service Role経由）
-- 注意: Service RoleはRLSをバイパスするため、このポリシーは主にEdge Functions用
CREATE POLICY "認証システムはログを記録可能"
  ON public.auth_logs
  FOR INSERT
  WITH CHECK (true);

-- コメント追加
COMMENT ON TABLE public.auth_logs IS '認証イベントログ（ログイン/ログアウト/ロール変更など）';
COMMENT ON COLUMN public.auth_logs.event_type IS 'イベントタイプ: login, logout, role_change, password_reset, password_set, signup';
COMMENT ON COLUMN public.auth_logs.old_role IS 'ロール変更前のロール（role_changeイベント時のみ）';
COMMENT ON COLUMN public.auth_logs.new_role IS 'ロール変更後のロール（role_changeイベント時のみ）';
COMMENT ON COLUMN public.auth_logs.metadata IS '追加情報（JSON形式）';

