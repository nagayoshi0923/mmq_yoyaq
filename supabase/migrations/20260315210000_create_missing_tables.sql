-- =============================================================================
-- 不足しているテーブルを作成
-- =============================================================================

-- 1. auth_logs テーブル
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

CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON public.auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_event_type ON public.auth_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON public.auth_logs(created_at DESC);

ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "管理者は全ログを閲覧可能" ON public.auth_logs;
CREATE POLICY "管理者は全ログを閲覧可能"
  ON public.auth_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "ユーザーは自分のログのみ閲覧可能" ON public.auth_logs;
CREATE POLICY "ユーザーは自分のログのみ閲覧可能"
  ON public.auth_logs
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_logs_insert_service_role_only" ON public.auth_logs;
CREATE POLICY "auth_logs_insert_service_role_only"
  ON public.auth_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.auth_logs IS '認証イベントログ（ログイン/ログアウト/ロール変更など）';

-- 2. manual_external_performances テーブル（他社公演数の手動入力用）
CREATE TABLE IF NOT EXISTS public.manual_external_performances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  performance_count INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (organization_id, scenario_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_manual_external_performances_org_id ON public.manual_external_performances(organization_id);
CREATE INDEX IF NOT EXISTS idx_manual_external_performances_scenario_id ON public.manual_external_performances(scenario_id);
CREATE INDEX IF NOT EXISTS idx_manual_external_performances_year_month ON public.manual_external_performances(year, month);

ALTER TABLE public.manual_external_performances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can view their org manual externals"
  ON public.manual_external_performances
  FOR SELECT
  USING (
    organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can insert their org manual externals"
  ON public.manual_external_performances
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can update their org manual externals"
  ON public.manual_external_performances
  FOR UPDATE
  USING (
    organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their org manual externals" ON public.manual_external_performances;
CREATE POLICY "Users can delete their org manual externals"
  ON public.manual_external_performances
  FOR DELETE
  USING (
    organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
  );

COMMENT ON TABLE public.manual_external_performances IS '他社公演数の手動入力（公演報告用）';
COMMENT ON COLUMN public.manual_external_performances.performance_count IS '他社での公演回数';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: auth_logs と manual_external_performances テーブルを作成';
END $$;
