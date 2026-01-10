-- キャンセル待ちテーブル
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schedule_event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  participant_count INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting', -- waiting, notified, expired, converted
  notified_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE, -- 通知後の回答期限
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_waitlist_schedule_event_id ON waitlist(schedule_event_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_customer_email ON waitlist(customer_email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_organization_id ON waitlist(organization_id);

-- RLSポリシー
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- 組織メンバーは自組織のキャンセル待ちを閲覧・操作可能
CREATE POLICY "Organization members can view waitlist" ON waitlist
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Organization members can update waitlist" ON waitlist
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Organization members can delete waitlist" ON waitlist
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
    OR
    customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 更新日時トリガー
CREATE OR REPLACE FUNCTION update_waitlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_waitlist_updated_at
  BEFORE UPDATE ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION update_waitlist_updated_at();

-- コメント
COMMENT ON TABLE waitlist IS 'キャンセル待ちリスト';
COMMENT ON COLUMN waitlist.status IS 'waiting: 待機中, notified: 通知済み, expired: 期限切れ, converted: 予約に変換';

