# シナリオマスタ設計書

## 概要

シナリオデータを2層構造に分離し、MMQプラットフォーム全体で共有できるようにする。

- **scenario_masters**: MMQ共通のシナリオ情報（作品そのもの）
- **organization_scenarios**: 各組織のシナリオ設定（公演時間、料金など）

## 背景

### 現状の問題
- 同じシナリオが各組織で別々のレコードとして存在
- プラットフォーム横断でのシナリオ検索が困難
- シナリオ情報の更新が各組織で個別に必要

### 解決策
- シナリオマスタで作品情報を一元管理
- 各組織はマスタを参照し、独自の設定を追加

---

## テーブル設計

### scenario_masters（MMQ共通シナリオマスタ）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| title | TEXT | シナリオタイトル |
| author | TEXT | 作者名 |
| author_id | UUID | 作者マスタへの参照（あれば） |
| key_visual_url | TEXT | キービジュアル画像URL |
| description | TEXT | シナリオ説明 |
| player_count_min | INTEGER | 最少人数 |
| player_count_max | INTEGER | 最大人数 |
| official_duration | INTEGER | 公式目安時間（分） |
| genre | TEXT[] | ジャンル配列 |
| difficulty | TEXT | 難易度 |
| status | TEXT | ステータス（後述） |
| submitted_by_organization_id | UUID | 申請元組織（NULLならMMQ運営が追加） |
| approved_by | UUID | 承認者 |
| approved_at | TIMESTAMPTZ | 承認日時 |
| rejection_reason | TEXT | 却下理由 |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

### organization_scenarios（組織ごとのシナリオ設定）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| organization_id | UUID | 組織ID |
| scenario_master_id | UUID | シナリオマスタへの参照 |
| slug | TEXT | 組織内でのURL用スラッグ |
| duration | INTEGER | 組織独自の公演時間（NULLなら公式を使用） |
| participation_fee | INTEGER | 参加費 |
| extra_preparation_time | INTEGER | 追加準備時間 |
| status | TEXT | 組織内での公開状態 |
| custom_key_visual_url | TEXT | 組織独自のビジュアル（あれば） |
| custom_description | TEXT | 組織独自の説明 |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

**ユニーク制約**: (organization_id, scenario_master_id)

---

## ステータス設計

### scenario_masters.status

| ステータス | 意味 | 自組織トップ | 他組織が検索 | MMQトップ |
|-----------|------|-------------|-------------|-----------|
| `draft` | 下書き | ❌ 非表示 | ❌ 見えない | ❌ |
| `pending` | 承認待ち | ✅ 表示 | ✅ 検索可・利用可 | ❌ |
| `approved` | 承認済み | ✅ 表示 | ✅ 検索可・利用可 | ✅ |
| `rejected` | 却下 | ✅ 表示 | ✅ 検索可・利用可 | ❌ |

### ポイント
- **MMQトップ**: `approved` のみ表示
- **他組織の利用**: `pending` 以上なら自由に利用可能（承認を待たなくてよい）
- **draft**: 作成した組織のみが見える（他組織からは検索不可）

---

## フロー

### ケース1: MMQ運営者が新シナリオを追加

```
MMQ運営者が scenario_masters に直接追加
→ status: 'approved' で即時公開
→ 全組織が organization_scenarios で利用可能
```

### ケース2: 組織管理者が新シナリオを追加

```
1. 組織管理者が新シナリオ作成開始
   → scenario_masters に追加 (status: 'draft')
   → 自分だけが見える

2. 「公開する」ボタンを押す
   → status: 'pending'
   → 自組織トップに表示
   → 他組織も検索・利用可能に

3. MMQ運営者が承認
   → status: 'approved'
   → MMQトップにも表示
```

### ケース3: 他組織が既存シナリオを利用

```
1. 組織Bが「シナリオ追加」画面を開く
2. scenario_masters を検索（status: 'pending' or 'approved'）
3. 見つかったシナリオを選択
4. organization_scenarios に追加（独自設定を入力）
5. 組織Bのトップにも表示される
```

---

## 表示ロジック

### MMQトップ（PlatformTop）
```sql
SELECT * FROM scenario_masters
WHERE status = 'approved'
```

### 組織トップ（PublicBookingTop）
```sql
SELECT sm.*, os.*
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id
WHERE os.organization_id = :org_id
  AND (sm.status IN ('pending', 'approved', 'rejected')
       OR sm.submitted_by_organization_id = :org_id)  -- 自組織のdraftも表示
```

### シナリオ検索（組織管理者用）
```sql
SELECT * FROM scenario_masters
WHERE status IN ('pending', 'approved', 'rejected')
   OR submitted_by_organization_id = :org_id  -- 自組織のdraftも表示
```

---

## 移行計画

### 既存テーブルからの移行

1. 現在の `scenarios` テーブルのデータを分析
2. 重複するシナリオ（同じタイトル・作者）を特定
3. `scenario_masters` にマージ
4. 各組織の `organization_scenarios` を作成
5. `schedule_events.scenario_id` の参照先を変更

### 注意点
- 既存の予約データとの整合性を維持
- 段階的な移行（一括ではなくテスト→本番）

---

## 作成日
2026-01-05

