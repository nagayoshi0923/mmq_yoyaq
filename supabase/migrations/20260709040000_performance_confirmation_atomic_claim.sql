-- =============================================================================
-- 開催決定メール(performance_confirmation)の二重送信・queued 詰まりを
-- 「送信前の原子的 claim」で根絶する (#327, follow-up of #323/#325)
--
-- 背景:
--   PR #325 で追加した uq_email_logs_performance_confirmation_sent は
--   「送信成功ステータスのログを (schedule_event_id, lower(to_email)) ごとに1件」に
--   制限するだけだった。しかし送信ガード(read)→INSERT(queued)→Resend送信→UPDATE(sent)
--   が非原子的なため、
--     (A) 同時実行の2runが両方ガードを通過し、両方が Resend を呼んで顧客に2通届く
--     (B) 敗者の UPDATE→sent がユニーク制約違反で失敗するが updateEmailLog が
--         エラーを握りつぶすため、その行が queued のまま残り再送ループの温床になる
--   という2つの穴が残っていた。
--
-- 対策:
--   ユニークインデックスの対象を queued を含む「active(送信中/送信済み)」状態に拡張し、
--   INSERT(queued) 自体を DB レベルの原子的 claim にする。claim_* RPC で
--   「queued を1行 INSERT できた run だけが送信権を持つ」ようにし、
--   ユニーク制約違反で INSERT できなかった run は送信せずスキップする。
--   これにより実際の Resend 呼び出しが最大1回に制限され、UPDATE→sent は自分の行の
--   更新なので二度とユニーク制約に衝突しない。
--
--   クラッシュ等で送信前に残った古い queued 行は 15 分で失効(=failed)させ、
--   再 claim 可能にすることで永久詰まりを防ぐ。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.claim_performance_confirmation_email(uuid, text, uuid, text, text, text);
--   DROP INDEX IF EXISTS public.uq_email_logs_performance_confirmation_active;
--   -- 必要なら旧 index を再作成:
--   -- CREATE UNIQUE INDEX uq_email_logs_performance_confirmation_sent ...
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. 既存データのクリーンアップ
--    queued を active 集合に含める前に、同一キーで active 行が複数残っている
--    状態を解消しておかないと UNIQUE INDEX 作成が失敗する。
-- ---------------------------------------------------------------------------

-- 0-1. 同一(event, email)に送信成功系の行があるのに queued のまま詰まっている行を
--       failed に倒す（= (B) の残骸を解消）。
UPDATE public.email_logs AS q
   SET status = 'failed',
       error_message = COALESCE(q.error_message, 'superseded queued row (atomic-claim migration)')
 WHERE q.email_type = 'performance_confirmation'
   AND q.schedule_event_id IS NOT NULL
   AND q.status = 'queued'
   AND EXISTS (
     SELECT 1
       FROM public.email_logs AS o
      WHERE o.email_type = 'performance_confirmation'
        AND o.schedule_event_id = q.schedule_event_id
        AND lower(o.to_email) = lower(q.to_email)
        AND o.id <> q.id
        AND o.status IN (
          'sent', 'delivered', 'opened', 'clicked',
          'bounced', 'complained', 'delivery_delayed'
        )
   );

-- 0-2. 送信成功系の行が無いまま queued が複数残っているキーは、最新1件だけ残して
--       他を failed に倒す。
UPDATE public.email_logs
   SET status = 'failed',
       error_message = COALESCE(error_message, 'duplicate queued row (atomic-claim migration)')
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              row_number() OVER (
                PARTITION BY schedule_event_id, lower(to_email)
                ORDER BY created_at DESC, id DESC
              ) AS rn
         FROM public.email_logs
        WHERE email_type = 'performance_confirmation'
          AND schedule_event_id IS NOT NULL
          AND status = 'queued'
     ) t
    WHERE t.rn > 1
 );

-- ---------------------------------------------------------------------------
-- 1. ユニークインデックスを active 状態(queued を含む)に張り替える
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_email_logs_performance_confirmation_sent;

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_logs_performance_confirmation_active
  ON public.email_logs (schedule_event_id, lower(to_email))
  WHERE email_type = 'performance_confirmation'
    AND schedule_event_id IS NOT NULL
    AND status IN (
      'queued',
      'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'complained', 'delivery_delayed'
    );

-- ---------------------------------------------------------------------------
-- 2. 原子的 claim RPC
--    queued を1行 INSERT できたら送信権あり(=id を返す)。
--    既に active 行があってユニーク制約違反になったら NULL を返す(=送信済み/送信中)。
--    送信前に残った 15 分以上前の queued は失効させ再 claim を許す。
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_performance_confirmation_email(
  p_schedule_event_id uuid,
  p_to_email          text,
  p_organization_id   uuid,
  p_subject           text,
  p_body_html         text,
  p_body_text         text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- 2-1. 送信前に放置された古い queued 行を failed に倒し、送信権を解放する。
  --      (Edge Function がクラッシュ/タイムアウトして sent/failed 更新に到達しなかったケース)
  UPDATE public.email_logs
     SET status = 'failed',
         error_message = COALESCE(error_message, 'stale queued claim released')
   WHERE email_type = 'performance_confirmation'
     AND schedule_event_id = p_schedule_event_id
     AND lower(to_email) = lower(p_to_email)
     AND status = 'queued'
     AND created_at < now() - interval '15 minutes';

  -- 2-2. queued を1行 INSERT して claim する。ユニーク制約に衝突したら
  --      別 run が送信権を保持済み(送信中 or 送信済み)なので NULL を返す。
  BEGIN
    INSERT INTO public.email_logs (
      organization_id, schedule_event_id, email_type,
      to_email, subject, body_html, body_text, provider, status
    ) VALUES (
      p_organization_id, p_schedule_event_id, 'performance_confirmation',
      p_to_email, p_subject, p_body_html, p_body_text, 'resend', 'queued'
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      v_id := NULL;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_performance_confirmation_email(uuid, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_performance_confirmation_email(uuid, text, uuid, text, text, text) TO service_role;
