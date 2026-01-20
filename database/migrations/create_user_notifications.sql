-- ユーザー通知テーブル
-- 予約確認、リマインダー、キャンセル待ち空きなどの通知を管理

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- 通知の種類
  type TEXT NOT NULL CHECK (type IN (
    'reservation_confirmed',    -- 予約確定
    'reservation_reminder',     -- 予約リマインダー
    'reservation_cancelled',    -- 予約キャンセル
    'reservation_changed',      -- 予約変更
    'waitlist_available',       -- キャンセル待ち空き
    'waitlist_registered',      -- キャンセル待ち登録
    'payment_reminder',         -- 支払いリマインダー
    'system'                    -- システム通知
  )),
  
  -- 通知内容
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- 関連データ
  related_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  related_event_id UUID REFERENCES schedule_events(id) ON DELETE SET NULL,
  related_waitlist_id UUID REFERENCES waitlist(id) ON DELETE SET NULL,
  link TEXT,                    -- 遷移先URL
  metadata JSONB DEFAULT '{}',  -- 追加データ
  
  -- 状態
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,       -- 通知の有効期限（オプション）
  
  -- user_id または customer_id のいずれかが必須
  CONSTRAINT user_or_customer_required CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_customer_id ON user_notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_notifications_type ON user_notifications(type);

-- RLSポリシー
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の通知のみ閲覧可能
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (
    user_id = auth.uid() 
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- ユーザーは自分の通知を既読にできる
CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    user_id = auth.uid() 
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- システム（service_role）は通知を作成可能
CREATE POLICY "Service role can insert notifications" ON user_notifications
  FOR INSERT WITH CHECK (TRUE);

-- ユーザーは自分の通知を削除可能
CREATE POLICY "Users can delete their own notifications" ON user_notifications
  FOR DELETE USING (
    user_id = auth.uid() 
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 通知作成用の関数
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_customer_id UUID,
  p_organization_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL,
  p_related_reservation_id UUID DEFAULT NULL,
  p_related_event_id UUID DEFAULT NULL,
  p_related_waitlist_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO user_notifications (
    user_id,
    customer_id,
    organization_id,
    type,
    title,
    message,
    link,
    related_reservation_id,
    related_event_id,
    related_waitlist_id,
    metadata
  ) VALUES (
    p_user_id,
    p_customer_id,
    p_organization_id,
    p_type,
    p_title,
    p_message,
    p_link,
    p_related_reservation_id,
    p_related_event_id,
    p_related_waitlist_id,
    p_metadata
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 予約確定時に通知を自動作成するトリガー
CREATE OR REPLACE FUNCTION notify_on_reservation_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_user_id UUID;
BEGIN
  -- 予約がconfirmedまたはgm_confirmedになった場合
  IF NEW.status IN ('confirmed', 'gm_confirmed') AND 
     (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'gm_confirmed')) THEN
    
    -- 顧客のuser_idを取得
    SELECT user_id INTO v_customer_user_id
    FROM customers
    WHERE id = NEW.customer_id;
    
    -- 通知を作成
    PERFORM create_notification(
      v_customer_user_id,
      NEW.customer_id,
      NEW.organization_id,
      'reservation_confirmed',
      '予約が確定しました',
      '「' || COALESCE(NEW.title, '公演') || '」のご予約を承りました',
      '/mypage',
      NEW.id,
      NEW.schedule_event_id,
      NULL,
      jsonb_build_object('reservation_number', NEW.reservation_number)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_notify_on_reservation_confirmed ON reservations;
CREATE TRIGGER trigger_notify_on_reservation_confirmed
  AFTER INSERT OR UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_reservation_confirmed();

-- キャンセル待ち空き通知のトリガー
CREATE OR REPLACE FUNCTION notify_on_waitlist_available()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_user_id UUID;
  v_event_info RECORD;
BEGIN
  -- ステータスがnotifiedに変更された場合
  IF NEW.status = 'notified' AND OLD.status != 'notified' THEN
    
    -- 顧客のuser_idを取得
    SELECT user_id INTO v_customer_user_id
    FROM customers
    WHERE id = NEW.customer_id;
    
    -- イベント情報を取得
    SELECT scenario, date INTO v_event_info
    FROM schedule_events
    WHERE id = NEW.schedule_event_id;
    
    -- 通知を作成
    PERFORM create_notification(
      v_customer_user_id,
      NEW.customer_id,
      NEW.organization_id,
      'waitlist_available',
      'キャンセル待ちに空きが出ました',
      '「' || COALESCE(v_event_info.scenario, '公演') || '」' || COALESCE(v_event_info.date::TEXT, ''),
      '/mypage',
      NULL,
      NEW.schedule_event_id,
      NEW.id,
      '{}'::jsonb
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- トリガーを作成
DROP TRIGGER IF EXISTS trigger_notify_on_waitlist_available ON waitlist;
CREATE TRIGGER trigger_notify_on_waitlist_available
  AFTER UPDATE ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_waitlist_available();

COMMENT ON TABLE user_notifications IS 'ユーザー向け通知を管理するテーブル';

