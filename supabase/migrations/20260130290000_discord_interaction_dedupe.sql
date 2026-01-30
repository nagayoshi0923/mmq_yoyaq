-- =============================================================================
-- 20260130290000: Discord interaction のリプレイ/連打対策（冪等化）
-- =============================================================================
--
-- 背景:
-- - Discord Interactions は at-least-once / 再送が発生し得る
-- - 署名検証していても「同じ interaction を二重処理」すると状態が揺れる（特に toggle 系）
--
-- 方針:
-- - interaction_id を UNIQUE にして、同一interactionは1回だけ処理する（冪等化）
-- - 古い行のクリーンアップは必要に応じて別途（運用）
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.discord_interaction_dedupe (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  interaction_id TEXT NOT NULL,
  handler TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interaction_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_interaction_dedupe_created_at
  ON public.discord_interaction_dedupe (created_at DESC);

COMMENT ON TABLE public.discord_interaction_dedupe IS
'Discord Interactions の二重処理防止用（interaction_id を UNIQUE で冪等化）。';

