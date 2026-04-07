# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Queens Waltz の6店舗対応マーダーミステリー店舗管理システム。React + TypeScript + Supabase（PostgreSQL）のマルチテナント SPA。

## コマンド

```bash
# 開発
npm run dev                  # 開発サーバー起動
npm run dev:local            # Supabase ローカル起動 + 開発サーバー

# ビルド・チェック
npm run build                # 型チェック + ビルド（デプロイ前必須）
npm run build:fast           # 型チェックなし高速ビルド
npm run typecheck            # 型チェックのみ
npm run lint                 # ESLint（max-warnings 100）
npm run verify               # セキュリティ + 型チェック + lint + ビルド（コミット前推奨）

# データベース
npm run db:check             # スキーマ整合性確認
npm run db:diff              # スキーマ差分確認
npm run db:push:staging      # ステージングにマイグレーション適用（権限検証も実行）
npm run check:permissions    # RLS権限検証
npm run check:permissions:fix # 権限修復SQL表示

# テスト
npm run test:rpcs            # RPCスモークテスト（ローカルSupabase起動中に実行）
npm run test:e2e             # Playwright E2Eテスト
npm run test:e2e:ui          # Playwright UIモードで実行

# マイグレーション作成
npm run supabase:migration:new  # 新規マイグレーションファイル作成
```

**コミット前チェック**: `npm run pre-commit`（セキュリティ + マルチテナント + 型チェック）

## アーキテクチャ

### データフロー

```
Pages/Components
  ↓ カスタムフック（src/hooks/）でデータ管理
  ↓ APIモジュール（src/lib/api/）でSupabase操作
  ↓ Supabase（PostgreSQL + RLS + RPC関数）
```

- **データ取得**: TanStack React Query（staleTime: 5分）でキャッシュ管理
- **状態管理**: カスタムフック + React Query。グローバル状態は `src/contexts/`（AuthContext, RouteScrollRestorationContext）のみ
- **ページ状態の保持**: `usePageState` フック（sessionStorage）でフィルタ・スクロール位置を復元

### 重要な設計上の制約

**マルチテナント**: 全データは `organization_id` で分離。INSERT/SELECT で必ず付与・フィルタすること。`organization_id` 不要なテーブルは `users`, `organizations`, `authors`, `auth_logs` のみ。RLS で保護されているが、コード側でも必ずフィルタを追加する。

**RPC関数**: `supabase.rpc()` に移行した場合、直接INSERT時に保存していた全フィールドがサポートされているか必ず確認する（過去に `payment_method` 欠落バグあり）。PL/pgSQL は関数作成時にボディを構文チェックしないため、マイグレーションでRPCを変更した場合は必ず `npm run test:rpcs` でスモークテストを実行すること。

### ディレクトリ構成の重要ポイント

| パス | 役割 |
|------|------|
| `src/lib/api/` | APIモジュール群（scheduleApi, reservationApi, scenarioApi 等16+ファイル） |
| `src/lib/reservationApi.ts` | 予約APIのメインファイル（複数予約タイプで共用、変更時は全呼び出し元を確認） |
| `src/hooks/` | 30+のカスタムフック。useEventOperations.ts・useScheduleData.ts が特に複雑 |
| `src/types/index.ts` | 全型定義の正規ソース。DBカラム名と一致させる |
| `src/contexts/AuthContext.tsx` | 認証 + ロールベースアクセス制御 |
| `supabase/migrations/` | 305+のマイグレーションファイル |
| `docs/` | 機能・開発ルール・デザインガイドライン |

### スケジュール管理の特殊仕様

`ScheduleManager` は通常のグリッドカレンダーではなく、`scheduleEvents[monthKey: DaySchedule[]]` の階層構造を持つ独自のリスト型カレンダー。朝・昼・夜の3時間帯 + 自由時間設定。localStorage と Supabase の双方向同期。

## 必須ルール

### コミットメッセージ

**必ず日本語で記述**（Conventional Commits 形式）:
```
feat: 新機能を追加
fix: バグを修正
refactor: コードをリファクタリング
docs: ドキュメントを更新
```

### 共有関数変更時のリグレッション防止

変更前に必ず全呼び出し元を確認:
```bash
grep -rn "関数名" src --include="*.ts" --include="*.tsx"
```

特に注意が必要な関数: `reservationApi.create()`（顧客/スタッフ/貸切の3タイプで共用）、`supabase.rpc()` 呼び出し、認証関連、日時処理ユーティリティ。

**絶対禁止**: バグ修正のために既存機能を削除・無効化・コメントアウトすること。機能削除はユーザーからの明示的な指示がある場合のみ。

### DBカラム名ルール

Supabase クエリ実装前にカラム名を確認:
```bash
grep -rn "テーブル名" src --include="*.ts" --include="*.tsx" | head -20
```

型定義（`src/types/index.ts`）は DB カラム名（snake_case）と必ず一致させる。フロントエンド変数は camelCase。同じ概念に複数の名前を作らない。

### 日時・タイムゾーン

全日時は **JST（+09:00）を明示**:
```typescript
// ✅ 正しい
const eventDateTime = `${date}T${time}+09:00`

// ❌ NG（タイムゾーンなし）
const eventDateTime = `${date}T${time}`

// ❌ NG（UTCになる）
new Date().toISOString()
```

`schedule_events` の `date`（YYYY-MM-DD）と `start_time`（HH:MM:SS）は JST として保存されているため、Date 化する際は `+09:00` を付与する。

### デプロイフロー

```
feature/* ブランチ
  → PR作成（base: staging）        ← AIはここまで
  → Vercelがstagingを自動デプロイ
  → ユーザーがステージングで動作確認  ← ユーザーの役割
  → staging → main マージ承認
  → npm run db:push:prod（本番DB適用）
```

**役割分担**:
- AI: Issue実装・型チェック・`staging` 向けPR作成
- ユーザー: ステージング確認・main マージ・本番DB適用判断

**ステージングURL**: `https://mmq-yoyaq-git-staging-nagayoshi0923s-projects.vercel.app`
- ステージングDB: `lavutzztfqbdndjiwluc`（`npm run db:push:staging` で適用）
- 本番DB: `cznpcewciwywcqcxktba`（`npm run db:push:prod` で適用）

**`supabase db push --linked` は本番環境に接続。** ステージングとは別物。マイグレーション適用後は必ず `npm run check:permissions` を実行。

マイグレーション作成時のチェック:
- `CREATE POLICY` の前に `DROP POLICY IF EXISTS` を置く
- `storage.objects` に `COMMENT ON POLICY` を書かない
- `anon` 必須テーブルの権限を壊さない（`organizations`, `stores`, `scenario_masters`, `schedule_events`, `organization_scenarios`, `business_hours_settings` 等）
- **RPC を変更したら `npm run test:rpcs` を実行**（PL/pgSQL は作成時に構文チェックされない）
- `jsonb_each_text() AS alias(col1, col2)` は PL/pgSQL で壊れるため、サブクエリで展開する
- カラムの型を確認する（`TEXT[]` に `@> jsonb_build_array()` は使えない、`ANY()` を使う）

## デザインシステム

**タイポグラフィ**: `text-*`, `font-*`, `leading-*` の Tailwind クラスは**使用禁止**。`globals.css` の設定が自動適用される。

**レイアウト統一**: `container mx-auto px-4` + `space-y-6`

**コンポーネント**: ShadCN UI（`src/components/ui/`）を優先。自作コンポーネントは最小限。

**入力エリア統一色**: `#F6F9FB`（Input, Textarea, Select 全て）

### 店舗識別色（全ページ必須）

| 店舗 | Badge/Tag | Card/Background |
|------|-----------|-----------------|
| 高田馬場（青） | `bg-blue-100 text-blue-800` | `bg-blue-50 border-blue-200` |
| 別館①（緑） | `bg-green-100 text-green-800` | `bg-green-50 border-green-200` |
| 別館②（紫） | `bg-purple-100 text-purple-800` | `bg-purple-50 border-purple-200` |
| 大久保（橙） | `bg-orange-100 text-orange-800` | `bg-orange-50 border-orange-200` |
| 大塚（赤） | `bg-red-100 text-red-800` | `bg-red-50 border-red-200` |
| 埼玉大宮（茶） | `bg-amber-100 text-amber-800` | `bg-amber-50 border-amber-200` |

### 公演カテゴリ色

- オープン公演: `bg-blue-100 text-blue-800`
- 貸切公演: `bg-purple-100 text-purple-800`
- GMテスト: `bg-orange-100 text-orange-800`

## ドキュメント更新ルール

- ページ追加・変更時 → `docs/pages.md` を更新
- 重要機能変更時 → `docs/development/critical-features.md` を更新
- UI要素追加時 → `docs/development/ui-design.md` を更新
- ドキュメント変更はコードと同じコミットに含める
