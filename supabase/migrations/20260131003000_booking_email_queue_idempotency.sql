-- =============================================================================
-- 20260131003000: booking_email_queue の冪等性強化（SEC-P1-XX）
-- =============================================================================
--
-- 目的:
-- - 予約確認メール等がリトライ/二重送信で複数回送られる事故を防ぐ
-- - booking_email_queue を「同一 reservation_id + email_type で1行」に正規化
--
-- 方針:
-- - 既存重複があれば古い方以外を削除（保守的に最古を残す）
-- - UNIQUE INDEX を追加
--
-- =============================================================================

-- 1) 重複の除去（存在する場合のみ）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_email_queue'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY reservation_id, email_type
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.booking_email_queue
    )
    DELETE FROM public.booking_email_queue q
    USING ranked r
    WHERE q.id = r.id
      AND r.rn > 1;
  END IF;
  -- 2) UNIQUE 制約（reservation_id + email_type）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_email_queue') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS booking_email_queue_reservation_type_unique
      ON public.booking_email_queue (reservation_id, email_type);
  END IF;
END $$;

