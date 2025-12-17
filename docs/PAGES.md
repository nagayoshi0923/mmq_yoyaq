# ページ一覧・要件定義書

> ⚠️ **必須ルール**: ページを追加・変更・削除した場合は、必ずこのファイルを更新すること。
> 詳細は `rules/rurle.mdc` の「12) ページドキュメント管理」を参照。

---

## 目次

1. [システム概要](#システム概要)
2. [マルチテナント構造](#マルチテナント構造)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [ルーティング構造](#ルーティング構造)
5. [ページ一覧](#ページ一覧)
6. [更新履歴](#更新履歴)

---

## システム概要

### MMQ（Murder Mystery Queue）とは

**どの会社でも利用できる、マーダーミステリー公演の予約・運営管理SaaS。**

```
┌─────────────────────────────────────────────────────────────────┐
│                        MMQ システム                              │
│              〜 マルチテナント型 予約管理SaaS 〜                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  利用企業（組織）                                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │クインズワルツ│ │  会社A      │ │  会社B      │ │  会社C ...  │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ │
│         │              │              │              │         │
│         ▼              ▼              ▼              ▼         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    共通プラットフォーム                      │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │   予約サイト     │  │   管理ツール     │                 │ │
│  │  │  (顧客向け)      │  │  (スタッフ向け)  │                 │ │
│  │  ├──────────────────┤  ├──────────────────┤                 │ │
│  │  │ • シナリオ検索   │  │ • スケジュール   │                 │ │
│  │  │ • 公演予約       │  │ • 予約管理       │                 │ │
│  │  │ • 貸切申込       │  │ • スタッフ管理   │                 │ │
│  │  │ • マイページ     │  │ • 売上分析       │                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ※ 各組織は独立したデータ空間を持ち、他組織のデータにはアクセス不可  │
│  ※ 組織ごとに独自の予約サイトURL（#booking/{slug}）を持つ         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 主な特徴

| 特徴 | 説明 |
|------|------|
| **マルチテナント** | 複数の会社が同じシステムを利用。データは組織ごとに完全分離 |
| **SaaS型** | 各社は自社でサーバー構築不要。アカウント登録ですぐ利用開始 |
| **組織別URL** | 各社固有の予約サイト（`#booking/{会社slug}`） |
| **共有シナリオ** | ライセンス管理シナリオは複数組織で利用可能 |

### 技術スタック

- **Frontend**: React + TypeScript + Vite
- **UI**: TailwindCSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Hosting**: Vercel

---

## マルチテナント構造

### 概要

MMQは**マルチテナント型SaaS**。各組織（マーダーミステリー運営会社）は独立したデータ空間を持ち、他組織のデータにはアクセスできない。

```
┌─────────────────────────────────────────────────────────────────┐
│                      マルチテナント構造                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  organizations テーブル                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 組織A           │  │ 組織B           │  │ 組織C           │   │
│  │ slug: org-a     │  │ slug: org-b     │  │ slug: org-c     │   │
│  │ plan: basic     │  │ plan: pro       │  │ plan: free      │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
│           │                    │                    │            │
│           ▼                    ▼                    ▼            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ 組織Aのデータ   │  │ 組織Bのデータ   │  │ 組織Cのデータ   │   │
│  │ • stores        │  │ • stores        │  │ • stores        │   │
│  │ • staff         │  │ • staff         │  │ • staff         │   │
│  │ • scenarios     │  │ • scenarios     │  │ • scenarios     │   │
│  │ • events        │  │ • events        │  │ • events        │   │
│  │ • reservations  │  │ • reservations  │  │ • reservations  │   │
│  │ • customers     │  │ • customers     │  │ • customers     │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                  │
│  ※ 各組織のデータは organization_id で分離                       │
│  ※ RLS（Row Level Security）により他組織のデータにはアクセス不可  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 組織（Organization）の種類

| 種別 | is_license_manager | 説明 |
|------|-------------------|------|
| **一般組織** | `false` | MMQを予約・管理ツールとして利用する会社（ほとんどの組織） |
| **ライセンス管理組織** | `true` | シナリオのライセンスを管理し、他社からの公演報告を受け付ける組織 |

> **例**: クインズワルツは「一般組織」として自社の予約管理を行いつつ、「ライセンス管理組織」として他社が公演するシナリオのライセンス管理も行う。

### URL構造（パス方式）

予約サイトは組織ごとに異なるURLでアクセス：

```
#booking/{organization_slug}
#booking/{organization_slug}/scenario/{scenario_id}
#booking/{organization_slug}/calendar
#booking/{organization_slug}/list
```

**例:**
- `#booking/queens-waltz` → クインズワルツの予約サイト
- `#booking/company-a` → 会社Aの予約サイト

### データフィルタリング

| テーブル | フィルタ条件 |
|---------|-------------|
| stores | `organization_id = 現在の組織` |
| staff | `organization_id = 現在の組織` |
| scenarios | `organization_id = 現在の組織` OR `is_shared = true` |
| schedule_events | `organization_id = 現在の組織` |
| reservations | `organization_id = 現在の組織` |
| customers | `organization_id = 現在の組織` |

### 共有シナリオ

`is_shared = true` のシナリオは全組織で利用可能（ライセンス管理シナリオ）。

### アクセス制御

| ページ | 制限 |
|-------|------|
| `#organizations` | ライセンス管理組織のみ |
| `#license-reports` | ライセンス管理組織のみ |
| その他 | 組織内のユーザーのみ |

---

## ディレクトリ構造

```
src/pages/
├── AdminDashboard.tsx          # メインルーター（ハッシュベースルーティング）
│
├── PublicBookingTop/           # 予約サイトトップ
│   ├── index.tsx               # メインコンポーネント
│   ├── components/             # UI部品
│   │   ├── CalendarView.tsx
│   │   ├── LineupView.tsx
│   │   ├── ListView.tsx
│   │   ├── ScenarioCard.tsx
│   │   └── SearchBar.tsx
│   └── hooks/                  # データ取得・状態管理
│       ├── useBookingData.ts   # ★ organizationSlug でフィルタリング
│       ├── useBookingFilters.ts
│       ├── useCalendarData.ts
│       └── useListViewData.ts
│
├── ScenarioDetailPage/         # シナリオ詳細
│   ├── index.tsx
│   ├── components/
│   └── hooks/
│
├── BookingConfirmation/        # 予約確認
│   ├── index.tsx
│   ├── types.ts                # Props定義（organizationSlug含む）
│   └── hooks/
│
├── PrivateBookingRequest/      # 貸切リクエスト
│   ├── index.tsx
│   ├── types.ts
│   └── hooks/
│
├── ScheduleManager/            # スケジュール管理
│   ├── index.tsx
│   └── hooks/
│
├── StaffManagement/            # スタッフ管理
│   ├── index.tsx
│   ├── components/
│   └── hooks/
│
├── ScenarioManagement/         # シナリオ管理
│   ├── index.tsx
│   ├── components/
│   └── hooks/
│
├── OrganizationManagement/     # 組織管理（マルチテナント）
│   ├── index.tsx
│   └── components/
│       ├── OrganizationCreateDialog.tsx
│       ├── OrganizationEditDialog.tsx
│       └── OrganizationInviteDialog.tsx
│
├── OrganizationSettings/       # 自組織設定
│   └── index.tsx
│
├── OrganizationRegister/       # セルフサービス登録
│   └── index.tsx
│
├── AcceptInvitation/           # 招待受諾
│   └── index.tsx
│
├── ExternalReports/            # 外部公演報告
│   ├── index.tsx
│   ├── components/
│   └── hooks/
│
├── LicenseReportManagement/    # ライセンス報告管理
│   ├── index.tsx
│   ├── components/
│   └── hooks/
│
└── ... (その他)
```

### ページコンポーネントの標準構造

```
PageName/
├── index.tsx           # メインコンポーネント（エントリポイント）
├── types.ts            # 型定義（Props, 内部型）
├── components/         # UI部品（Presentational）
│   ├── ComponentA.tsx
│   └── ComponentB.tsx
├── hooks/              # カスタムフック（Container Logic）
│   ├── usePageData.ts
│   └── usePageActions.ts
└── utils/              # ユーティリティ関数
    └── formatters.ts
```

---

## ルーティング構造

### ハッシュベースルーティング

`AdminDashboard.tsx` の `parseHash()` 関数がURLハッシュを解析し、適切なページをレンダリング。

```typescript
parseHash(hash: string): {
  page: string,
  scenarioId: string | null,
  organizationSlug: string | null
}
```

### ルーティングパターン

```
■ 予約サイト（新形式）
#booking/{slug}                     → PublicBookingTop
#booking/{slug}/calendar            → PublicBookingTop (カレンダータブ)
#booking/{slug}/list                → PublicBookingTop (リストタブ)
#booking/{slug}/scenario/{id}       → ScenarioDetailPage

■ 予約サイト（旧形式・後方互換）
#customer-booking                   → PublicBookingTop (デフォルト組織)
#customer-booking/scenario/{id}     → ScenarioDetailPage

■ 管理ツール
#dashboard                          → DashboardHome
#schedule                           → ScheduleManager
#stores                             → StoreManagement
#staff                              → StaffManagement
#scenarios                          → ScenarioManagement
#scenarios/edit?id={id}             → ScenarioEdit
#reservations                       → ReservationManagement
#private-booking-management         → PrivateBookingManagement
#customer-management                → CustomerManagement
#shift-submission                   → ShiftSubmission
#gm-availability                    → GMAvailabilityCheck
#sales                              → SalesManagement
#user-management                    → UserManagement
#settings                           → Settings
#manual                             → ManualPage

■ マルチテナント
#organizations                      → OrganizationManagement
#organization-settings              → OrganizationSettings
#register                           → OrganizationRegister
#accept-invitation?token=xxx        → AcceptInvitation
#external-reports                   → ExternalReports
#license-reports                    → LicenseReportManagement

■ マイページ
#mypage                             → MyPage
#mypage/reservations                → ReservationsPage
#mypage/played                      → PlayedScenariosPage
#mypage/liked                       → LikedScenariosPage
#mypage/profile                     → ProfilePage

■ サービス紹介・認証
#about                              → LandingPage（MMQ紹介）
#login                              → LoginForm
#register                           → OrganizationRegister
#reset-password                     → ResetPassword
#set-password                       → SetPassword
```

---

## ページ一覧

### 🌐 予約サイト（顧客向け・一般公開）

| ページ名 | パス | 用途 | アクセス | 組織フィルタ |
|---------|------|------|---------|-------------|
| **PublicBookingTop** | `#booking/{slug}` | 予約サイトトップ | 全員 | ✅ |
| **ScenarioDetailPage** | `#booking/{slug}/scenario/{id}` | シナリオ詳細・予約 | 全員 | ✅ |
| **BookingConfirmation** | (コンポーネント) | 予約確認・確定 | ログイン必須 | ✅ |
| **PrivateBookingRequest** | (コンポーネント) | 貸切申込 | ログイン必須 | ✅ |
| **ScenarioCatalog** | `#catalog` | 全シナリオカタログ | 全員 | ✅ |

#### PublicBookingTop 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ PublicBookingTop                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Props:                                                          │
│  - organizationSlug?: string  // URL から取得                    │
│  - onScenarioSelect?: (id) => void                               │
│                                                                  │
│  データ取得 (useBookingData):                                    │
│  1. organizationSlug → organization_id を取得                    │
│  2. scenarios: organization_id でフィルタ OR is_shared=true      │
│  3. stores: organization_id でフィルタ                           │
│  4. schedule_events: organization_id でフィルタ                  │
│                                                                  │
│  表示モード:                                                     │
│  - ラインナップ: シナリオカード一覧                              │
│  - カレンダー: 日付×店舗マトリックス                             │
│  - リスト: 日付順の公演一覧                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 📊 管理ツール（スタッフ向け）

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **DashboardHome** | `#dashboard` | ダッシュボード | admin, staff |
| **ScheduleManager** | `#schedule` | 公演スケジュール管理 | admin |
| **ShiftSubmission** | `#shift-submission` | シフト提出 | admin, staff |
| **GMAvailabilityCheck** | `#gm-availability` | GM確認回答 | admin, staff |
| **StoreManagement** | `#stores` | 店舗マスタ | admin |
| **StaffManagement** | `#staff` | スタッフマスタ | admin |
| **ScenarioManagement** | `#scenarios` | シナリオマスタ | admin |
| **ScenarioEdit** | `#scenarios/edit?id={id}` | シナリオ編集 | admin |
| **ReservationManagement** | `#reservations` | 予約管理 | admin |
| **PrivateBookingManagement** | `#private-booking-management` | 貸切管理 | admin |
| **CustomerManagement** | `#customer-management` | 顧客管理 | admin |
| **SalesManagement** | `#sales` | 売上分析 | admin |
| **UserManagement** | `#user-management` | ユーザー管理 | admin |
| **Settings** | `#settings` | 設定 | admin |
| **StaffProfile** | `#staff-profile` | 担当作品 | admin, staff |
| **ManualPage** | `#manual` | マニュアル | admin, staff |

---

### 🏢 マルチテナント管理

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **OrganizationManagement** | `#organizations` | 組織一覧・作成・招待・編集 | ライセンス管理者のみ |
| **OrganizationSettings** | `#organization-settings` | 自組織の設定編集 | admin |
| **OrganizationRegister** | `#register` | セルフサービス組織登録 | 未ログイン |
| **AcceptInvitation** | `#accept-invitation?token=xxx` | 招待受諾・アカウント作成 | 未ログイン |
| **ExternalReports** | `#external-reports` | 公演報告提出 | admin, staff |
| **LicenseReportManagement** | `#license-reports` | 報告承認・集計 | ライセンス管理者のみ |

#### OrganizationManagement 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ OrganizationManagement                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  アクセス制限:                                                   │
│  - is_license_manager = true の組織のみ                          │
│  - それ以外はアクセス拒否メッセージ                              │
│                                                                  │
│  機能:                                                           │
│  1. 組織一覧表示                                                 │
│  2. 新規組織作成 (OrganizationCreateDialog)                      │
│  3. 組織編集 (OrganizationEditDialog)                            │
│  4. 組織への招待 (OrganizationInviteDialog)                      │
│                                                                  │
│  関連テーブル:                                                   │
│  - organizations                                                 │
│  - staff (organization_id で紐付け)                              │
│  - organization_invitations                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### OrganizationSettings 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ OrganizationSettings                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  目的:                                                           │
│  - 自組織の基本情報を編集                                        │
│  - 招待管理（保留中・受諾済みの一覧）                            │
│                                                                  │
│  編集可能項目:                                                   │
│  - 組織名                                                        │
│  - 担当者名                                                      │
│  - 連絡先メールアドレス                                          │
│  - メモ                                                          │
│                                                                  │
│  表示項目（編集不可）:                                           │
│  - 識別子（slug）                                                │
│  - プラン                                                        │
│                                                                  │
│  関連テーブル:                                                   │
│  - organizations                                                 │
│  - organization_invitations                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### OrganizationRegister 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ OrganizationRegister                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  目的:                                                           │
│  - 新規組織のセルフサービス登録                                  │
│  - 招待なしで組織を作成可能                                      │
│                                                                  │
│  登録フロー（3ステップ）:                                        │
│  1. 組織情報入力（名前、識別子、連絡先）                         │
│  2. 管理者情報入力（名前、メール、パスワード）                   │
│  3. 確認・利用規約同意・登録                                     │
│                                                                  │
│  登録完了後:                                                     │
│  - organizations に新規レコード作成                              │
│  - Supabase Auth にユーザー作成                                  │
│  - users テーブルに admin ロールで登録                           │
│  - staff テーブルに管理者として登録                              │
│  - 確認メール送信                                                │
│                                                                  │
│  関連テーブル:                                                   │
│  - organizations                                                 │
│  - users                                                         │
│  - staff                                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### AcceptInvitation 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ AcceptInvitation                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  目的:                                                           │
│  - 招待リンクからアクセスしてアカウント作成                      │
│  - パスワードを設定して組織に参加                                │
│                                                                  │
│  URLパラメータ:                                                  │
│  - token: 招待トークン（必須）                                   │
│                                                                  │
│  バリデーション:                                                 │
│  - トークン存在チェック                                          │
│  - 有効期限チェック（7日間）                                     │
│  - 受諾済みチェック                                              │
│                                                                  │
│  受諾完了後:                                                     │
│  - Supabase Auth にユーザー作成                                  │
│  - users テーブルに登録                                          │
│  - staff テーブルに登録                                          │
│  - organization_invitations を更新（accepted_at）                │
│                                                                  │
│  関連テーブル:                                                   │
│  - organization_invitations                                      │
│  - users                                                         │
│  - staff                                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### ExternalReports 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ ExternalReports                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  目的:                                                           │
│  - ライセンス管理シナリオの公演回数を報告                        │
│  - 自社公演を集計してライセンス料計算に使用                      │
│                                                                  │
│  報告内容:                                                       │
│  - シナリオ選択（is_shared=true のみ）                           │
│  - 公演日                                                        │
│  - 公演回数                                                      │
│  - 参加者数（オプション）                                        │
│  - 会場名（オプション）                                          │
│  - 備考                                                          │
│                                                                  │
│  ワークフロー:                                                   │
│  報告提出 → pending → 承認/却下 → approved/rejected              │
│                                                                  │
│  関連テーブル:                                                   │
│  - external_performance_reports                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### LicenseReportManagement 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ LicenseReportManagement                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  アクセス制限:                                                   │
│  - is_license_manager = true の組織のみ                          │
│                                                                  │
│  機能:                                                           │
│  1. 提出された報告の一覧                                         │
│  2. 報告の承認/却下                                              │
│  3. シナリオ別・期間別の集計                                     │
│  4. ライセンス料の算出サポート                                   │
│                                                                  │
│  関連テーブル:                                                   │
│  - external_performance_reports                                  │
│  - scenarios (is_shared=true)                                    │
│  - organizations                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ✍️ 作者ポータル（シナリオ著者向け・メールアドレスベース）

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **AuthorDashboard** | `#author-dashboard` | 作者ダッシュボード | ログインユーザー |

#### 設計方針

```
┌─────────────────────────────────────────────────────────────────┐
│               作者ポータル（メールアドレスベース）               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  【設計思想】                                                    │
│  ✕ 作者は自分で登録しない（なりすまし防止）                     │
│  ○ 報告者（会社）がシナリオに作者メールを登録                   │
│  ○ 報告時に作者メールに通知が届く                               │
│  ○ 作者はメールアドレスでログインして報告を確認                 │
│                                                                  │
│  【フロー】                                                      │
│  1. 会社がシナリオ登録時に author_email を設定                   │
│  2. 公演報告を提出 → 作者メールに通知                            │
│  3. 作者がログイン → 自分のメールアドレス宛の全報告を閲覧        │
│                                                                  │
│  【メリット】                                                    │
│  - 登録不要で簡単                                                │
│  - なりすましリスクなし（間違えても報告者が損するだけ）          │
│  - 複数会社からの報告を一元管理                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### AuthorDashboard 詳細

```
┌─────────────────────────────────────────────────────────────────┐
│ AuthorDashboard                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  認証:                                                           │
│  - ログイン必須                                                  │
│  - ログイン中のメールアドレスに紐づく報告を表示                  │
│                                                                  │
│  タブ構成:                                                       │
│  1. 概要                                                         │
│     - 登録シナリオ数                                             │
│     - 総公演回数                                                 │
│     - 累計ライセンス料                                           │
│     - 取引先会社数                                               │
│     - 最近の公演報告（5件）                                      │
│  2. 公演報告                                                     │
│     - 全報告一覧（フィルタ・検索付き）                           │
│     - ステータス別表示（承認済み/審査中/却下）                   │
│  3. シナリオ                                                     │
│     - author_email が自分のメールのシナリオ一覧                  │
│                                                                  │
│  関連テーブル/ビュー:                                            │
│  - scenarios (author_email でフィルタ)                           │
│  - external_performance_reports                                  │
│  - author_performance_reports (ビュー)                           │
│  - author_summary (ビュー)                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 👤 マイページ（顧客向け）

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **MyPage** | `#mypage` | マイページトップ | customer |
| **ReservationsPage** | `#mypage/reservations` | 予約履歴 | customer |
| **PlayedScenariosPage** | `#mypage/played` | プレイ済みシナリオ | customer |
| **LikedScenariosPage** | `#mypage/liked` | お気に入り | customer |
| **ProfilePage** | `#mypage/profile` | プロフィール編集 | customer |

---

### 🔐 認証

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **LoginForm** | `#login` | ログイン・サインアップ | 全員 |
| **ResetPassword** | `#reset-password` | パスワードリセット | 全員 |
| **SetPassword** | `#set-password` | 初回パスワード設定 | 招待ユーザー |

---

### 🛠️ 開発・デバッグ用

| ページ名 | パス | 用途 | アクセス |
|---------|------|------|---------|
| **AddDemoParticipants** | `#add-demo-participants` | デモ参加者追加 | admin |
| **ScenarioMatcher** | `#scenario-matcher` | シナリオマッチング | admin |

---

## 更新履歴

| 日付 | 変更内容 | 担当 |
|------|---------|------|
| 2024-12-17 | 作者ポータルをメールアドレスベースに変更。AuthorRegister削除、登録不要に | AI |
| 2024-12-17 | 作者ポータル追加（AuthorDashboard）。作者が公演報告を確認・管理可能に | AI |
| 2024-12-17 | 新規組織登録フロー追加（OrganizationSettings, OrganizationRegister, AcceptInvitation, OrganizationEditDialog） | AI |
| 2024-12-17 | マルチテナント構造・ディレクトリ構造・ルーティング詳細を追加 | AI |
| 2024-12-17 | 初版作成。マルチテナント対応ページを追加 | AI |

---

## 関連ドキュメント

- `UI_Design.md` - UI要素・コンポーネント詳細
- `CRITICAL_FEATURES.md` - 重要機能保護
- `rules/rurle.mdc` - プロジェクトルール
- `database/migrations/` - データベースマイグレーション
