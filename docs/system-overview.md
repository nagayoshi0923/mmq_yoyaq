# MMQ システム概要

**最終更新**: 2025-12-30

このドキュメントは、MMQ（Murder Mystery Queue）システムの全体像を説明します。
新しい開発者がシステムを理解するための最初のドキュメントです。

---

## 1. MMQとは

**MMQ（Murder Mystery Queue）**は、マーダーミステリー店舗の予約・運営を管理するSaaSシステムです。

### 対象ユーザー

| ユーザー種別 | 説明 | 主な操作 |
|------------|------|---------|
| **顧客** | マーダーミステリーを予約・プレイする一般ユーザー | 予約、マイページ閲覧 |
| **スタッフ** | 店舗で働くGM（ゲームマスター）やスタッフ | シフト提出、GM確認回答 |
| **管理者** | 店舗運営者 | 全機能を管理 |
| **作者** | シナリオ著者（ライセンス管理用） | 公演報告の確認 |

### システムの特徴

- **マルチテナント**: 複数の運営会社が同じシステムを利用可能
- **予約サイト**: 顧客向けのオンライン予約機能
- **管理ツール**: スタッフ・管理者向けの運営管理機能
- **通知連携**: Discord・メールでの自動通知

---

## 2. 技術スタック

| 領域 | 技術 |
|------|------|
| **フロントエンド** | React + TypeScript + Vite |
| **UIライブラリ** | shadcn/ui + TailwindCSS |
| **バックエンド** | Supabase (PostgreSQL + Auth + Edge Functions) |
| **ホスティング** | Vercel |
| **メール送信** | Resend API |
| **通知** | Discord Bot + Webhook |

---

## 3. システム構成図

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MMQ システム構成                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │   予約サイト      │     │   管理ツール      │                      │
│  │  (顧客向け)       │     │  (スタッフ向け)   │                      │
│  │                  │     │                  │                      │
│  │ • シナリオ一覧    │     │ • スケジュール    │                      │
│  │ • カレンダー予約  │     │ • 予約管理        │                      │
│  │ • 貸切申込       │     │ • スタッフ管理    │                      │
│  │ • マイページ     │     │ • シナリオ管理    │                      │
│  └────────┬─────────┘     └────────┬─────────┘                      │
│           │                        │                                │
│           └───────────┬────────────┘                                │
│                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Supabase                                  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │    │
│  │  │ PostgreSQL  │  │    Auth     │  │   Edge Functions    │  │    │
│  │  │             │  │             │  │                     │  │    │
│  │  │ • stores    │  │ • ログイン  │  │ • メール送信        │  │    │
│  │  │ • staff     │  │ • 権限管理  │  │ • Discord通知       │  │    │
│  │  │ • scenarios │  │             │  │ • Google Sheets連携 │  │    │
│  │  │ • events    │  │             │  │                     │  │    │
│  │  │ • ...       │  │             │  │                     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                       │                                             │
│           ┌───────────┼───────────┐                                 │
│           ▼           ▼           ▼                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │   Resend    │ │   Discord   │ │Google Sheets│                   │
│  │  (メール)   │ │   (通知)    │ │  (シフト)   │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 主要機能一覧

### 4.1 予約サイト（顧客向け）

| 機能 | 説明 | 主要ファイル |
|------|------|-------------|
| **シナリオ一覧** | 公演可能なシナリオを表示 | `PublicBookingTop/` |
| **カレンダー予約** | 日時を選んで予約 | `PublicBookingTop/CalendarView` |
| **シナリオ詳細** | シナリオ情報と予約ボタン | `ScenarioDetailPage/` |
| **貸切申込** | 貸切公演のリクエスト | `PrivateBookingRequest/` |
| **マイページ** | 予約履歴・プロフィール | `MyPage/` |

### 4.2 管理ツール（スタッフ・管理者向け）

| 機能 | 説明 | 主要ファイル |
|------|------|-------------|
| **スケジュール管理** | 公演スケジュールの登録・編集 | `ScheduleManager/` |
| **予約管理** | 予約の確認・変更・キャンセル | `ReservationManagement.tsx` |
| **貸切管理** | 貸切リクエストの承認・却下 | `PrivateBookingManagement/` |
| **スタッフ管理** | スタッフ情報・権限管理 | `StaffManagement/` |
| **シナリオ管理** | シナリオ情報の管理 | `ScenarioManagement/` |
| **店舗管理** | 店舗情報の管理 | `StoreManagement.tsx` |
| **売上管理** | 売上データの分析 | `SalesManagement/` |
| **シフト提出** | スタッフがシフト希望を提出 | `ShiftSubmission/` |
| **GM確認** | GMが貸切リクエストに回答 | `GMAvailabilityCheck/` |
| **顧客管理** | 顧客情報の管理 | `CustomerManagement/` |
| **ユーザー管理** | システムユーザーの管理 | `UserManagement.tsx` |
| **設定** | システム設定 | `Settings/` |

### 4.3 外部連携機能

| 機能 | 説明 | Edge Function |
|------|------|--------------|
| **予約確認メール** | 予約完了時に顧客へメール送信 | `send-booking-confirmation` |
| **リマインダーメール** | 公演前日に顧客へメール送信 | `send-reminder-emails` |
| **スタッフ招待** | 新スタッフへ招待メール送信 | `invite-staff` |
| **Discord貸切通知** | 貸切リクエストをGMに通知 | `notify-private-booking-discord` |
| **Discordシフト通知** | シフト提出依頼をスタッフに通知 | `notify-shift-request-discord` |
| **Google Sheets連携** | シフトデータをスプレッドシートに同期 | `sync-shifts-to-google-sheet` |

---

## 5. データベース構造（主要テーブル）

| テーブル | 説明 | 主なカラム |
|---------|------|-----------|
| **organizations** | 運営会社（マルチテナント） | id, name, slug |
| **stores** | 店舗 | id, name, organization_id |
| **staff** | スタッフ | id, name, role, organization_id |
| **scenarios** | シナリオ | id, title, duration, player_count_min/max |
| **schedule_events** | 公演スケジュール | id, date, store_id, scenario_id, gms |
| **reservations** | 予約 | id, customer_id, schedule_event_id, status |
| **customers** | 顧客 | id, user_id, name, email |
| **private_booking_requests** | 貸切リクエスト | id, scenario_id, status, candidate_datetimes |

---

## 6. 認証・権限

### ユーザーロール

| ロール | 権限 |
|--------|------|
| **admin** | 全機能にアクセス可能 |
| **staff** | シフト提出、GM確認、一部管理機能 |
| **customer** | 予約サイト、マイページのみ |

### 認証フロー

1. ユーザーがログイン（Supabase Auth）
2. `users` テーブルからロールを取得
3. ロールに応じて表示するページを制限

---

## 7. 開発環境のセットアップ

### 必要なもの

- Node.js 18以上
- npm
- Supabase CLIimport （任意）

### セットアップ手順

```bash
# 1. 依存関係のインストール
npm install

# 2. 環境変数の設定
cp env.example .env.local
# .env.local を編集して Supabase の URL と KEY を設定

# 3. 開発サーバー起動
npm run dev
```

### よく使うコマンド

```bash
npm run dev        # 開発サーバー起動
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run lint       # Lintチェック
npm run verify     # typecheck + lint + build（コミット前に必須）
```

---

## 8. 関連ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| [pages.md](./pages.md) | 全ページの一覧とルーティング |
| [development/design-guidelines.md](./development/design-guidelines.md) | デザインシステム・UIルール |
| [development/critical-features.md](./development/critical-features.md) | 削除禁止の重要機能 |
| [features.md](./features.md) | 各機能の詳細説明 |
| [rules/rurle.mdc](../rules/rurle.mdc) | プロジェクトルール |

---

## 9. 問い合わせ先

システムに関する質問は以下へ：

- 技術的な質問: （開発チーム連絡先）
- 運用に関する質問: （運営チーム連絡先）

