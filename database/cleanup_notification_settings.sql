-- notification_settings テーブルの重複データを整理
-- 最新の設定1件のみを残し、古いデータを削除

-- 現在のデータを確認
SELECT id, shift_notification_enabled, shift_notification_day, shift_deadline_day, shift_reminder_days, created_at
FROM notification_settings
ORDER BY created_at DESC;

-- 最新の設定以外を削除
DELETE FROM notification_settings
WHERE id NOT IN (
  SELECT id
  FROM notification_settings
  ORDER BY created_at DESC
  LIMIT 1
);

-- 削除後の確認
SELECT id, shift_notification_enabled, shift_notification_day, shift_deadline_day, shift_reminder_days, created_at
FROM notification_settings
ORDER BY created_at DESC;

-- 件数確認
SELECT COUNT(*) as total_records
FROM notification_settings;

