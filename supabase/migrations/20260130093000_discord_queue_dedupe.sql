-- =============================================================================
-- 20260130093000: Discord通知キューの重複送信対策（冪等化）
-- =============================================================================
--
-- 目的:
-- - Edge Function / DB Webhook は at-least-once で同一イベントが複数回発火し得るため、
--   同じ通知が繰り返し送られてしまう事故をDB側で防止する。
--
-- 方針:
-- - discord_notification_queue に「同一通知キー」の UNIQUE 制約（ユニークインデックス）を追加
-- - 既存データに重複がある場合は、最新1件を残して削除してから制約を追加
--
-- 同一通知キー:
-- - organization_id
-- - notification_type
-- - reference_id
-- - webhook_url（送信先。Bot送信の場合は Discord API URL を入れる）
--
-- NOTE:
-- - reference_id が NULL の行は UNIQUE 的に重複判定されない（NULLは別扱い）
--   → 本対策を効かせたい通知は reference_id を必ず入れる
--
-- =============================================================================

BEGIN;

-- 1) 既存重複を削除（最新1件を残す）
WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY organization_id, notification_type, reference_id, webhook_url
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.discord_notification_queue
  WHERE reference_id IS NOT NULL
)
DELETE FROM public.discord_notification_queue q
USING ranked r
WHERE q.ctid = r.ctid
  AND r.rn > 1;

-- 2) ユニークインデックスを追加（冪等化の要）
CREATE UNIQUE INDEX IF NOT EXISTS uq_discord_notification_queue_dedupe
  ON public.discord_notification_queue(organization_id, notification_type, reference_id, webhook_url)
  WHERE reference_id IS NOT NULL;

COMMIT;

