# MMQ ドキュメント

**最終更新**: 2026-01-10

MMQシステムの引き継ぎ・開発に必要なドキュメント集。

---

## 📖 まず読むべきドキュメント

新しい開発者は、**設計書**から読み始めてください：

### 🎯 設計書（推奨：まずこれを読む）

| 順番 | ドキュメント | 内容 |
|-----|-------------|------|
| 1️⃣ | **[design/master-design.md](./design/master-design.md)** | 🌟 システム全体を1枚で俯瞰（これを読めば全体像がわかる） |
| 2️⃣ | [design/database-design.md](./design/database-design.md) | データベース設計（ER図・テーブル定義） |
| 3️⃣ | [design/screen-flow.md](./design/screen-flow.md) | 画面遷移図（ユーザーフロー） |
| 4️⃣ | [design/api-design.md](./design/api-design.md) | API設計（Edge Functions一覧） |
| 5️⃣ | [design/architecture.md](./design/architecture.md) | アーキテクチャ詳細図 |

### 📚 その他のドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [features.md](./features.md) | 各機能の概要 |
| [pages.md](./pages.md) | 全ページ一覧・ルーティング |
| [development/critical-features.md](./development/critical-features.md) | 削除禁止の重要機能 |
| [development/multi-tenant-security.md](./development/multi-tenant-security.md) | 🚨 マルチテナント セキュリティ |

---

## 📁 フォルダ構造

```
docs/
├── index.md                # このファイル
├── system-overview.md      # システム全体像
├── features.md             # 機能概要
├── pages.md                # ページ一覧
│
├── design/                 # 設計ドキュメント（NEW）
│   ├── master-design.md    #   マスター設計書（全体俯瞰）
│   ├── database-design.md  #   データベース設計（ER図）
│   ├── screen-flow.md      #   画面遷移図
│   ├── api-design.md       #   API設計（Edge Functions）
│   └── architecture.md     #   アーキテクチャ詳細
│
├── features/               # 機能詳細（14機能）
│   ├── schedule-manager/   #   スケジュール管理
│   ├── reservation/        #   予約機能
│   ├── private-booking/    #   貸切予約
│   ├── notifications/      #   通知機能
│   ├── shift-management/   #   シフト管理
│   ├── staff-management/   #   スタッフ管理
│   ├── scenario-management/#   シナリオ管理
│   ├── sales-management/   #   売上管理
│   ├── license-management/ #   ライセンス管理
│   ├── author-portal/      #   作者ポータル
│   ├── customer-management/#   顧客管理
│   ├── salary-calculation/ #   給与計算
│   ├── store-organization/ #   店舗・組織管理
│   └── auth-system/        #   認証システム
│
├── development/            # 開発ルール
│   ├── critical-features.md #  重要機能（削除禁止）
│   ├── design-guidelines.md #  デザインシステム
│   ├── ui-design.md        #   UI要素詳細
│   └── ...
│
├── setup/                  # 外部連携セットアップ
│   ├── email/              #   メール送信（Resend）
│   ├── discord/            #   Discord通知
│   ├── google-sheets/      #   Google Sheets連携
│   └── supabase/           #   Supabase設定
│
├── deployment/             # デプロイ関連
│
├── data/                   # 参照データ
│
└── archive/                # 古いドキュメント（参照専用）
```

---

## 📚 ドキュメント一覧

### システム理解

| ファイル | 説明 |
|---------|------|
| [system-overview.md](./system-overview.md) | システム全体像・構成図・技術スタック |
| [features.md](./features.md) | 各機能の概要説明 |
| [pages.md](./pages.md) | 全ページ一覧・ルーティング |

### 設計ドキュメント（`design/`）

| ファイル | 説明 |
|---------|------|
| [master-design.md](./design/master-design.md) | マスター設計書（全体を1枚で俯瞰） |
| [database-design.md](./design/database-design.md) | データベース設計書（ER図・テーブル定義） |
| [screen-flow.md](./design/screen-flow.md) | 画面遷移図（ユーザーフロー） |
| [api-design.md](./design/api-design.md) | API設計書（Edge Functions詳細） |
| [architecture.md](./design/architecture.md) | アーキテクチャ詳細図（コンポーネント・データフロー） |

### 機能詳細（`features/`）

詳細は [features/README.md](./features/README.md) を参照。

#### コア機能

| フォルダ | 機能 |
|---------|------|
| [schedule-manager/](./features/schedule-manager/) | 公演スケジュール管理・🚨重複チェック |
| [reservation/](./features/reservation/) | 通常予約フロー |
| [private-booking/](./features/private-booking/) | 貸切予約・GM確認・🚨競合チェック |

#### 運営機能

| フォルダ | 機能 |
|---------|------|
| [shift-management/](./features/shift-management/) | シフト提出・締切管理 |
| [staff-management/](./features/staff-management/) | スタッフ登録・招待・役割 |
| [scenario-management/](./features/scenario-management/) | シナリオ情報・料金設定 |
| [customer-management/](./features/customer-management/) | 顧客情報管理 |

#### 財務機能

| フォルダ | 機能 |
|---------|------|
| [sales-management/](./features/sales-management/) | 売上集計・分析 |
| [salary-calculation/](./features/salary-calculation/) | GM給与計算 |
| [license-management/](./features/license-management/) | ライセンス料管理 |
| [author-portal/](./features/author-portal/) | 作者向けポータル |

#### 基盤機能

| フォルダ | 機能 |
|---------|------|
| [notifications/](./features/notifications/) | Discord・メール通知 |
| [store-organization/](./features/store-organization/) | 店舗・組織・マルチテナント |
| [auth-system/](./features/auth-system/) | 認証・権限システム |

### 開発ルール（`development/`）

| ファイル | 説明 |
|---------|------|
| [critical-features.md](./development/critical-features.md) | 🚨 削除禁止の重要機能 |
| [multi-tenant-security.md](./development/multi-tenant-security.md) | 🚨 マルチテナント セキュリティ（organization_id） |
| [design-guidelines.md](./development/design-guidelines.md) | デザインシステム・色・フォント |
| [ui-design.md](./development/ui-design.md) | ページ別UI要素詳細 |
| [date-handling.md](./development/date-handling.md) | 日付処理のルール |
| [status-badge-logic.md](./development/status-badge-logic.md) | ステータスバッジの表示ロジック |

### セットアップ（`setup/`）

詳細は [setup/README.md](./setup/README.md) を参照。

| フォルダ | 内容 |
|---------|------|
| [email/](./setup/email/) | メール送信（Resend API） |
| [discord/](./setup/discord/) | Discord通知（Bot設定） |
| [google-sheets/](./setup/google-sheets/) | Google Sheets連携 |
| [supabase/](./setup/supabase/) | Supabase設定 |

### デプロイ（`deployment/`）

| ファイル | 説明 |
|---------|------|
| [deployment-strategy.md](./deployment/deployment-strategy.md) | デプロイ戦略・ブランチ管理 |

### 参照データ（`data/`）

詳細は [data/README.md](./data/README.md) を参照。

| ファイル | 説明 |
|---------|------|
| [scenario-master-list.md](./data/scenario-master-list.md) | シナリオ一覧 |
| [license-list.md](./data/license-list.md) | ライセンス情報 |
| [scenario-salary-list.md](./data/scenario-salary-list.md) | シナリオ別給与情報 |

### アーカイブ（`archive/`）

> ⚠️ **注意**: 古いドキュメント。現在のシステムと一致している保証なし。

---

## 🔧 プロジェクトルール

開発ルールは `rules/rurle.mdc` に記載。

主なルール：
- コミット前に `npm run verify` を実行
- ページ変更時は `docs/pages.md` を更新
- 重要機能を変更時は `docs/development/critical-features.md` を更新
- ドキュメントはコード変更と同じコミットで更新

---

## ❓ よくある質問

| 質問 | 参照先 |
|------|--------|
| このシステムは何？ | [system-overview.md](./system-overview.md) |
| 全体像を俯瞰したい | [design/master-design.md](./design/master-design.md) |
| データベース構造を知りたい | [design/database-design.md](./design/database-design.md) |
| 画面遷移を知りたい | [design/screen-flow.md](./design/screen-flow.md) |
| APIの仕様を知りたい | [design/api-design.md](./design/api-design.md) |
| この機能はどう動いている？ | [features/](./features/) |
| 予約機能を修正したい | [features/reservation/](./features/reservation/) |
| 通知を設定したい | [setup/README.md](./setup/README.md) |
| コードを変更していい？ | [development/critical-features.md](./development/critical-features.md) を確認 |

---

## 📝 ドキュメント更新ルール

詳細は `rules/rurle.mdc` の「13) ドキュメント信頼性ルール」を参照。

1. **コード変更時** → 関連ドキュメントを同じコミットで更新
2. **新規ドキュメント作成時** → このindexに追加
3. **古いドキュメント** → `archive/` に移動
