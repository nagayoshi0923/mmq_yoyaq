# MMQ アーキテクチャ設計書

**最終更新**: 2026-01-10

このドキュメントは、MMQシステムのアーキテクチャを詳細に説明します。

---

## 目次

1. [システム概要](#1-システム概要)
2. [技術スタック](#2-技術スタック)
3. [コンポーネント構成](#3-コンポーネント構成)
4. [データフロー](#4-データフロー)
5. [認証・認可](#5-認証認可)
6. [マルチテナント設計](#6-マルチテナント設計)
7. [外部連携](#7-外部連携)
8. [デプロイメント](#8-デプロイメント)

---

## 1. システム概要

### アーキテクチャ図

```mermaid
flowchart TB
    subgraph users [ユーザー]
        Customer[顧客]
        Staff[スタッフ/GM]
        Admin[管理者]
        Author[作者]
    end
    
    subgraph frontend [フロントエンド]
        React[React SPA]
    end
    
    subgraph hosting [ホスティング]
        Vercel[Vercel]
    end
    
    subgraph backend [バックエンド - Supabase]
        Auth[Supabase Auth]
        DB[(PostgreSQL)]
        EdgeFn[Edge Functions]
        Storage[Storage]
        Realtime[Realtime]
    end
    
    subgraph external [外部サービス]
        Resend[Resend<br/>メール]
        Discord[Discord<br/>通知]
        GSheet[Google Sheets<br/>シフト]
        Twitter[X/Twitter<br/>告知]
    end
    
    users --> React
    React --> Vercel
    Vercel --> Auth
    Vercel --> DB
    Vercel --> EdgeFn
    EdgeFn --> Resend
    EdgeFn --> Discord
    EdgeFn --> GSheet
    EdgeFn --> Twitter
    DB -->|Trigger| EdgeFn
```

### 設計思想

| 原則 | 説明 |
|------|------|
| **サーバーレス** | Edge Functions でバックエンドロジックを実行 |
| **マルチテナント** | 1つのインスタンスで複数組織をサポート |
| **RLS セキュリティ** | データベースレベルでアクセス制御 |
| **リアルタイム** | Supabase Realtime で即座にUI反映 |

---

## 2. 技術スタック

### フロントエンド

```mermaid
flowchart LR
    subgraph core [コア]
        React[React 18]
        TS[TypeScript]
        Vite[Vite]
    end
    
    subgraph ui [UI]
        Tailwind[TailwindCSS]
        Shadcn[shadcn/ui]
        Lucide[Lucide Icons]
    end
    
    subgraph state [状態管理]
        TanStack[TanStack Query]
        Context[React Context]
    end
    
    subgraph routing [ルーティング]
        Router[React Router]
        Hash[Hash-based URLs]
    end
    
    core --> ui
    core --> state
    core --> routing
```

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | React | 18.x |
| 言語 | TypeScript | 5.x |
| ビルドツール | Vite | 5.x |
| UIライブラリ | shadcn/ui | latest |
| スタイリング | TailwindCSS | 3.x |
| 状態管理 | TanStack Query | 5.x |
| ルーティング | React Router | 6.x |
| フォーム | React Hook Form | 7.x |
| バリデーション | Zod | 3.x |
| 日付 | date-fns | 2.x |
| テーブル | TanStack Table | 8.x |
| トースト | Sonner | latest |

### バックエンド

| カテゴリ | 技術 |
|---------|------|
| BaaS | Supabase |
| データベース | PostgreSQL 15 |
| 認証 | Supabase Auth |
| Edge Functions | Deno |
| ストレージ | Supabase Storage |

### インフラ

| カテゴリ | 技術 |
|---------|------|
| ホスティング | Vercel |
| DNS | Vercel DNS |
| CDN | Vercel Edge Network |

---

## 3. コンポーネント構成

### ディレクトリ構造

```
src/
├── App.tsx                 # ルートコンポーネント
├── main.tsx               # エントリーポイント
├── index.css              # グローバルスタイル
│
├── components/            # 共通コンポーネント
│   ├── ui/               # shadcn/ui コンポーネント
│   ├── layout/           # レイアウトコンポーネント
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── auth/             # 認証関連
│   │   └── LoginForm.tsx
│   └── common/           # 共通部品
│       ├── DataTable.tsx
│       ├── Calendar.tsx
│       └── Modal.tsx
│
├── pages/                 # ページコンポーネント
│   ├── AdminDashboard.tsx      # メインルーター
│   ├── PublicBookingTop/       # 予約サイトトップ
│   ├── ScenarioDetailPage/     # シナリオ詳細
│   ├── ScheduleManager/        # スケジュール管理
│   ├── StaffManagement/        # スタッフ管理
│   ├── ScenarioManagement/     # シナリオ管理
│   ├── ReservationManagement/  # 予約管理
│   └── ...
│
├── hooks/                 # カスタムフック
│   ├── useAuth.ts
│   ├── useOrganization.ts
│   ├── useScenarios.ts
│   └── ...
│
├── lib/                   # ライブラリ・ユーティリティ
│   ├── supabase.ts       # Supabaseクライアント
│   ├── api/              # APIラッパー
│   └── utils/            # ユーティリティ関数
│
├── contexts/              # Reactコンテキスト
│   └── AuthContext.tsx
│
├── types/                 # 型定義
│   └── index.ts
│
└── constants/             # 定数
    └── game.ts
```

### コンポーネント階層

```mermaid
flowchart TB
    subgraph app [App.tsx]
        BrowserRouter
        QueryClientProvider
        AuthProvider
        Toaster
    end
    
    subgraph routes [ルーティング]
        AdminDashboard
    end
    
    subgraph layout [レイアウト]
        Sidebar
        Header
        MainContent
    end
    
    subgraph pages [ページ]
        PublicBookingTop
        ScheduleManager
        StaffManagement
        ScenarioManagement
        ReservationManagement
        Settings
    end
    
    app --> routes
    routes --> layout
    layout --> pages
```

### ページコンポーネントの構造

各ページは以下の標準構造に従います：

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

## 4. データフロー

### 読み取りフロー

```mermaid
sequenceDiagram
    participant UI as React Component
    participant Hook as Custom Hook
    participant Query as TanStack Query
    participant Supabase as Supabase Client
    participant DB as PostgreSQL
    
    UI->>Hook: useXxxData()
    Hook->>Query: useQuery()
    Query->>Supabase: supabase.from().select()
    Supabase->>DB: SQL Query (with RLS)
    DB-->>Supabase: Result
    Supabase-->>Query: Data
    Query-->>Hook: { data, isLoading, error }
    Hook-->>UI: Render
```

### 書き込みフロー

```mermaid
sequenceDiagram
    participant UI as React Component
    participant Hook as Custom Hook
    participant Mutation as TanStack Mutation
    participant Supabase as Supabase Client
    participant DB as PostgreSQL
    participant EdgeFn as Edge Function
    
    UI->>Hook: handleSubmit()
    Hook->>Mutation: useMutation()
    Mutation->>Supabase: supabase.from().insert()
    Supabase->>DB: SQL INSERT (with RLS)
    DB-->>Supabase: Result
    
    alt 通知が必要な場合
        DB->>EdgeFn: Database Trigger
        EdgeFn->>EdgeFn: 外部サービス連携
    end
    
    Supabase-->>Mutation: Success
    Mutation->>Mutation: invalidateQueries()
    Mutation-->>Hook: Success
    Hook-->>UI: Toast / Navigate
```

### リアルタイム更新

```mermaid
sequenceDiagram
    participant UI as React Component
    participant Supabase as Supabase Client
    participant Realtime as Supabase Realtime
    participant DB as PostgreSQL
    
    UI->>Supabase: supabase.channel().subscribe()
    Supabase->>Realtime: Subscribe
    
    Note over DB: 他ユーザーがデータ更新
    
    DB->>Realtime: Change Event
    Realtime->>Supabase: Broadcast
    Supabase->>UI: Callback
    UI->>UI: 状態更新 / 再レンダリング
```

---

## 5. 認証・認可

### 認証フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant App as React App
    participant Auth as Supabase Auth
    participant DB as PostgreSQL
    
    User->>App: ログイン情報入力
    App->>Auth: signInWithPassword()
    Auth->>Auth: 認証処理
    Auth-->>App: Session + JWT
    App->>DB: users テーブル照会
    DB-->>App: ユーザー情報 + ロール
    App->>App: AuthContext に保存
    App-->>User: ダッシュボード表示
```

### ロールベースアクセス制御

```mermaid
flowchart TB
    subgraph roles [ロール]
        LicenseAdmin[license_admin<br/>ライセンス管理者]
        Admin[admin<br/>組織管理者]
        Staff[staff<br/>スタッフ]
        Customer[customer<br/>顧客]
    end
    
    subgraph access [アクセス権限]
        All[全機能]
        OrgManagement[組織管理]
        StaffTools[スタッフツール]
        BookingSite[予約サイト]
        MyPage[マイページ]
    end
    
    LicenseAdmin --> All
    Admin --> OrgManagement
    Admin --> StaffTools
    Admin --> BookingSite
    Staff --> StaffTools
    Staff --> BookingSite
    Customer --> BookingSite
    Customer --> MyPage
```

### アクセス制御の実装

```typescript
// AuthContext.tsx
interface AuthContextValue {
  user: User | null
  loading: boolean
  isInitialized: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

// ロールチェック
const isAdmin = user?.role === 'admin' || user?.role === 'license_admin'
const isStaff = user?.role === 'staff' || isAdmin
const isCustomer = user?.role === 'customer'

// ページガード
if (!isAdmin && requiresAdmin) {
  return <Navigate to="/dashboard" />
}
```

---

## 6. マルチテナント設計

### データ分離

```mermaid
flowchart TB
    subgraph org1 [組織A]
        Stores1[stores]
        Staff1[staff]
        Scenarios1[scenarios]
        Events1[schedule_events]
        Reservations1[reservations]
    end
    
    subgraph org2 [組織B]
        Stores2[stores]
        Staff2[staff]
        Scenarios2[scenarios]
        Events2[schedule_events]
        Reservations2[reservations]
    end
    
    subgraph shared [共有データ]
        SharedScenarios[共有シナリオ<br/>is_shared=true]
    end
    
    SharedScenarios -.-> Scenarios1
    SharedScenarios -.-> Scenarios2
```

### RLSによるアクセス制御

```sql
-- 現在のユーザーの組織IDを取得
CREATE FUNCTION current_organization_id() RETURNS UUID AS $$
  SELECT organization_id FROM staff 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- RLSポリシー例
CREATE POLICY stores_org_policy ON stores
  FOR ALL USING (
    organization_id = current_organization_id()
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'license_admin'
    )
  );

-- 共有シナリオのポリシー
CREATE POLICY scenarios_org_policy ON scenarios
  FOR SELECT USING (
    organization_id = current_organization_id()
    OR is_shared = true
  );
```

### フロントエンドでの組織管理

```typescript
// useOrganization.ts
export function useOrganization() {
  const { user } = useAuth()
  
  // staff テーブルから organization_id を取得
  const { data: staff } = useQuery({
    queryKey: ['current-staff', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff')
        .select('organization_id, organizations(*)')
        .eq('user_id', user?.id)
        .single()
      return data
    },
    enabled: !!user?.id
  })
  
  return {
    organizationId: staff?.organization_id,
    organization: staff?.organizations
  }
}
```

---

## 7. 外部連携

### 連携アーキテクチャ

```mermaid
flowchart LR
    subgraph supabase [Supabase]
        DB[(PostgreSQL)]
        EdgeFn[Edge Functions]
    end
    
    subgraph email [メール]
        Resend[Resend API]
    end
    
    subgraph discord [Discord]
        Bot[Discord Bot]
        Webhook[Interactions]
    end
    
    subgraph google [Google]
        GAS[Apps Script]
        Sheets[Google Sheets]
    end
    
    subgraph twitter [X/Twitter]
        TwitterAPI[Twitter API]
    end
    
    DB -->|Trigger| EdgeFn
    EdgeFn -->|POST| Resend
    EdgeFn -->|POST| Bot
    Webhook -->|POST| EdgeFn
    EdgeFn -->|POST| GAS
    GAS --> Sheets
    EdgeFn -->|POST| TwitterAPI
```

### メール連携 (Resend)

```mermaid
sequenceDiagram
    participant App as React App
    participant EdgeFn as Edge Function
    participant Resend as Resend API
    participant User as ユーザー
    
    App->>EdgeFn: send-booking-confirmation
    EdgeFn->>EdgeFn: 組織設定からAPIキー取得
    EdgeFn->>Resend: POST /emails
    Resend-->>EdgeFn: { id: "xxx" }
    EdgeFn-->>App: { success: true }
    Resend->>User: メール配信
```

### Discord連携

```mermaid
sequenceDiagram
    participant DB as Database
    participant EdgeFn as Edge Function
    participant Discord as Discord API
    participant GM as GMスタッフ
    
    Note over DB: 貸切予約が登録
    
    DB->>EdgeFn: Database Trigger
    EdgeFn->>EdgeFn: 担当GMのチャンネルID取得
    EdgeFn->>Discord: POST /channels/{id}/messages
    Discord->>GM: 通知表示（ボタン付き）
    
    GM->>Discord: ボタンクリック
    Discord->>EdgeFn: POST /interactions
    EdgeFn->>DB: 回答を保存
    EdgeFn->>Discord: 確認メッセージ更新
```

---

## 8. デプロイメント

### デプロイフロー

```mermaid
flowchart LR
    subgraph dev [開発]
        Local[ローカル開発]
        Git[Git Push]
    end
    
    subgraph ci [CI/CD]
        GitHub[GitHub]
        Vercel[Vercel]
    end
    
    subgraph prod [本番]
        Frontend[React App]
        Supabase[Supabase]
    end
    
    Local --> Git
    Git --> GitHub
    GitHub --> Vercel
    Vercel --> Frontend
    
    Git -->|手動| Supabase
```

### 環境

| 環境 | URL | 用途 |
|------|-----|------|
| 開発 | localhost:5173 | ローカル開発 |
| Preview | xxx.vercel.app | PR プレビュー |
| 本番 | mmq-yoyaq.vercel.app | 本番環境 |

### デプロイコマンド

```bash
# フロントエンド（自動）
git push origin main

# Edge Functions
./deploy-functions.sh

# 単一Function
./deploy-single-function.sh function-name

# データベースマイグレーション
supabase migration up --project-ref <ref>
```

### 環境変数

#### Vercel

| 変数 | 説明 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase プロジェクトURL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名キー |

#### Supabase

| 変数 | 説明 |
|------|------|
| `RESEND_API_KEY` | Resend APIキー |
| `DISCORD_BOT_TOKEN` | Discord Botトークン |
| `SITE_URL` | サイトURL |

---

## 関連ドキュメント

- [system-overview.md](../system-overview.md) - システム概要
- [database-design.md](./database-design.md) - データベース設計
- [api-design.md](./api-design.md) - API設計
- [screen-flow.md](./screen-flow.md) - 画面遷移図
- [deployment/deployment-strategy.md](../deployment/deployment-strategy.md) - デプロイ戦略

