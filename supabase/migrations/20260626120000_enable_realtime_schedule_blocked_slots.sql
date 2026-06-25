-- 募集中止スロット（schedule_blocked_slots）を realtime publication に追加する。
--
-- 背景: 「募集停止/再開」は schedule_blocked_slots への INSERT/DELETE で永続化されるが、
--   このテーブルが supabase_realtime publication に未登録だったため、他タブ・他スタッフの
--   端末に変更が伝播せず、自タブの楽観更新でしか反映されなかった（イベント中止＝schedule_events は
--   購読済みのため伝播していた）。本マイグレーションで publication に追加し、クライアント側の
--   購読（useBlockedSlots）と合わせて即時反映できるようにする。
--
-- マルチテナント配慮: クライアントの購読は organization_id でサーバーフィルタする。
-- INSERT(募集停止)は new に organization_id が載るが、DELETE(募集再開)は default replica identity だと
-- old が主キーのみになり organization_id でフィルタできず DELETE を取りこぼす。
-- そのため REPLICA IDENTITY FULL にして old にも全列を載せ、他組織の変更を受信しないようにする。
-- （schedule_blocked_slots は block/unblock の低頻度書き込みのため FULL の追加コストは無視できる）

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'schedule_blocked_slots'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_blocked_slots;
    RAISE NOTICE 'schedule_blocked_slots を supabase_realtime publication に追加しました';
  ELSE
    RAISE NOTICE 'schedule_blocked_slots は既に publication に存在するか、publication 自体が存在しません';
  END IF;
END $$;

ALTER TABLE public.schedule_blocked_slots REPLICA IDENTITY FULL;
