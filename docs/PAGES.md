# ページ一覧・要件定義書

> ⚠️ **必須ルール**: ページを追加・変更・削除した場合は、必ずこのファイルを更新すること。
> 詳細は `rules/rurle.mdc` の「12) ページドキュメント管理」を参照。

---

## 概要

このドキュメントは、MMQシステムの全ページの目的・要件・アクセス権限を俯瞰するためのものです。

---

## 🌐 予約サイト（顧客向け・一般公開）

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **PublicBookingTop** | `#booking/{slug}` | 予約サイトトップ。シナリオ一覧・検索・フィルタリング | 全員（ログイン不要） |
| **ScenarioDetailPage** | `#booking/{slug}/scenario/{id}` | シナリオ詳細表示・予約申込・貸切リクエスト | 全員（予約はログイン必要） |
| **BookingConfirmation** | - (コンポーネント) | 予約確認・顧客情報入力・予約確定 | ログインユーザー |
| **PrivateBookingRequest** | - (コンポーネント) | 貸切リクエスト申込フォーム | ログインユーザー |
| **ScenarioCatalog** | `#catalog` | 全シナリオカタログ（フィルター付き） | 全員 |

### 詳細

#### PublicBookingTop
- **目的**: 顧客が公演予定のあるシナリオを探し、予約する入り口
- **機能**: 
  - ラインナップ表示（カード形式）
  - カレンダービュー（日付×店舗マトリックス）
  - リストビュー（日付順一覧）
  - 検索・フィルタリング
- **組織フィルタ**: `organizationSlug` により組織ごとのデータを表示
- **関連ファイル**: `src/pages/PublicBookingTop/`

#### ScenarioDetailPage
- **目的**: シナリオの詳細情報表示と予約申込
- **機能**:
  - シナリオ情報（あらすじ、人数、時間、料金など）
  - 公演スケジュール一覧
  - 予約申込（人数選択→確認画面）
  - 貸切リクエスト（日時選択→申込）
- **関連ファイル**: `src/pages/ScenarioDetailPage/`

---

## 📊 管理ツール（スタッフ向け）

### ダッシュボード

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **DashboardHome** | `#dashboard` | ダッシュボードトップ。直近の出勤予定・クイックアクセス | admin, staff |

### スケジュール管理

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **ScheduleManager** | `#schedule` | 公演スケジュール管理（作成・編集・キャンセル） | admin |
| **ShiftSubmission** | `#shift-submission` | シフト提出（出勤可能日時登録） | admin, staff |
| **GMAvailabilityCheck** | `#gm-availability` | 貸切リクエストへのGM回答確認 | admin, staff |

### マスタ管理

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **StoreManagement** | `#stores` | 店舗マスタ管理 | admin |
| **StaffManagement** | `#staff` | スタッフマスタ管理 | admin |
| **ScenarioManagement** | `#scenarios` | シナリオマスタ管理 | admin |
| **ScenarioEdit** | `#scenarios/edit?id={id}` | シナリオ編集（詳細設定） | admin |

### 予約・顧客管理

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **ReservationManagement** | `#reservations` | 予約一覧・管理 | admin |
| **PrivateBookingManagement** | `#private-booking-management` | 貸切リクエスト承認・管理 | admin |
| **CustomerManagement** | `#customer-management` | 顧客マスタ管理 | admin |

### 売上・分析

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **SalesManagement** | `#sales` | 売上管理・分析・レポート | admin |
| **AuthorReport** | `#author-report` (予定) | 著者向けライセンス報告 | admin |

### ユーザー・設定

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **UserManagement** | `#user-management` | ユーザーアカウント管理 | admin |
| **Settings** | `#settings` | システム設定 | admin |
| **StaffProfile** | `#staff-profile` | 自分の担当作品・プロフィール | admin, staff |
| **ManualPage** | `#manual` | 操作マニュアル | admin, staff |

---

## 🏢 マルチテナント管理

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **OrganizationManagement** | `#organizations` | 組織一覧・作成・招待 | admin (ライセンス管理者のみ) |
| **ExternalReports** | `#external-reports` | 外部公演報告（他社からの報告） | admin, staff |
| **LicenseReportManagement** | `#license-reports` | ライセンス報告の承認・集計 | admin (ライセンス管理者のみ) |

---

## 👤 マイページ（顧客向け）

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **MyPage** | `#mypage` | マイページトップ | customer |
| **ReservationsPage** | `#mypage/reservations` | 予約履歴 | customer |
| **PlayedScenariosPage** | `#mypage/played` | プレイ済みシナリオ | customer |
| **LikedScenariosPage** | `#mypage/liked` | お気に入りシナリオ | customer |
| **ProfilePage** | `#mypage/profile` | プロフィール編集 | customer |

---

## 🔐 認証

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **LoginForm** | `#login` | ログイン・サインアップ | 全員 |
| **ResetPassword** | `#reset-password` | パスワードリセット | 全員 |
| **SetPassword** | `#set-password` | 初回パスワード設定 | 招待されたユーザー |

---

## 🛠️ 開発・デバッグ用

| ページ名 | パス | 用途 | アクセス権限 |
|---------|------|------|-------------|
| **AddDemoParticipants** | `#add-demo-participants` | デモ参加者追加（テスト用） | admin |
| **ScenarioMatcher** | `#scenario-matcher` | シナリオマッチング（テスト用） | admin |

---

## 更新履歴

| 日付 | 変更内容 | 担当 |
|------|---------|------|
| 2024-12-17 | 初版作成。マルチテナント対応ページを追加 | AI |

---

## 関連ドキュメント

- `UI_Design.md` - UI要素・コンポーネント詳細
- `CRITICAL_FEATURES.md` - 重要機能保護
- `rules/rurle.mdc` - プロジェクトルール

