# MMQ 機能詳細

**最終更新**: 2025-12-30

各機能の目的・仕組み・注意点を説明します。

> 📖 **詳細ドキュメント**: 各機能のより詳しい説明は [features/](./features/) フォルダを参照してください。

---

## 目次

1. [予約機能](#1-予約機能)
2. [貸切予約機能](#2-貸切予約機能)
3. [スケジュール管理](#3-スケジュール管理)
4. [シフト管理](#4-シフト管理)
5. [通知機能](#5-通知機能)
6. [マルチテナント](#6-マルチテナント)
7. [ライセンス管理](#7-ライセンス管理)

---

## 1. 予約機能

> 📖 詳細: [features/reservation/](./features/reservation/)

### 概要
顧客がオンラインでマーダーミステリー公演を予約する機能。

### フロー

```
顧客が予約サイトにアクセス
    ↓
シナリオ一覧 or カレンダーから公演を選択
    ↓
参加人数・参加者情報を入力
    ↓
予約確定
    ↓
確認メールが送信される
    ↓
前日にリマインダーメールが送信される
```

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `PublicBookingTop/` | 予約サイトトップ（シナリオ一覧・カレンダー） |
| `ScenarioDetailPage/` | シナリオ詳細・予約フォーム |
| `BookingConfirmation/` | 予約確認画面 |

### 関連テーブル

| テーブル | 役割 |
|---------|------|
| `schedule_events` | 予約可能な公演枠 |
| `reservations` | 予約情報 |
| `customers` | 顧客情報 |

### 注意点

- **予約枠の重複防止**: 同じ公演に定員以上の予約が入らないようチェック必須
- **キャンセル処理**: `reservations.status` を `cancelled` に変更（削除しない）
- **メール送信**: 予約確定時に `send-booking-confirmation` Edge Function が呼ばれる

---

## 2. 貸切予約機能

> 📖 詳細: [features/private-booking/](./features/private-booking/)

### 概要
顧客がプライベート公演（貸切）をリクエストし、管理者が承認する機能。

### フロー

```
顧客が貸切リクエストを送信
    ↓
Discord でGMに通知 ← notify-private-booking-discord
    ↓
GMが空き状況を回答（GMAvailabilityCheck）
    ↓
管理者が店舗・日時・GMを決定して承認
    ↓
顧客にメールで通知
    ↓
schedule_events に公演が登録される
```

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `PrivateBookingRequest/` | 顧客の貸切申込フォーム |
| `GMAvailabilityCheck/` | GMが空き状況を回答 |
| `PrivateBookingManagement/` | 管理者の承認・却下画面 |

### 関連テーブル

| テーブル | 役割 |
|---------|------|
| `private_booking_requests` | 貸切リクエスト情報 |
| `gm_availability_responses` | GMの回答 |
| `schedule_events` | 承認後に公演を登録 |
| `reservations` | 承認後に予約を登録 |

### 🚨 重要な注意点

**競合チェック**: 貸切を承認する際、以下の2つをチェック必須

1. `schedule_events` - 既に手動登録された公演
2. `reservations` - 既に確定している予約

詳細は [critical-features.md](./development/critical-features.md) を参照。

---

## 3. スケジュール管理

> 📖 詳細: [features/schedule-manager/](./features/schedule-manager/)

### 概要
管理者が公演スケジュールを登録・編集する機能。

### 機能

- **公演の追加**: 日時・店舗・シナリオ・GMを指定して登録
- **公演の編集**: 既存公演の情報を変更
- **公演の中止/復活**: `is_cancelled` フラグで管理
- **インポート**: Google Sheetsなどからスケジュールを一括登録

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `ScheduleManager/` | スケジュール一覧・編集画面 |
| `PerformanceModal` | 公演追加・編集モーダル |
| `ImportScheduleModal` | インポート機能 |

### 🚨 重要な注意点

**重複防止**: 同じ日時・店舗に複数公演を登録しようとした場合、警告を表示

- 実装: `src/hooks/useEventOperations.ts` の `checkConflict` 関数
- コードに `🚨 CRITICAL` マークあり

詳細は [critical-features.md](./development/critical-features.md) を参照。

---

## 4. シフト管理

> 📖 詳細: [features/shift-management/](./features/shift-management/)

### 概要
スタッフがシフト希望を提出し、管理者が確認する機能。

### フロー

```
管理者がシフト提出依頼を送信
    ↓
Discord でスタッフに通知 ← notify-shift-request-discord
    ↓
スタッフがシフト提出ページで入力
    ↓
提出完了時にDiscord通知 ← notify-shift-submitted-discord
    ↓
Google Sheetsに同期 ← sync-shifts-to-google-sheet
```

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `ShiftSubmission/` | スタッフのシフト提出画面 |
| `Settings/ShiftSettings` | シフト設定（提出期限など） |

### 関連テーブル

| テーブル | 役割 |
|---------|------|
| `shift_submissions` | シフト提出データ |
| `staff` | スタッフ情報（Discord通知先など） |

---

## 5. 通知機能

> 📖 詳細: [features/notifications/](./features/notifications/)

### 5.1 メール通知

**使用サービス**: Resend API

| 通知種別 | トリガー | Edge Function |
|---------|---------|--------------|
| 予約確認 | 予約完了時 | `send-booking-confirmation` |
| リマインダー | 公演前日 | `send-reminder-emails` |
| スタッフ招待 | 管理者が招待時 | `invite-staff` |
| 貸切確定 | 貸切承認時 | `send-private-booking-confirmation` |
| 貸切却下 | 貸切却下時 | `send-private-booking-rejection` |

**セットアップ**: 
- Resend APIキーを Supabase Secrets に設定
- 詳細は [setup/email/EMAIL_SETUP.md](./setup/email/EMAIL_SETUP.md)

### 5.2 Discord通知

**使用サービス**: Discord Bot

| 通知種別 | トリガー | Edge Function |
|---------|---------|--------------|
| 貸切リクエスト | 顧客申込時 | `notify-private-booking-discord` |
| シフト提出依頼 | 管理者が依頼時 | `notify-shift-request-discord` |
| シフト提出完了 | スタッフ提出時 | `notify-shift-submitted-discord` |

**セットアップ**:
1. Discord Botを作成
2. Bot TokenをSupabase Secretsに設定
3. スタッフの `discord_channel_id` を設定

**注意点**:
- `staff.discord_channel_id` が空だと通知されない
- Bot がチャンネルにアクセス権限を持っている必要あり

---

## 6. マルチテナント

> 📖 詳細: [features/store-organization/](./features/store-organization/) / [features/auth-system/](./features/auth-system/)

### 概要
複数の運営会社が同じシステムを利用できる機能。

### 構造

```
organizations (運営会社)
    ├── stores (店舗)
    ├── staff (スタッフ)
    ├── scenarios (シナリオ)
    ├── schedule_events (公演)
    ├── reservations (予約)
    └── customers (顧客)
```

### アクセス制御

- 各テーブルに `organization_id` カラム
- RLS (Row Level Security) で他組織のデータにアクセス不可
- 共有シナリオ（`is_shared = true`）は全組織で利用可能

### 予約サイトURL

```
#booking/{organization_slug}
例: #booking/queens-waltz
```

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `OrganizationManagement/` | 組織一覧・作成（ライセンス管理者用） |
| `OrganizationSettings/` | 自組織の設定 |
| `OrganizationRegister/` | 新規組織登録 |

---

## 7. ライセンス管理

> 📖 詳細: [features/license-management/](./features/license-management/) / [features/author-portal/](./features/author-portal/)

### 概要
シナリオのライセンスを管理し、他社からの公演報告を受け付ける機能。

### 対象

- **ライセンス管理組織**: シナリオの著作権を持つ会社
- **利用組織**: ライセンスを借りて公演する会社
- **作者**: シナリオの著者

### フロー

```
利用組織が公演を実施
    ↓
公演報告を提出（ExternalReports）
    ↓
ライセンス管理組織が確認・承認
    ↓
作者が報告を確認（AuthorDashboard）
```

### 関連コンポーネント

| コンポーネント | 役割 |
|--------------|------|
| `ExternalReports/` | 公演報告の提出 |
| `LicenseManagement/` | ライセンス管理（統合画面） |
| `AuthorDashboard/` | 作者が報告を確認 |

---

## 8. 外部連携一覧

| 連携先 | 用途 | 設定方法 |
|--------|------|---------|
| **Resend** | メール送信 | APIキーをSupabase Secretsに設定 |
| **Discord** | 通知 | Bot Token + チャンネルIDを設定 |
| **Google Sheets** | シフトデータ同期 | Apps Script + Webhook設定 |
| **Vercel** | ホスティング | GitHub連携で自動デプロイ |

---

## 9. トラブルシューティング

### メールが届かない

1. Resend APIキーが設定されているか確認
2. Edge Functionのログを確認
3. メールアドレスが正しいか確認

### Discord通知が届かない

1. `staff.discord_channel_id` が設定されているか確認
2. BotがチャンネルにアクセスできるかDiscordで確認
3. Edge Functionのログを確認

### 予約が二重登録される

1. `schedule_events.max_participants` が正しく設定されているか確認
2. 予約処理の排他制御を確認

---

## 関連ドキュメント

- [system-overview.md](./system-overview.md) - システム全体像
- [pages.md](./pages.md) - ページ一覧
- [development/critical-features.md](./development/critical-features.md) - 重要機能

