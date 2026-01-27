# Supabase マイグレーション適用ガイド

## 🎯 目的
PR #4 のデータベースマイグレーションを本番環境に適用する

---

## 📋 適用するマイグレーション

1. **007_fix_cancel_reservation_nullable_customer.sql**
   - RPC関数修正（customer_id = NULL 許可）
   - トランザクション保証 + FOR UPDATE ロック

2. **008_waitlist_notification_retry_queue.sql**
   - リトライキューテーブル作成
   - 3回まで自動リトライ

---

## 🚀 手順

### ステップ1: Supabase にログイン

```bash
supabase login
```

ブラウザが開くので、Supabaseアカウントでログインしてください。

---

### ステップ2: 本番プロジェクトにリンク

**Project Ref を確認**:
1. https://supabase.com/dashboard にアクセス
2. プロジェクトを選択
3. Settings → General → Reference ID をコピー

**リンクコマンド実行**:
```bash
supabase link --project-ref <your-project-ref>
```

例:
```bash
supabase link --project-ref cznpcewciwywcqcxktba
```

データベースパスワードを求められるので入力してください。

---

### ステップ3: マイグレーションを適用

```bash
supabase db push
```

**確認メッセージ**:
```
Do you want to push these migrations to the remote database?
- 007_fix_cancel_reservation_nullable_customer.sql
- 008_waitlist_notification_retry_queue.sql
```

→ `y` を入力

---

### ステップ4: 適用結果を確認

```bash
# RPC関数が更新されたか確認
supabase db remote-commit --list

# または、SQL Editorで直接確認
```

**確認SQL**:
```sql
-- RPC関数が存在するか確認
SELECT 
  proname, 
  pronargs,
  pg_get_function_arguments(oid) as args
FROM pg_proc 
WHERE proname = 'cancel_reservation_with_lock';

-- リトライキューテーブルが作成されたか確認
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'waitlist_notification_queue';
```

---

## ⚠️ トラブルシューティング

### エラー1: "No linked project found"

```bash
# プロジェクトリンクを再実行
supabase link --project-ref <your-project-ref>
```

### エラー2: "Migration already applied"

→ 既に適用済みなので問題なし

### エラー3: "Database connection failed"

```bash
# データベースパスワードが間違っている可能性
# Settings → Database → Reset Database Password
```

---

## ✅ 完了後のチェックリスト

- [ ] `supabase db push` が成功した
- [ ] RPC関数が更新されたことを確認（SQL実行）
- [ ] リトライキューテーブルが作成されたことを確認（SQL実行）
- [ ] PRをマージ
- [ ] 本番環境で予約キャンセルをテスト

---

## 🔄 ロールバック（問題が発生した場合）

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

---

## 📞 サポート

問題が発生した場合:
1. Supabase Dashboard → Logs でエラーを確認
2. ロールバックSQLを実行
3. PRをクローズしてmainブランチに戻す

