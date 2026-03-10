-- パフォーマンス改善: 頻繁に使用されるクエリ用のインデックス追加

-- schedule_events: 月別取得の高速化
CREATE INDEX IF NOT EXISTS idx_schedule_events_org_date 
ON schedule_events(organization_id, date);

-- schedule_events: 日付範囲クエリの高速化
CREATE INDEX IF NOT EXISTS idx_schedule_events_date 
ON schedule_events(date);

-- schedule_events: キャンセル状態フィルタの高速化
CREATE INDEX IF NOT EXISTS idx_schedule_events_is_cancelled 
ON schedule_events(is_cancelled) WHERE is_cancelled = false;

-- reservations: イベント別予約取得の高速化（複合インデックス）
CREATE INDEX IF NOT EXISTS idx_reservations_event_status 
ON reservations(schedule_event_id, status);

-- reservations: 組織別予約取得の高速化
CREATE INDEX IF NOT EXISTS idx_reservations_org_status 
ON reservations(organization_id, status);

-- reservations: 予約ソース別の検索高速化
CREATE INDEX IF NOT EXISTS idx_reservations_source 
ON reservations(reservation_source);
