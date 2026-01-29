# PR #4 デプロイチェックリスト

## 🚨 重要: この順序で実施してください

### ステップ1: データベースマイグレーション適用

#### Supabase Dashboard で実行

1. https://supabase.com/dashboard にアクセス
2. 本番プロジェクトを選択
3. SQL Editor を開く
4. 以下のファイルを順番に実行：

**① 007_fix_cancel_reservation_nullable_customer.sql**
```sql
-- このファイルの内容をコピー＆ペースト
-- RPC関数の修正（customer_id = NULL 許可）
```

**② 008_waitlist_notification_retry_queue.sql**
```sql
-- このファイルの内容をコピー＆ペースト
-- リトライキューテーブル作成
```

**③ SEC-P0-02（必須）: 予約作成RPCの安全化**
```sql
-- supabase/migrations/20260130190000_harden_create_reservation_with_lock_server_pricing.sql
-- 旧RPC(create_reservation_with_lock)を互換維持のまま安全化（料金/日時をサーバー確定）
```

**④ SEC-P0-02（推奨）: v2 RPC 追加**
```sql
-- supabase/migrations/20260130_create_reservation_with_lock_v2.sql
-- create_reservation_with_lock_v2 を追加（v2優先→旧RPCフォールバックで段階移行）
```

#### 実行確認

```sql
-- RPC関数が更新されたか確認
SELECT proname, proargtypes 
FROM pg_proc 
WHERE proname = 'cancel_reservation_with_lock';

-- SEC-P0-02: v2 RPCが存在するか確認（1行返ればOK）
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_reservation_with_lock_v2';

-- リトライキューテーブルが作成されたか確認
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'waitlist_notification_queue';
```

---

### ステップ2: プレビュー環境で動作確認

#### テスト項目

- [ ] 管理画面にログインできる
- [ ] 予約一覧が表示される
- [ ] スタッフ予約をキャンセル（customer_id = NULL のテスト）
  - エラーが出ないこと
  - 在庫が正しく返却されること
- [ ] 顧客予約をキャンセル
  - エラーが出ないこと
  - 在庫が正しく返却されること
  - キャンセル確認メールが送信されること
- [ ] コンソールエラーがないこと

#### 在庫確認SQL

```sql
-- キャンセル前後で在庫を確認
SELECT 
  id,
  scenario,
  date,
  current_participants,
  max_participants
FROM schedule_events
WHERE id = 'キャンセルした予約の公演ID';

-- 予約テーブルとの整合性確認
SELECT 
  se.id,
  se.current_participants as stored,
  COALESCE(SUM(r.participant_count), 0) as actual,
  se.current_participants - COALESCE(SUM(r.participant_count), 0) as diff
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id 
  AND r.status IN ('pending', 'confirmed', 'gm_confirmed')
WHERE se.id = 'キャンセルした予約の公演ID'
GROUP BY se.id, se.current_participants;
-- diff = 0 であるべき
```

---

### ステップ3: PRマージ

プレビュー環境で問題なければ：

```bash
# GitHub PR画面で "Merge pull request" をクリック
# → 本番環境に自動デプロイ
```

---

### ステップ4: 本番環境で最終確認

- [ ] 本番環境でログイン
- [ ] 予約キャンセルが正常に動作
- [ ] **SEC-P0-02 改ざんテスト（ROLLBACK付き）を実施**（Runbook）
  - [ ] `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md` の「ポストデプロイ検証」をSQL Editorで実行
- [ ] エラーログを確認（Supabase Dashboard → Logs）

---

---

### ステップ5: 在庫整合性チェックの定期実行設定

在庫データ（`current_participants`）の不整合を自動検出・修正するために、定期実行を設定します。

#### オプション A: pg_cron を使用（推奨）

Supabase Dashboard で SQL Editor を開き、以下を実行：

```sql
-- pg_cron 拡張が有効か確認
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- 有効でない場合は有効化
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 毎日 5:00 AM JST（UTC 20:00）に在庫整合性チェックを実行
SELECT cron.schedule(
  'daily-inventory-consistency-check',
  '0 20 * * *',  -- UTC 20:00 = JST 05:00
  $$SELECT run_inventory_consistency_check();$$
);

-- ジョブが登録されたか確認
SELECT * FROM cron.job;
```

#### オプション B: Vercel Cron Jobs を使用

`vercel.json` に以下を追加：

```json
{
  "crons": [
    {
      "path": "/api/check-inventory-consistency",
      "schedule": "0 5 * * *"
    }
  ]
}
```

#### 動作確認

```sql
-- 手動で在庫整合性チェックを実行
SELECT run_inventory_consistency_check();

-- 結果を確認
SELECT * FROM inventory_consistency_logs ORDER BY checked_at DESC LIMIT 5;
```

不整合が見つかった場合はDiscord通知が飛びます。

---

## ⚠️ ロールバック手順（問題が発生した場合）

### データベースのロールバック

```sql
-- 007のロールバック: RPC関数を元に戻す
CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,  -- NOT NULL に戻す
  p_cancellation_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_count INTEGER;
BEGIN
  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_count
  FROM reservations
  WHERE id = p_reservation_id
    AND customer_id = p_customer_id  -- 必須に戻す
    AND status != 'cancelled'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;
  
  UPDATE schedule_events
  SET current_participants = GREATEST(current_participants - v_count, 0)
  WHERE id = v_event_id;
  
  UPDATE reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason)
  WHERE id = p_reservation_id;
  
  RETURN TRUE;
END;
$$;

-- 008のロールバック: リトライキューテーブル削除
DROP TABLE IF EXISTS waitlist_notification_queue CASCADE;
```

### フロントエンドのロールバック

```bash
# mainブランチを前のコミットに戻す
git revert HEAD~7..HEAD
git push origin main
```

---

## 📞 問題発生時の連絡先

- Supabase エラーログ: https://supabase.com/dashboard/project/_/logs
- Vercel デプロイログ: https://vercel.com/nagayoshi0923s-projects/mmq-yoyaq/deployments

