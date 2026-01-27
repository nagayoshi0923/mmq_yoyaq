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

#### 実行確認

```sql
-- RPC関数が更新されたか確認
SELECT proname, proargtypes 
FROM pg_proc 
WHERE proname = 'cancel_reservation_with_lock';

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
- [ ] エラーログを確認（Supabase Dashboard → Logs）

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

