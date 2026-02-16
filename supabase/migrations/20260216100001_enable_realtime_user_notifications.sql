-- user_notifications テーブルのリアルタイム機能を有効化

-- リアルタイムのための REPLICA IDENTITY を設定
ALTER TABLE user_notifications REPLICA IDENTITY FULL;

-- Supabaseのリアルタイム機能に追加（supabase_realtimeスキーマに公開）
-- 注意: この操作はSupabaseダッシュボードからも設定可能
DO $$
BEGIN
  -- publication が存在するか確認
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- テーブルが既に追加されているか確認
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'user_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
      RAISE NOTICE 'user_notifications をリアルタイム公開に追加しました';
    ELSE
      RAISE NOTICE 'user_notifications は既にリアルタイム公開に追加されています';
    END IF;
  ELSE
    RAISE WARNING 'supabase_realtime publication が存在しません';
  END IF;
END $$;
