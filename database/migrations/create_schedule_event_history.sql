-- schedule_event_history テーブルを作成
-- 公演の変更履歴を記録するテーブル
-- ※公演削除後も履歴を残すため、セル情報（日付・店舗・時間帯）も保存

-- 1. テーブル作成
CREATE TABLE IF NOT EXISTS schedule_event_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE SET NULL, -- 削除後もNULLで残す
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- セル情報（削除後も履歴を関連付けるため）
  event_date DATE NOT NULL,           -- 公演日
  store_id UUID NOT NULL,             -- 店舗ID
  time_slot TEXT,                     -- 時間帯（朝/昼/夜）
  
  -- 変更者情報
  changed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  changed_by_name TEXT, -- スタッフ名（表示用にコピー保存）
  
  -- 変更情報
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create',     -- 新規作成
    'update',     -- 更新
    'delete',     -- 削除
    'cancel',     -- 中止
    'restore',    -- 復活（中止から戻す）
    'publish',    -- 公開
    'unpublish'   -- 非公開
  )),
  
  -- 変更内容（差分を記録）
  changes JSONB NOT NULL DEFAULT '{}', -- { field: { old: value, new: value } }
  
  -- 変更前後のスナップショット（オプション）
  old_values JSONB,
  new_values JSONB,
  
  -- 削除された公演の情報（削除時に保存）
  deleted_event_scenario TEXT,        -- 削除された公演のシナリオ名
  
  -- メモ（任意）
  notes TEXT,
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. インデックス作成
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_event_id 
ON schedule_event_history(schedule_event_id);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_org_id 
ON schedule_event_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_created_at 
ON schedule_event_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_event_history_changed_by 
ON schedule_event_history(changed_by_user_id);

-- セル情報でのフィルタリング用インデックス（削除後の履歴検索用）
CREATE INDEX IF NOT EXISTS idx_schedule_event_history_cell 
ON schedule_event_history(organization_id, event_date, store_id, time_slot);

-- 3. RLS 設定
ALTER TABLE schedule_event_history ENABLE ROW LEVEL SECURITY;

-- 閲覧ポリシー: 同じ組織のメンバーのみ閲覧可能
CREATE POLICY "schedule_event_history_select_policy" ON schedule_event_history
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM staff WHERE user_id = auth.uid()
  )
);

-- 挿入ポリシー: 認証済みユーザーのみ挿入可能
CREATE POLICY "schedule_event_history_insert_policy" ON schedule_event_history
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- 4. コメント追加
COMMENT ON TABLE schedule_event_history IS '公演スケジュールの変更履歴（削除後も保持）';
COMMENT ON COLUMN schedule_event_history.schedule_event_id IS '対象の公演ID（削除後はNULL）';
COMMENT ON COLUMN schedule_event_history.organization_id IS '組織ID（マルチテナント）';
COMMENT ON COLUMN schedule_event_history.event_date IS '公演日（セル特定用）';
COMMENT ON COLUMN schedule_event_history.store_id IS '店舗ID（セル特定用）';
COMMENT ON COLUMN schedule_event_history.time_slot IS '時間帯（朝/昼/夜）（セル特定用）';
COMMENT ON COLUMN schedule_event_history.changed_by_user_id IS '変更者のユーザーID';
COMMENT ON COLUMN schedule_event_history.changed_by_staff_id IS '変更者のスタッフID';
COMMENT ON COLUMN schedule_event_history.changed_by_name IS '変更者名（表示用）';
COMMENT ON COLUMN schedule_event_history.action_type IS '変更種別（create/update/delete/cancel/restore/publish/unpublish）';
COMMENT ON COLUMN schedule_event_history.changes IS '変更内容の差分 { field: { old: value, new: value } }';
COMMENT ON COLUMN schedule_event_history.old_values IS '変更前のスナップショット';
COMMENT ON COLUMN schedule_event_history.new_values IS '変更後のスナップショット';
COMMENT ON COLUMN schedule_event_history.deleted_event_scenario IS '削除された公演のシナリオ名';
COMMENT ON COLUMN schedule_event_history.notes IS '変更メモ';

