-- =============================================================================
-- 🔒 セキュリティ強化: 特権操作の監査ログ
-- 
-- 目的: 誰が・いつ・何をしたかを追跡可能にし、不正操作の検出・調査を可能にする
-- =============================================================================

-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 操作者情報
  user_id UUID,                    -- 操作したユーザーID
  user_email TEXT,                 -- 操作したユーザーのメール（検索用）
  user_role TEXT,                  -- 操作時のロール
  organization_id UUID,            -- 所属組織
  
  -- 操作内容
  action TEXT NOT NULL,            -- 操作種別 (create, update, delete, login, etc.)
  resource_type TEXT NOT NULL,     -- 対象リソース (reservation, user, staff, etc.)
  resource_id UUID,                -- 対象リソースのID
  
  -- 詳細
  old_values JSONB,                -- 変更前の値
  new_values JSONB,                -- 変更後の値
  metadata JSONB,                  -- その他のメタデータ
  
  -- クライアント情報
  ip_address TEXT,                 -- クライアントIPアドレス
  user_agent TEXT,                 -- User-Agent
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON public.audit_logs (created_at DESC);

-- 監査ログ記録関数
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  -- 現在のユーザー情報を取得
  v_user_id := auth.uid();
  
  IF v_user_id IS NOT NULL THEN
    SELECT email, role, organization_id
    INTO v_user_email, v_user_role, v_org_id
    FROM public.users
    WHERE id = v_user_id;
  END IF;

  -- ログを挿入
  INSERT INTO audit_logs (
    user_id,
    user_email,
    user_role,
    organization_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    v_user_id,
    v_user_email,
    v_user_role,
    v_org_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_values,
    p_new_values,
    p_metadata,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- 予約変更の監査トリガー
CREATE OR REPLACE FUNCTION public.audit_reservation_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- ステータス変更をログ
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM log_audit(
        'update_status',
        'reservation',
        NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        jsonb_build_object(
          'customer_id', NEW.customer_id,
          'schedule_event_id', NEW.schedule_event_id
        )
      );
    END IF;
    
    -- 人数変更をログ
    IF OLD.participant_count IS DISTINCT FROM NEW.participant_count THEN
      PERFORM log_audit(
        'update_participant_count',
        'reservation',
        NEW.id,
        jsonb_build_object('participant_count', OLD.participant_count),
        jsonb_build_object('participant_count', NEW.participant_count),
        NULL
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'delete',
      'reservation',
      OLD.id,
      jsonb_build_object(
        'status', OLD.status,
        'customer_id', OLD.customer_id,
        'schedule_event_id', OLD.schedule_event_id
      ),
      NULL,
      NULL
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ユーザーロール変更の監査トリガー
CREATE OR REPLACE FUNCTION public.audit_user_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM log_audit(
      'update_role',
      'user',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      jsonb_build_object('email', NEW.email)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_audit_reservations ON public.reservations;
CREATE TRIGGER trigger_audit_reservations
AFTER UPDATE OR DELETE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.audit_reservation_changes();

DROP TRIGGER IF EXISTS trigger_audit_user_roles ON public.users;
CREATE TRIGGER trigger_audit_user_roles
AFTER UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.audit_user_role_changes();

-- RLSを有効化
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ閲覧可能
DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT
  USING (
    is_admin()
    OR auth.role() = 'service_role'
  );

-- 権限付与
GRANT EXECUTE ON FUNCTION public.log_audit TO authenticated, service_role;

COMMENT ON TABLE public.audit_logs IS '特権操作の監査ログ';
COMMENT ON FUNCTION public.log_audit IS '監査ログを記録する関数';

-- 確認
DO $$
BEGIN
  RAISE NOTICE '✅ 監査ログインフラストラクチャを作成しました';
  RAISE NOTICE '   - audit_logs テーブル: 監査ログ格納';
  RAISE NOTICE '   - log_audit 関数: ログ記録';
  RAISE NOTICE '   - 予約変更トリガー: ステータス/人数変更を自動記録';
  RAISE NOTICE '   - ユーザーロール変更トリガー: ロール変更を自動記録';
END $$;
