# メール使用シーン一覧と実装状況

## 📧 概要

このドキュメントは、MMQシステムでメールまたは通知を使用するすべてのシーンをリストアップし、実装状況と今後の対応を管理します。

---

## 🔐 1. 認証関連メール（Supabase Auth SMTP）

### 1.1 パスワードリセットメール
**トリガー**: ログイン画面で「パスワードを忘れた場合」をクリック
**実装場所**: `src/components/auth/LoginForm.tsx` (L24-32)
**送信方法**: Supabase Auth → Resend SMTP
**実装状況**: ✅ 実装済み
**メールアドレス**: `noreply@mmq.game`

**送信内容**:
- 件名: パスワードリセット
- 本文: パスワードリセット用リンク
- リンク先: `/#reset-password`

**設定**:
```typescript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/#reset-password`
})
```

**受信後の処理**: `src/pages/ResetPassword.tsx`

---

### 1.2 サインアップ確認メール
**トリガー**: ログイン画面で新規アカウント作成
**実装場所**: `src/components/auth/LoginForm.tsx` (L33-42)
**送信方法**: Supabase Auth → Resend SMTP
**実装状況**: ✅ 実装済み
**メールアドレス**: `noreply@mmq.game`

**送信内容**:
- 件名: メールアドレスの確認
- 本文: メールアドレス確認用リンク
- リンク先: アカウント有効化

**設定**:
```typescript
await supabase.auth.signUp({
  email,
  password
})
```

---

### 1.3 スタッフ招待メール
**トリガー**: 管理画面でスタッフを招待
**実装場所**: 
- `src/pages/StaffManagement/hooks/useStaffInvitation.ts`
- `supabase/functions/invite-staff/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ 実装済み
**メールアドレス**: `noreply@mmq.game`

**送信内容**:
- 件名: スタッフ招待
- 本文: パスワード設定リンク
- リンク先: `/#set-password`

**受信後の処理**: `src/pages/SetPassword.tsx`

**関連ドキュメント**: `STAFF_INVITE_SETUP.md`

---

## 🎫 2. 予約関連メール（Resend API）

### 2.1 予約確認メール（通常予約）
**トリガー**: 顧客が公演予約を完了
**実装場所**: 
- `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`
- `supabase/functions/send-booking-confirmation/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ 実装済み
**メールアドレス**: ❌ `booking@mmq.example.com`（要変更 → `noreply@mmq.game`）

**送信内容**:
- 件名: `【予約完了】{シナリオ名} - {日付}`
- 本文: 
  - 予約番号
  - シナリオ名
  - 日時・会場
  - 参加人数
  - 料金
  - 重要事項（キャンセルポリシー、来場時刻など）

**テンプレート**: HTMLメール + プレーンテキスト

**TODO**: ✅ メールアドレスを `noreply@mmq.game` に統一

---

### 2.2 予約確認メール（貸切予約）
**トリガー**: 貸切予約リクエストが承認された時
**実装場所**: 
- `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts`
- `supabase/functions/send-private-booking-confirmation/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**:
- 件名: `【貸切予約確定】{シナリオ名} - {日付}`
- 本文:
  - 予約番号
  - 確定した店舗・日時
  - GMアサイン情報
  - 料金
  - 特記事項

**完了した変更**:
- ✅ Edge Function作成: `send-private-booking-confirmation`
- ✅ 承認処理にメール送信を追加
- ✅ メールテンプレート作成

---

### 2.3 予約キャンセル確認メール
**トリガー**: 予約がキャンセルされた時
**実装場所**: 
- `src/lib/reservationApi.ts` (cancel関数)
- `src/hooks/useEventOperations.ts` (handleConfirmCancel)
- `supabase/functions/send-cancellation-confirmation/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**:
- 件名: `【予約キャンセル】{シナリオ名} - {日付}` （顧客都合）
- 件名: `【公演中止】{シナリオ名} - {日付}` （店舗都合）
- 本文:
  - 予約番号
  - キャンセルされた予約内容
  - キャンセル料金（該当する場合）
  - 再予約のご案内

**関連機能**:
- 顧客都合のキャンセル
- 店舗都合のキャンセル（公演中止）
- 貸切リクエストの却下（別Function）

**完了した変更**:
- ✅ Edge Function作成: `send-cancellation-confirmation`
- ✅ キャンセル処理にメール送信を追加
- ✅ キャンセル料金計算ロジック実装（24時間前）
- ✅ メールテンプレート作成（顧客都合 / 店舗都合で分ける）

---

### 2.4 貸切リクエスト却下メール
**トリガー**: 貸切リクエストが却下された時
**実装場所**: 
- `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts` (handleRejectConfirm)
- `supabase/functions/send-private-booking-rejection/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**:
- 件名: `【貸切リクエスト】{シナリオ名}のお申し込みについて`
- 本文:
  - 却下理由（カスタムメッセージ）
  - 希望していた候補日時
  - 代替案の提案
  - 通常公演のご案内

**完了した変更**:
- ✅ Edge Function作成: `send-private-booking-rejection`
- ✅ 却下処理にメール送信を追加
- ✅ メールテンプレート作成

---

### 2.5 予約変更確認メール
**トリガー**: 予約内容が変更された時
**実装場所**: 
- `src/lib/reservationApi.ts` (update関数)
- `supabase/functions/send-booking-change-confirmation/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**:
- 件名: `【予約内容変更】{シナリオ名} - {予約番号}`
- 本文:
  - 予約番号
  - 変更内容（変更前→変更後）
  - 変更後の予約内容
  - 差額料金（該当する場合）

**使用方法**:
```typescript
// reservationApi.update の第3引数に true を指定
await reservationApi.update(reservationId, {
  participant_count: 5,
  total_price: 15000
}, true) // sendEmail=true でメール送信
```

**完了した変更**:
- ✅ Edge Function作成: `send-booking-change-confirmation`
- ✅ 更新処理にメール送信を追加（オプション）
- ✅ 変更検知ロジック実装
- ✅ メールテンプレート作成

---

### 2.6 リマインダーメール
**トリガー**: スケジュール設定で手動送信 / 自動送信（3日前）
**実装場所**: 
- `src/pages/Settings/pages/EmailSettings.tsx` （手動送信）
- `supabase/functions/send-reminder-emails/index.ts`
- `supabase/functions/auto-send-reminder-emails/index.ts` （自動送信）
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**（手動送信 + 自動送信）
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**:
- 件名: `【リマインド】{シナリオ名} - {日付}`
- 本文:
  - 公演日時のリマインド
  - 会場情報
  - 持ち物・注意事項
  - 当日連絡先

**テンプレート設定**: 管理画面で編集可能

**自動送信設定**:
- Cron Jobs: 毎日 9:00 AM UTC（日本時間 18:00）
- 送信タイミング: 公演の3日前
- 詳細: `REMINDER_EMAIL_CRON_SETUP.md` を参照

**完了した変更**: 
- ✅ メールアドレスを `noreply@mmq.game` に統一
- ✅ 自動送信機能の実装（3日前）
- ✅ Cron Jobsの設定

---

### 2.7 顧客への一斉メール送信
**トリガー**: スケジュール詳細画面で選択した予約者にメール送信
**実装場所**: 
- `src/components/schedule/PerformanceModal.tsx` (L1314-1377)
- `supabase/functions/send-email/index.ts`
**送信方法**: Edge Function → Resend API
**実装状況**: ✅ **実装済み**
**メールアドレス**: ✅ `noreply@mmq.game`

**送信内容**: カスタムメッセージ（件名・本文を手動入力）

**完了した変更**:
- ✅ send-emailをResend APIに移行済み
- ✅ メールアドレスを`noreply@mmq.game`に統一
- ✅ 顧客メールアドレス取得処理を実装（customersテーブルとjoin）
- ✅ UIを完成（送信件数表示、バリデーション）

---

## 👥 3. スタッフ関連メール

### 3.1 スタッフ招待メール
**→ セクション1.3を参照**

---

### 3.2 シフト関連メール
**実装状況**: ❌ **未実装**（Discordで代替）

**代替手段**: Discord通知（実装済み）
- シフト募集通知
- シフト提出完了通知
- 未提出者リマインダー

**参考ドキュメント**: `DISCORD_SHIFT_NOTIFICATION_SETUP.md`

**将来的にメール化する場合のシーン**:
- シフト募集開始通知
- シフト提出期限リマインダー
- シフト確定通知

---

## 💬 4. 通知（Discord）- メールの代替

### 4.1 貸切リクエスト通知（GM向け）
**トリガー**: 貸切予約リクエストが作成された時
**実装場所**: `supabase/functions/notify-private-booking-discord/index.ts`
**送信方法**: Database Webhook → Edge Function → Discord API
**実装状況**: ✅ 実装済み
**通知先**: 各GMの個別Discordチャンネル

**通知内容**:
- 予約リクエスト詳細
- 顧客情報
- 希望日程
- 参加人数

**関連ドキュメント**: 
- `DISCORD_NOTIFICATION_TROUBLESHOOTING.md`
- `DISCORD_CHANNEL_SETUP.md`

---

### 4.2 シフト募集通知（スタッフ向け）
**トリガー**: 手動またはCron Job
**実装場所**: `supabase/functions/notify-shift-request-discord/index.ts`
**送信方法**: Edge Function → Discord API
**実装状況**: ✅ 実装済み
**通知先**: シフト通知用Discordチャンネル

---

### 4.3 シフト提出完了通知（管理者向け）
**トリガー**: スタッフがシフトを提出
**実装場所**: `supabase/functions/notify-shift-submitted-discord/index.ts`
**送信方法**: Edge Function → Discord API
**実装状況**: ✅ 実装済み
**通知先**: シフト通知用Discordチャンネル

---

### 4.4 未提出者リマインダー（スタッフ向け）
**トリガー**: 締切3日前
**実装場所**: `supabase/functions/notify-shift-reminder-discord/index.ts`
**送信方法**: Edge Function → Discord API
**実装状況**: ✅ 実装済み
**通知先**: シフト通知用Discordチャンネル

---

## 📊 5. 管理者向けレポートメール

### 5.1 売上レポート（未実装）
**トリガー**: 月末・週末など定期的
**実装状況**: ❌ **未実装**

**必要な内容**:
- 期間中の総売上
- 公演数
- 予約件数
- キャンセル率
- 人気シナリオランキング

**TODO**:
- [ ] Edge Function作成: `send-sales-report`
- [ ] レポート生成ロジック実装
- [ ] Cron Jobsの設定
- [ ] メールテンプレート作成

---

### 5.2 予約状況アラート（未実装）
**トリガー**: 予約率が低い / 満席間近など
**実装状況**: ❌ **未実装**

**必要な内容**:
- 低予約率の公演リスト
- 満席間近の公演リスト
- 推奨アクション

**TODO**:
- [ ] アラート条件の定義
- [ ] Edge Function作成
- [ ] メールテンプレート作成

---

### 5.3 システムエラー通知（未実装）
**トリガー**: 重大なエラー発生時
**実装状況**: ❌ **未実装**

**必要な内容**:
- エラー内容
- 発生時刻
- 影響範囲
- 推奨対応

**TODO**:
- [ ] エラー監視システムの構築
- [ ] Edge Function作成
- [ ] メールテンプレート作成

---

## 📋 実装優先度と今後のタスク

### ✅ 完了（中優先まで全て実装済み）

1. **メールアドレスの統一とResend移行** ✅
   - [x] `send-booking-confirmation`: `booking@mmq.example.com` → `noreply@mmq.game`
   - [x] `send-reminder-emails`: `booking@mmq.example.com` → `noreply@mmq.game`
   - [x] `send-email`: AWS SES → Resend API + `noreply@mmq.game`
   - [x] 再デプロイ準備完了（デプロイスクリプト作成）

2. **Supabase Auth SMTP設定** ✅
   - [x] パスワードリセットメールテンプレート整備
   - [x] サインアップ確認メールテンプレート整備
   - [x] Magic Link テンプレート整備
   - [x] Change Email Address テンプレート整備
   - [x] Invite User テンプレート整備
   - [x] Reauthentication テンプレート整備

3. **予約キャンセル確認メール** ✅
   - [x] Edge Function作成（`send-cancellation-confirmation`）
   - [x] キャンセル処理に統合
   - [x] テンプレート作成（顧客都合/店舗都合）
   - [x] キャンセル料金計算実装

4. **貸切予約確定メール** ✅
   - [x] Edge Function作成（`send-private-booking-confirmation`）
   - [x] 承認処理に統合
   - [x] テンプレート作成

5. **貸切リクエスト却下メール** ✅
   - [x] Edge Function作成（`send-private-booking-rejection`）
   - [x] 却下処理に統合
   - [x] テンプレート作成

6. **予約変更確認メール** ✅
   - [x] 変更検知ロジック実装
   - [x] Edge Function作成（`send-booking-change-confirmation`）
   - [x] テンプレート作成

7. **リマインダーメール自動送信** ✅
   - [x] Cron Jobs用 Edge Function作成（`auto-send-reminder-emails`）
   - [x] 送信タイミング設定（3日前）
   - [x] Cron設定ガイド作成

8. **顧客への一斉メール送信機能の完成** ✅
   - [x] Resendへの移行（完了）
   - [x] 顧客メールアドレス取得処理（customersテーブルとjoin）
   - [x] UIの完成（送信件数表示、バリデーション）

### 🔴 デプロイ待ち

- [ ] 全 Edge Functions のデプロイ（`./deploy-email-functions.sh`）
- [ ] Cron Jobs の設定（`auto-send-reminder-emails`）
- [ ] 本番環境でのテスト

### ⚪ 低優先（余裕があれば）

9. **管理者向けレポートメール**
   - [ ] 売上レポート
   - [ ] 予約状況アラート

10. **システムエラー通知**
    - [ ] エラー監視システム

---

## 📝 メールテンプレート管理

### 現在のテンプレート

| メール種類 | 編集可能 | 管理場所 |
|---------|---------|---------|
| 予約確認メール | ❌ | Edge Function内にハードコード |
| リマインダーメール | ✅ | `email_settings`テーブル |
| パスワードリセット | ✅ | Supabase Dashboard → Auth → Email Templates |
| サインアップ確認 | ✅ | Supabase Dashboard → Auth → Email Templates |
| スタッフ招待 | ❌ | Edge Function内にハードコード |

### テンプレート変数

共通で使用可能な変数:
- `{customer_name}` - 顧客名
- `{scenario_title}` - シナリオ名
- `{date}` - 開催日
- `{time}` - 開催時刻
- `{venue}` - 会場名
- `{participants}` - 参加人数
- `{total_price}` - 料金
- `{reservation_number}` - 予約番号

---

## 🔧 技術スタック

### メール送信

| 方法 | 用途 | 設定場所 |
|-----|------|---------|
| **Resend API** | すべてのメール送信（予約確認、リマインダー、スタッフ招待、一斉送信など） | Edge Functions（`RESEND_API_KEY`） |
| **Resend SMTP** | パスワードリセット、サインアップ確認 | Supabase Auth SMTP設定 |
| ~~AWS SES~~ | （非推奨・完全に廃止） | - |

### 通知送信

| 方法 | 用途 | 設定場所 |
|-----|------|---------|
| **Discord API** | スタッフ向け通知、管理者向け通知 | Edge Functions（`DISCORD_BOT_TOKEN`） |

---

## 📚 関連ドキュメント

### セットアップガイド
- **`RESEND_QUICK_SETUP.md`** - パスワードリセットメール 5分セットアップ
- **`EMAIL_SETUP.md`** - 完全なメール送信機能セットアップガイド
- **`RESEND_PASSWORD_RESET_SETUP.md`** - パスワードリセット詳細ガイド
- **`STAFF_INVITE_SETUP.md`** - スタッフ招待機能セットアップ

### Discord通知
- **`DISCORD_NOTIFICATION_QUICK_SETUP.md`** - Discord通知セットアップ
- **`DISCORD_SHIFT_NOTIFICATION_SETUP.md`** - シフト通知セットアップ
- **`DISCORD_CHANNEL_SETUP.md`** - チャンネルID設定方法
- **`DISCORD_NOTIFICATION_TROUBLESHOOTING.md`** - トラブルシューティング

### 技術ドキュメント
- **`deploy-functions.sh`** - Edge Functionsデプロイスクリプト
- **`deploy-single-function.sh`** - 個別デプロイスクリプト

---

## 🆘 トラブルシューティング

### メールが届かない場合

1. **Resend Dashboard で送信ログを確認**
   - https://resend.com/emails

2. **Supabase Logs でエラーを確認**
   - https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/logs

3. **迷惑メールフォルダを確認**

4. **SMTP設定を確認**（Auth関連メールの場合）
   - Supabase Dashboard → Settings → Auth → SMTP Settings

5. **ドメイン認証を確認**
   - Resend Dashboard → Domains → `mmq.game` が Verified

詳細: `EMAIL_SETUP.md` のトラブルシューティングセクション

---

## 📅 更新履歴

- **2025-10-30**: 初版作成 - 全メール使用シーンの洗い出しと実装状況の整理

