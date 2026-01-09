# MMQ システム概要

**最終更新**: 2026-01-10

> **注意**: このドキュメントは簡易版です。詳細な設計情報は [design/master-design.md](./design/master-design.md) を参照してください。

---

## 設計ドキュメント（推奨）

システムの全体像を理解するには、以下の設計ドキュメントを参照してください：

| ドキュメント | 内容 |
|-------------|------|
| **[design/master-design.md](./design/master-design.md)** | システム全体を1枚で俯瞰（まずこれを読む） |
| [design/database-design.md](./design/database-design.md) | データベース設計（ER図・テーブル定義） |
| [design/screen-flow.md](./design/screen-flow.md) | 画面遷移図（ユーザーフロー） |
| [design/api-design.md](./design/api-design.md) | API設計（Edge Functions） |
| [design/architecture.md](./design/architecture.md) | アーキテクチャ詳細 |

---

## クイックリファレンス

### MMQとは

**MMQ（Murder Mystery Queue）** は、マーダーミステリー店舗の予約・運営を管理するマルチテナント型SaaSシステムです。

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + TypeScript + Vite |
| UI | shadcn/ui + TailwindCSS |
| バックエンド | Supabase (PostgreSQL + Auth + Edge Functions) |
| ホスティング | Vercel |
| メール | Resend API |
| 通知 | Discord Bot |

### ユーザーロール

| ロール | 権限 |
|--------|------|
| **license_admin** | 全機能 + テナント管理 |
| **admin** | 組織内の全機能 |
| **staff** | シフト提出、GM確認 |
| **customer** | 予約サイト、マイページ |

### 開発コマンド

```bash
npm run dev        # 開発サーバー起動
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run verify     # 全チェック（コミット前必須）
```

---

## 詳細ドキュメント

| カテゴリ | リンク |
|---------|--------|
| ページ一覧 | [pages.md](./pages.md) |
| 機能詳細 | [features.md](./features.md) |
| 開発ルール | [development/](./development/) |
| セットアップ | [setup/](./setup/) |

---

> **完全な設計情報は [design/master-design.md](./design/master-design.md) を参照してください。**
