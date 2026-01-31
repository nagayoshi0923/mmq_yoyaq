# 🎯 マーダーミステリー店舗管理システム

[![Deploy Status](https://api.netlify.com/api/v1/badges/your-site-id/deploy-status)](https://app.netlify.com/sites/your-site/deploys)

6店舗対応のマーダーミステリー店舗管理システム

## 📚 ドキュメント

詳細なドキュメントは `docs/` フォルダにあります。

| ドキュメント | 説明 |
|-------------|------|
| **[docs/index.md](./docs/index.md)** | ドキュメント目次（ここから始める） |
| [docs/system-overview.md](./docs/system-overview.md) | システム全体像・技術スタック |
| [docs/features.md](./docs/features.md) | 各機能の概要 |
| [docs/pages.md](./docs/pages.md) | 全ページ一覧・ルーティング |
| [docs/development/](./docs/development/) | 開発ルール・コーディング規約 |
| [docs/setup/](./docs/setup/) | 各種セットアップガイド |
| [docs/features/](./docs/features/) | 機能別詳細ドキュメント |

---

## 🎨 デザインシステム制約（必読・最重要）

### ✅ 必須遵守事項
- **Guidelines.md完全準拠**: 全ページで店舗識別色・公演カテゴリ色システム必須適用
- **タイポグラフィ制約**: `text-*`, `font-*`, `leading-*`クラス使用絶対禁止
- **色の濃度統一**: 背景*-50、境界線*-200、テキスト*-800で固定
- **globals.css活用**: 基本タイポグラフィは自動適用される（オーバーライド禁止）
- **ShadCN UI優先**: 全コンポーネントでShadCN UI使用、自作コンポーネント最小限

### 🎨 Figma Make級デザインシステム
- **Tailwind V4制約システム**: globals.cssによる高度なタイポグラフィ制御
- **企業級色管理**: OKLCH色空間による科学的な色調統一
- **淡い色調維持**: 「プロフェッショナル」「淡くて美しい」の設計哲学
- **業務用UI品質**: 長時間使用に適した目に優しいインターフェース

### ❌ 新規ページ作成時のチェックリスト
- [ ] Guidelines.mdの店舗識別色を適用
- [ ] 公演カテゴリ色を正しく使用
- [ ] ShadCN UIコンポーネントを優先使用
- [ ] `container mx-auto px-4` + `space-y-6`の統一レイアウト
- [ ] 警告表示は`border-2`でアウトライン（背景色なし）
- [ ] タイポグラフィはglobals.cssに依存、Tailwindクラス禁止

## ✨ 主な機能

### 📅 **スケジュール管理（リストカレンダー特殊仕様）**
- **月間Table形式**: 従来のグリッド型カレンダーではなく、独特なTable構造のリスト表示
- **複雑なデータ構造**: `scheduleEvents[monthKey: DaySchedule[]]`による階層管理
- **6店舗×時間帯対応**: 朝・昼・夜の3時間帯に加え、自由時間設定可能
- **状態管理**: localStorage + Supabase双方向同期
- **色システム**: 店舗識別色（背景）+ 公演カテゴリ色（バッジ）の複合表示
- **公演中止・復活機能**: `isCancelled`フラグ + `opacity-50` + Ban icon表示
- **予約連携**: モックデータによる予約人数表示（将来的にStores予約API連携）

### 👥 **スタッフ管理**
- **多角的管理**: GM・マネージャー・企画スタッフの役割分担
- **詳細設定**: 勤務可能店舗・曜日・時間帯・シナリオ習熟度
- **プライバシー保護**: 連絡先のマスキング表示（パスワード「0909」で閲覧）
- **Context管理**: StaffContextによる状態管理 + Supabase同期

### 📚 **シナリオ管理**
- **包括的情報管理**: タイトル・作者・所要時間・難易度・ジャンル・必要道具
- **経済情報**: ライセンス料・制作費・GM代金・参加費の詳細管理
- **在庫連携**: performance_kitsテーブルとの関連付け
- **習熟度追跡**: GM別の経験値・プレイ回数管理

### 🏪 **店舗管理**
- **6店舗統一管理**: 高田馬場（青）・別館①（緑）・別館②（紫）・大久保（橙）・大塚（赤）・埼玉大宮（茶）
- **識別色システム**: 各店舗専用のカラーテーマ（Guidelines.md準拠）
- **運営情報**: 収容人数・部屋数・マネージャー・営業状態
- **Context統合**: StoreContextによる全システム連携

### 💰 **売上・顧客・在庫管理**
- **売上分析**: 月次・店舗別・シナリオ別の多角的集計
- **顧客プロフィール**: 来店履歴・嗜好分析・リマインダー設定
- **在庫追跡**: シナリオキット・小道具・消耗品の管理
- **ライセンス契約**: 作者別・期間別の契約状況管理

### 🔄 **Supabase完全連携**
- **認証システム**: 必ずログイン必須、匿名予約不可
- **リアルタイム同期**: 予約・スケジュール更新の即時反映
- **RLS（Row Level Security）**: ユーザー権限に応じたデータアクセス制御
- **データ移行**: 40個のシナリオ・スタッフ情報の完全同期済み

## 🚀 セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数設定
`.env.local` ファイルを作成：
```env
VITE_SUPABASE_URL=https://lgyhbagdfdyycerijtmk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# 互換用（Legacy API Keysが有効な場合のみ）
# VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. データベーススキーマ確認
```bash
# スキーマの確認
npm run db:check

# データベースの差分確認
npm run db:diff

# データベースリセット（必要に応じて）
npm run db:reset
```

### 4. 開発サーバー起動
```bash
npm run dev
```

## 🗄️ データベース管理

### スキーマ管理
- **スキーマ定義**: `database/create_tables.sql`
- **詳細ドキュメント**: `database/README.md`
- **スキーマ確認**: `npm run db:check`

### よくある問題と解決方法

#### 1. カラム名の変更
- **問題**: `gm_fee` → `gm_assignments`への移行
- **解決**: マイグレーションで段階的に移行
- **注意**: 既存データの移行が必要

#### 2. データ型の変更
- **問題**: `INTEGER` → `JSONB`への変更
- **解決**: 一時的なカラムを作成してデータを移行

#### 3. 制約の追加
- **問題**: `CHECK`制約の追加
- **解決**: 既存データを確認してから制約を追加

### 開発時の注意事項
1. **スキーマ変更時は必ず`database/README.md`を更新**
2. **マイグレーションファイルは必ず作成**
3. **本番環境への適用前にローカルでテスト**
4. **カラム名の変更は慎重に行う**

## 📦 デプロイ

### Netlify
```bash
npm run build
# dist フォルダをNetlifyにデプロイ
```

### Vercel
```bash
npm run build
# Vercel CLIまたはGitHub連携でデプロイ
```

## 🏢 対応店舗（正確なカラーリング）

| 店舗名 | 短縮名 | カラー | 収容人数 | Guidelines.md色指定 |
|--------|--------|--------|----------|-------------------|
| 高田馬場店 | 馬場 | 🔵 青 | 8名 | `bg-blue-50 border-blue-200` |
| 別館① | 別館① | 🟢 緑 | 6名 | `bg-green-50 border-green-200` |
| 別館② | 別館② | 🟣 紫 | 6名 | `bg-purple-50 border-purple-200` |
| 大久保店 | 大久保 | 🟠 橙 | 7名 | `bg-orange-50 border-orange-200` |
| 大塚店 | 大塚 | 🔴 赤 | 6名 | `bg-red-50 border-red-200` |
| 埼玉大宮店 | 埼玉大宮 | 🟤 茶 | 8名 | `bg-amber-50 border-amber-200` |

## 🛠️ 技術仕様（2024年12月現在）

- **フロントエンド**: React 18 + TypeScript + Vite
- **スタイリング**: Tailwind CSS v4 + ShadCN UI + globals.css制約システム
- **UI コンポーネント**: shadcn/ui（企業級品質）
- **状態管理**: Context API（ScenarioContext, StaffContext, StoreContext, EditHistoryContext）
- **データ永続化**: Supabase（メイン） + LocalStorage（キャッシュ・オフライン対応）
- **認証**: Supabase Auth（role=admin/staff/customer自動振り分け）
- **リアルタイム**: Supabase Realtime + Context同期
- **ビルドツール**: Vite（最適化済み）
- **デプロイ**: Netlify / Vercel
- **テスト**: Jest + React Testing Library（将来実装）
- **CI/CD**: GitHub Actions（将来実装）

## 📋 機能一覧

### ✅ 実装済み機能（現在のプロジェクト状況）
- **スケジュール管理**: 月間リストカレンダー形式（Table構造）
- **スタッフ管理**: 役割・勤務条件・連絡先保護機能
- **シナリオ管理**: 在庫・ライセンス・習熟度管理
- **店舗管理**: 6店舗統一管理・識別色システム
- **編集履歴**: EditHistoryContextによる全操作記録
- **Supabase連携**: 双方向データ同期・認証システム
- **デザインシステム**: Guidelines.md + globals.css制約

### 🔄 部分実装・テンプレート準備済み
- **売上管理**: 基本フレームワーク実装済み
- **顧客管理**: インターフェース準備済み
- **在庫管理**: データ構造設計済み
- **ライセンス管理**: 基本機能実装済み
- **予約管理**: モックデータ連携済み

### 🆕 今後実装予定
- **顧客予約サイト**: 公演一覧・予約フォーム・マイページ
- **リアルタイム通知**: 予約・キャンセル・リマインダー
- **高度な分析**: 売上トレンド・顧客行動解析
- **モバイルアプリ**: PWA対応・オフライン機能
- **外部API連携**: 決済システム・メール配信

### 🔒 セキュリティ機能
- **連絡先保護**: 電話番号・メールアドレスのマスキング表示（パスワード「0909」）
- **権限管理**: Supabase RLSによるユーザー権限制御
- **データ暗号化**: 機密情報の暗号化保存
- **監査ログ**: EditHistoryContextによる全操作記録
- **バックアップ**: 定期的なデータバックアップ・復元機能

## 📑 プロジェクト制作順序（管理ツール優先・段階的実装）

### フェーズ 1：基盤 & 認証システム
1. **ログインページ（共通）**
   - Supabase Auth連携完了
   - `role=admin/staff/customer`でルーティング自動切替
   - 単一アプリ・ロール切替運用

2. **管理者ダッシュボード（Admin専用）**
   - 「店舗数 / 公演数 / 今月の予約数」概要表示
   - Guidelines.md色システム適用
   - 10タブナビゲーション統合

### フェーズ 2：マスタ管理（現在ほぼ完成）
3. **店舗管理ページ** 
   - 6店舗の登録・編集完了
   - 識別色システム完全実装
   - Context + Supabase双方向同期

4. **シナリオ管理ページ** 
   - 40個のシナリオデータ同期完了
   - ライセンス料・制作費管理
   - performance_kits連携準備

5. **スタッフ管理ページ** 
   - 役割・担当店舗・習熟度管理
   - 連絡先保護機能実装
   - 出勤可能日・NG日管理

### フェーズ 3：スケジュール作成（現在の核心機能）
6. **リストカレンダー（ScheduleManager）** 
   - Table形式の独特なリスト表示
   - 月間データ管理・localStorage永続化
   - 店舗色 + カテゴリ色の複合表示
   - 公演中止・復活機能完備

7. **スケジュール詳細/編集** 
   - モーダルダイアログによる編集
   - 時間計算・シナリオ自動選択
   - 競合チェック・警告システム

### フェーズ 4：予約連携（次期実装）
8. **予約一覧（管理用）**
   - Supabaseテーブル設計完了
   - 顧客情報・支払いステータス管理
   - スタッフ手動予約追加機能

9. **顧客管理ページ**
   - プロフィール・来店履歴管理
   - 連絡先確認・リマインダー設定
   - RLS権限による適切なアクセス制御

### フェーズ 5：顧客フロント（予約サイト）
10. **顧客トップページ**
    - 店舗紹介・公演案内
    - ログイン必須システム

11. **公演一覧ページ（顧客用）**
    - 公開公演の表示・フィルタ機能
    - 店舗・日付・ジャンル別検索

12. **予約フォームページ**
    - 顧客情報自動入力
    - 人数・オプション選択・決済連携

13. **マイページ（顧客用）**
    - 予約履歴・キャンセル機能
    - 来店履歴・嗜好管理

### フェーズ 6：拡張機能
14. **売上管理ページ**
    - 予約データからの自動集計
    - 月次・店舗別・シナリオ別分析

15. **在庫管理ページ**
    - キット・小道具の在庫状況
    - 店舗間移動・状態管理

16. **通知・リマインダーシステム**
    - 公演前日・当日リマインド
    - メール・SMS配信履歴

## 🗄️ Supabase テーブル設計（正規化・RLS対応）

### 重要な設計変更（Breaking Changes対応）

#### 1. `schedule_events` 正規化（必須対応）
```sql
-- 段階的移行推奨
-- フェーズ1: 既存システム維持
-- フェーズ2: 新カラム追加
ALTER TABLE schedule_events
  ADD COLUMN scenario_id UUID REFERENCES scenarios(id) ON DELETE RESTRICT,
  ADD COLUMN store_id    UUID REFERENCES stores(id)    ON DELETE RESTRICT,
  ADD COLUMN start_at    TIMESTAMPTZ NOT NULL,
  ADD COLUMN end_at      TIMESTAMPTZ NOT NULL,
  ADD COLUMN published   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN capacity    INTEGER,
  ADD COLUMN status      TEXT NOT NULL DEFAULT 'scheduled';

-- フェーズ3: データ移行スクリプト実行
-- フェーズ4: 旧カラム削除
```

#### 2. ユーザー権限システム
```sql
-- Role ENUM化（タイプミス防止）
CREATE TYPE app_role AS ENUM ('admin','staff','customer');
ALTER TABLE users
  ALTER COLUMN role TYPE app_role USING role::app_role,
  ALTER COLUMN role SET NOT NULL;

-- RLS基本設定
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select_self ON customers FOR SELECT
  USING (auth.uid() = user_id);
```

### 主要テーブル構造
### staff（スタッフ情報）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| name        | TEXT   | 氏名 |
| line_name   | TEXT   | LINE名 |
| x_account   | TEXT   | X（旧Twitter）アカウント |
| role        | TEXT[] | 役割（複数可） |
| stores      | TEXT[] | 担当店舗 |
| ng_days     | TEXT[] | 出勤不可日 |
| want_to_learn | TEXT[] | 学びたい内容 |
| available_scenarios | TEXT[] | 担当可能シナリオ（表示用） |
| notes       | TEXT   | メモ |
| phone       | TEXT   | 電話番号 |
| email       | TEXT   | メールアドレス |
| availability| TEXT[] | 出勤可能日 |
| experience  | INTEGER | 経験年数 |
| special_scenarios | TEXT[] | 得意シナリオ |
| status      | TEXT   | 'active' / 'inactive' / 'on-leave' |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

---

### staff_scenario_assignments（スタッフ⇔シナリオのリレーション）
| カラム名    | 型          | 説明 |
|-------------|-------------|------|
| staff_id    | UUID        | staff.id（FK） |
| scenario_id | UUID        | scenarios.id（FK） |
| assigned_at | TIMESTAMPTZ | 担当開始日時 |
| notes       | TEXT        | 備考 |
| PRIMARY KEY | (staff_id, scenario_id) | 複合主キー |

---

### scenarios（シナリオ）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| title       | TEXT   | シナリオ名 |
| description | TEXT   | 説明 |
| author      | TEXT   | 作者 |
| license_amount | INTEGER | ライセンス料 |
| duration    | INTEGER | 所要時間（分） |
| player_count_min | INTEGER | 最小プレイヤー数 |
| player_count_max | INTEGER | 最大プレイヤー数 |
| difficulty  | INTEGER | 難易度（1-5） |
| available_gms | TEXT[] | 担当可能GM |
| rating      | DECIMAL(2,1) | 評価 |
| play_count  | INTEGER | 累計公演回数 |
| status      | TEXT   | 'available' / 'maintenance' / 'retired' |
| required_props | TEXT[] | 必要小道具 |
| props       | JSONB  | 小道具詳細（{ name, cost, costType }） |
| genre       | TEXT[] | ジャンル |
| production_cost | INTEGER | 制作費合計 |
| production_cost_items | JSONB | 制作費内訳リスト |
| gm_fee      | INTEGER | GM代金（標準値） |
| participation_fee | INTEGER | 参加費（標準値） |
| notes       | TEXT   | メモ |
| has_pre_reading | BOOLEAN | 事前読解有無 |
| release_date | DATE  | 公開日 |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

---

### schedule_events（公演スケジュール/予約枠）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| date        | DATE   | 公演日 |
| venue       | TEXT   | 会場 |
| scenario    | TEXT   | シナリオ名 |
| gms         | TEXT[] | 担当GM |
| start_time  | TIME   | 開始時刻 |
| end_time    | TIME   | 終了時刻 |
| category    | TEXT   | 公演種別（オープン/貸切/テスト等） |
| reservation_info | TEXT | 予約情報 |
| notes       | TEXT   | メモ |
| is_cancelled | BOOLEAN | キャンセルフラグ |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

---

### reservations（予約）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| reservation_number | TEXT | 予約番号（ユニーク） |
| reservation_page_id | TEXT | 予約ページID |
| title       | TEXT   | 予約タイトル |
| scenario_id | UUID   | FK: シナリオ |
| store_id    | UUID   | FK: 店舗 |
| customer_id | UUID   | FK: 顧客 |
| requested_datetime | TIMESTAMPTZ | 希望日時 |
| actual_datetime | TIMESTAMPTZ | 実際の来店日時 |
| duration    | INTEGER | 予約時間（分） |
| participant_count | INTEGER | 参加人数 |
| participant_names | TEXT[] | 参加者名リスト |
| assigned_staff | TEXT[] | 担当スタッフID配列 |
| gm_staff    | TEXT   | メインGMスタッフID |
| base_price  | INTEGER | 基本料金 |
| options_price | INTEGER | オプション料金 |
| total_price | INTEGER | 合計金額 |
| discount_amount | INTEGER | 割引額 |
| final_price | INTEGER | 最終支払額 |
| payment_status | TEXT | 支払状況 |
| payment_method | TEXT | 支払方法 |
| payment_datetime | TIMESTAMPTZ | 支払日時 |
| status      | TEXT   | 予約ステータス |
| customer_notes | TEXT | 顧客メモ |
| staff_notes | TEXT | スタッフメモ |
| special_requests | TEXT | 特別な要望 |
| cancellation_reason | TEXT | キャンセル理由 |
| cancelled_at | TIMESTAMPTZ | キャンセル日時 |
| external_reservation_id | TEXT | 外部システムID |
| reservation_source | TEXT | 予約経路 |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

---

### stores（店舗）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| name        | TEXT   | 店舗名 |
| short_name  | TEXT   | 略称 |
| address     | TEXT   | 住所 |
| phone_number| TEXT   | 電話番号 |
| email       | TEXT   | メールアドレス |
| opening_date | DATE  | 開店日 |
| manager_name | TEXT  | 店長名 |
| status      | TEXT   | 'active' / 'temporarily_closed' / 'closed' |
| capacity    | INTEGER | 定員 |
| rooms       | INTEGER | 部屋数 |
| notes       | TEXT   | メモ |
| color       | TEXT   | カラーコード |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

---

### performance_kits（公演キット/在庫）
| カラム名    | 型     | 説明 |
|-------------|--------|------|
| id          | UUID   | PK |
| scenario_id | UUID   | FK: シナリオ |
| scenario_title | TEXT | シナリオ名 |
| kit_number  | INTEGER | キット番号 |
| condition   | TEXT   | 状態（excellent/good/fair/poor/damaged） |
| last_used   | DATE   | 最終使用日 |
| notes       | TEXT   | メモ |
| store_id    | UUID   | FK: 店舗 |
| created_at  | TIMESTAMPTZ | 作成日時 |
| updated_at  | TIMESTAMPTZ | 更新日時 |

## 🎯 デザイン品質保証システム

### Guidelines.md完全準拠チェック

#### 新規コンポーネント作成時の必須事項
```jsx
// ✅ 正しい実装例
<Card className="bg-blue-50 border-blue-200"> {/* 店舗識別色 */}
  <CardHeader>
    <CardTitle>高田馬場店の公演</CardTitle> {/* globals.cssタイポグラフィ */}
  </CardHeader>
  <CardContent className="space-y-4">
    <Badge className="bg-purple-100 text-purple-800">貸切公演</Badge> {/* カテゴリ色 */}
    <p>公演の詳細説明...</p> {/* globals.css自動適用 */}
  </CardContent>
</Card>

// ❌ 避けるべき実装
<div className="bg-gradient-to-r from-purple-500 to-pink-500 text-2xl font-bold">
  {/* 派手な装飾・Tailwindフォントクラス使用 */}
</div>
```

#### 色システム適用例
```css
/* 店舗識別色の正しい使用 */
.takadanobaba-theme {
  background: theme(colors.blue.50);
  border-color: theme(colors.blue.200);
  color: theme(colors.blue.800);
}

/* 公演カテゴリの正しい使用 */
.open-performance-badge {
  background: theme(colors.blue.100);
  color: theme(colors.blue.800);
}
```

### レスポンシブデ��イン標準
```jsx
// 統一レイアウトパターン
<main className="container mx-auto px-4 py-6">
  <div className="space-y-6">
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* コンテンツ */}
    </section>
  </div>
</main>
```

## ⚠️ 設計レビュー（重要な注意点）

### 🔧 技術的制約
- **Tailwindフォントクラス**: `text-*`, `font-*`, `leading-*`の使用厳禁
- **色濃度統一**: 背景*-50、境界線*-200、テキスト*-800のみ使用
- **ShadCN優先**: 自作コンポーネントよりShadCN UI優先
- **Context依存**: Redux導入前はContext APIで状態管理

### 📊 データ整合性
- **リレーション管理**: scenario_id, store_id, customer_idの外部キー制約必須
- **予約連携**: schedule_eventsとreservationsの一意紐付けルール明確化
- **履歴管理**: EditHistoryContextによる全操作記録必須

### 🎨 デザイン品質
- **Guidelines.md参照**: 全新規実装で必須確認
- **色システム一貫性**: 店舗識別色・公演カテゴリ色の正確な適用
- **淡い色調維持**: プロフェッショナルUI品質の維持

### 🔒 セキュリティ要件
- **ログイン必須**: 匿名予約・アクセス完全禁止
- **RLS適用**: 適切な権限管理・データアクセス制御
- **連絡先保護**: マスキング表示・暗号化必須

## 📱 対応ブラウザ・環境

- **デスクトップ**: Chrome 90以降、Firefox 88以降、Safari 14以降、Edge 90以降
- **モバイル**: iOS Safari 14以降、Android Chrome 90以降
- **レスポンシブ**: 320px（モバイル）〜 1920px（デスクトップ）完全対応
- **アクセシビリティ**: WCAG 2.1 AA準拠

## 🤝 開発チーム・貢献者

- **システム設計**: Queens Waltz 開発チーム
- **UI/UXデザイン**: Guidelines.md設計チーム
- **店舗運営連携**: マーダーミステリー店舗運営チーム
- **品質管理**: 店舗スタッフ・テストチーム

## 📧 メール送信機能

このシステムは **Resend API** + **独自ドメイン（mmq.game）** を使用してメール送信を行っています。

### 実装済み機能

| メール種類 | トリガー | 送信方法 | 送信元 | ステータス |
|---------|---------|---------|---------|----------|
| 予約確認メール | 予約完了時 | Edge Function → Resend API | `noreply@mmq.game` | ✅ 実装済み |
| リマインダーメール | スケジュール設定 | Edge Function → Resend API | `noreply@mmq.game` | ✅ 実装済み |
| スタッフ招待メール | スタッフ招待時 | Edge Function → Resend API | `noreply@mmq.game` | ✅ 実装済み |
| パスワードリセット | リセット要求時 | Supabase Auth → Resend SMTP | `noreply@mmq.game` | ✅ 実装済み |
| サインアップ確認 | アカウント作成時 | Supabase Auth → Resend SMTP | `noreply@mmq.game` | ✅ 実装済み |
| キャンセル確認 | 予約キャンセル時 | - | - | ❌ 未実装 |
| 貸切確定通知 | 貸切承認時 | - | - | ❌ 未実装 |
| 貸切却下通知 | 貸切却下時 | - | - | ❌ 未実装 |

**メール機能の特徴:**
- 📧 独自ドメイン `mmq.game` を使用（SPF/DKIM/DMARC認証済み）
- 📝 HTMLテンプレートでリッチなメールデザイン
- 🔒 サーバーサイド処理でセキュア
- 🆓 月3,000通まで無料（Resend Free プラン）

### セットアップ

#### 🚀 クイックセットアップ（パスワードリセットメール）

パスワードリセットメールを有効にするには、Supabase Auth SMTP設定が必要です：

```
1. Supabase Dashboard にアクセス:
   https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth

2. SMTP Settings セクションで以下を設定:
   - Enable Custom SMTP: ON
   - Host: smtp.resend.com
   - Port: 587
   - Username: resend
   - Password: [RESEND_API_KEY]
   - Sender: noreply@mmq.game

3. Save をクリック
```

詳細: **RESEND_QUICK_SETUP.md** を参照

#### 📚 詳細セットアップ

完全なセットアップ手順（ドメイン認証、Edge Functions デプロイなど）:

```bash
# 1. Resend APIキーをSupabase Secretsに設定
supabase secrets set RESEND_API_KEY=re_your_api_key

# 2. すべてのEdge Functionsをデプロイ
./deploy-functions.sh

# または個別にデプロイ
./deploy-single-function.sh send-booking-confirmation
./deploy-single-function.sh send-reminder-emails
./deploy-single-function.sh invite-staff
```

詳細: **EMAIL_SETUP.md** を参照

### 今後の拡張予定
- ⏳ **キャンセル確認メール** - 予約キャンセル時に自動送信
- ⏳ **貸切確定通知メール** - 貸切予約承認時に自動送信
- ⏳ **貸切却下通知メール** - 貸切リクエスト却下時に自動送信
- ⏳ **予約変更確認メール** - 予約内容変更時に自動送信
- ⏳ **リマインダー自動送信** - 前日・3日前などに自動送信
- ⏳ **定期レポートメール** - 管理者向け売上・予約レポート

詳細: **`EMAIL_USAGE_SCENARIOS.md`** - 全メール使用シーンと実装状況

## 🔗 関連ドキュメント

> **📚 全ドキュメントの目次は [docs/INDEX.md](./docs/INDEX.md) を参照**

### 必読ドキュメント
- **[docs/INDEX.md](./docs/INDEX.md)**: 📚 **ドキュメント目次（まずここから）**
- **[docs/PAGES.md](./docs/PAGES.md)**: ページ一覧・要件定義書
- **[docs/development/Guidelines.md](./docs/development/Guidelines.md)**: デザインシステム詳細仕様
- **[docs/development/CRITICAL_FEATURES.md](./docs/development/CRITICAL_FEATURES.md)**: 重要機能保護リスト

### セットアップ
- **[docs/setup/email/](./docs/setup/email/)**: メール機能設定
- **[docs/setup/discord/](./docs/setup/discord/)**: Discord通知設定
- **[docs/setup/google-sheets/](./docs/setup/google-sheets/)**: Google Sheets連携
- **[docs/setup/supabase/](./docs/setup/supabase/)**: Supabase設定

### デプロイ・データベース
- **[docs/deployment/](./docs/deployment/)**: デプロイ手順
- **[database/README.md](./database/README.md)**: データベース設計

## 📄 ライセンス

Queens Waltz マーダーミステリー店舗管理システム  
© 2024 Queens Waltz. All rights reserved.

---

## 🎯 開発者向けクイックガイド

### 新規開発者のオンボーディング
1. **必読ドキュメント**: `docs/INDEX.md` → `docs/development/Guidelines.md`の完全理解
2. **環境構築**: Node.js 18以降 + Supabase接続確認
3. **デザインシステム**: globals.cssの制約システム理解
4. **既存コード確認**: ScheduleManager.tsxの複雑な構造把握
5. **テスト実行**: `npm run dev`での動作確認

### デバッグ・トラブルシューティング
- **状態確認**: React DevToolsでContext状態監視
- **Supabase接続**: SupabaseStatusコンポーネントで接続状態確認
- **LocalStorage**: ブラウザ開発者ツールでキャッシュ状態確認
- **色システム**: Guidelines.mdとの整合性チェック

### パフォーマンス最適化
- **Lazy Loading**: 既実装のコンポーネント遅延読み込み活用
- **Context分離**: 必要な機能のみのContext読み込み
- **Supabase最適化**: 適切なクエリ・インデックス使用
- **バンドルサイズ**: 不要なライブラリの除去

---

**🎮 Queens Waltz マーダーミステリー店舗運営を支援する企業級管理システム**

> このシステムは単なる管理ツールを超え、マーダーミステリー業界の店舗運営を革新する包括的プラットフォームです。美しいデザイン、堅牢なアーキテクチャ、そしてスタッフ・顧客双方の体験向上を実現します。