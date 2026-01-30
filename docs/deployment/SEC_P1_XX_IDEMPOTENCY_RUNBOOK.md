## SEC-P1-XX（必須）: 冪等性（予約作成/メール送信）検証 Runbook

目的: 通信断・リトライ・二重クリックがあっても、以下が二重に起きないことを確認する。

- 予約が二重作成されない（同一 `reservation_number` で1件に収束）
- 予約確認メールが二重送信されない（同一 `reservation_id` で1回に収束）

### 1) 予約作成の冪等性（フロント）

- 対象: `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`
- 方式: 同一フォーム送信の間は `reservation_number` を固定して再送する

**確認方法（手動）**:
- 予約確定ボタン押下直後にネットワークを切断（またはブラウザでリクエスト失敗を発生）し、再度送信する
- DB上で `reservation_number` が同じ予約が複数作られていないことを確認する

### 2) メール送信の冪等性（Edge Function + Queue）

- 対象: `supabase/functions/send-booking-confirmation`
- 方式:
  - `booking_email_queue` を `reservation_id + email_type` で一意化
  - `completed` の場合は送信をスキップ

**確認方法（SQL）**:
- `docs/deployment/sql/SEC_P1_XX_ts0_check_booking_email_queue_unique.sql` を実行して UNIQUE が存在することを確認

