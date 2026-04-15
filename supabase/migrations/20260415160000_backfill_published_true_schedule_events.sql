-- ====================================================================
-- 緊急修正: schedule_events.published のバックフィル
--
-- 問題:
--   20260415140000 で schedule_events_public ビューに published=true フィルターを追加したが、
--   published カラムのデフォルト値が false のため、既存イベントが全て非表示になった。
--   管理画面で「公開」設定をしていなかったイベントもすべて hidden 扱いになった。
--
-- 修正方針:
--   1. キャンセルされていない open/offsite イベントを published=true にバックフィル
--   2. schedule_events.published のデフォルトを true に変更
--      （管理画面から作成したイベントは基本的に公開対象のため）
--   3. 明示的に非公開にしたいイベントは published=false を手動設定する運用とする
-- ====================================================================

-- 1. published カラムのデフォルトを true に変更（先に実施してロック競合を回避）
--    今後新規作成されるイベントはデフォルトで公開扱い
ALTER TABLE public.schedule_events
  ALTER COLUMN published SET DEFAULT true;

-- 2. 既存のすべての非キャンセル公演を published=true にバックフィル
--    （管理画面から作成したイベントは基本的に公開対象のため）
UPDATE public.schedule_events
SET published = true
WHERE (published = false OR published IS NULL)
  AND is_cancelled IS DISTINCT FROM true;

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.schedule_events
  WHERE published = true;

  RAISE NOTICE '✅ 修正完了: schedule_events.published バックフィル';
  RAISE NOTICE '  現在 published=true のイベント数: %', updated_count;
  RAISE NOTICE '  DEFAULT を false → true に変更済み';
END $$;
