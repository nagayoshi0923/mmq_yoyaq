-- 事前読み込みシナリオの確定時メッセージ設定を追加

-- 全体設定に追加
ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS pre_reading_notice_message TEXT DEFAULT '【ご確認ください】

このシナリオには事前読み込みがございます。

公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。

ご不明点がございましたら、店舗までお問い合わせください。';

-- シナリオごとの追加文言
ALTER TABLE organization_scenarios
ADD COLUMN IF NOT EXISTS pre_reading_notice_message TEXT;

-- コメント
COMMENT ON COLUMN global_settings.pre_reading_notice_message IS '事前読み込みシナリオの日程確定時に送信するシステムメッセージ（全体設定）';
COMMENT ON COLUMN organization_scenarios.pre_reading_notice_message IS '事前読み込みシナリオの日程確定時に送信する追加メッセージ（シナリオごと）';
