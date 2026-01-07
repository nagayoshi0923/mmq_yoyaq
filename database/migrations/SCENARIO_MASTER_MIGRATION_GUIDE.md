# シナリオマスタ移行ガイド

## 概要

このガイドでは、従来の `scenarios` テーブルから新しい2層構造（`scenario_masters` + `organization_scenarios`）への移行手順を説明します。

## 背景

### 旧構造
- `scenarios` テーブルに全てのデータが格納
- 各組織が独自にシナリオデータを作成・管理
- 同じシナリオが重複して登録される問題

### 新構造
- `scenario_masters` - MMQ共通のシナリオ情報（作品そのもの）
- `organization_scenarios` - 各組織の設定（料金、公演時間など）
- `organization_scenarios_with_master` - 結合ビュー（自動計算）

## 移行手順

### ステップ1: テーブル作成

```sql
-- Supabase SQL Editorで実行
-- ファイル: database/migrations/create_scenario_masters.sql

-- テーブル、ビュー、RLSポリシーを作成
```

⚠️ **注意**: このスクリプトには `DROP TABLE` が含まれています。本番環境で実行する場合は、まず別のDBでテストしてください。

### ステップ2: データ移行

```sql
-- ファイル: database/migrations/migrate_scenarios_to_masters.sql

-- 既存のscenariosデータをscenario_mastersとorganization_scenariosに複製
```

この移行スクリプトは以下の処理を行います：

1. `scenarios` の各レコードを `scenario_masters` にコピー（IDを維持）
2. 組織IDを持つ `scenarios` を `organization_scenarios` にコピー
3. 移行結果を確認するSELECT文を実行

### ステップ3: 動作確認

移行後、以下を確認してください：

```sql
-- マスタの件数
SELECT COUNT(*) FROM scenario_masters;

-- 組織シナリオの件数
SELECT COUNT(*) FROM organization_scenarios;

-- ビューが正しく動作するか
SELECT * FROM organization_scenarios_with_master LIMIT 5;
```

### ステップ4: UIでの切り替え

1. シナリオ管理ページにアクセス
2. 「UIモード」から「新UI（マスタ連携）」を選択
3. 新しいUIでシナリオが表示されることを確認

## フィーチャーフラグ

完全な切り替えを行う場合は、`src/lib/featureFlags.ts` の `USE_NEW_SCENARIO_SCHEMA` を `true` に変更します。

または、環境変数で設定：

```bash
VITE_FF_USE_NEW_SCENARIO_SCHEMA=true
```

## ロールバック手順

問題が発生した場合：

1. フィーチャーフラグを `false` に戻す
2. UIモードを「旧UI」に戻す

データは `scenarios` テーブルに残っているため、元の状態に戻せます。

## 注意事項

- `schedule_events.scenario_id` は移行後も既存のIDを参照し続けます
- 移行は追加的（既存データを削除しない）なので安全です
- 本番移行前に必ずステージング環境でテストしてください

## テーブル関係

```
scenarios (旧)
    ↓ 移行
scenario_masters (新) ← organization_scenarios (新)
    ↓                         ↓
    └─────────────────────────┘
                ↓
    organization_scenarios_with_master (ビュー)
```

## 問い合わせ

移行に関する質問は、開発チームまでお問い合わせください。

