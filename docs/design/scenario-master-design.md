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

## シナリオ登録の2つのパターン

シナリオがマスタに登録される方法は**2種類**あります。

### パターン1: MMQ運営が直接マスタに登録

```
【対象】
- 有名シナリオ、公開シナリオ
- MMQ運営が把握しているシナリオ

【フロー】
┌─────────────────────────────────────────────────────────────┐
│ MMQ運営者がマスタ管理画面で「新規マスタ」をクリック          │
│     ↓                                                       │
│ シナリオ情報を入力（タイトル、作者、人数、説明など）         │
│     ↓                                                       │
│ ステータス: approved で保存                                  │
│     ↓                                                       │
│ 即座にMMQトップに表示、全組織が利用可能                      │
└─────────────────────────────────────────────────────────────┘

【データの流れ】
scenario_masters に直接追加（submitted_by_organization_id = NULL）
    ↓
各組織は「マスタから追加」でorganization_scenariosに追加
```

### パターン2: 組織が新規シナリオを作成 → MMQマスタに登録

```
【対象】
- 組織限定シナリオ、自作シナリオ
- まだマスタに登録されていないシナリオ

【フロー】
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: 組織が新規シナリオを作成                             │
├─────────────────────────────────────────────────────────────┤
│ 組織管理者がシナリオ管理で「新規作成」をクリック             │
│     ↓                                                       │
│ シナリオ情報を入力（タイトル、作者、人数、説明など）         │
│     ↓                                                       │
│ scenario_masters に追加（status: draft）                     │
│ organization_scenarios にも追加（組織設定）                  │
│     ↓                                                       │
│ 自組織では即座に公演可能（他組織からは見えない）             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: MMQ運営が承認（マスタ管理画面から）                  │
├─────────────────────────────────────────────────────────────┤
│ MMQ運営がマスタ管理画面で draft のシナリオを確認             │
│     ↓                                                       │
│ ワンクリック承認（または編集後に承認）                       │
│     ↓                                                       │
│ status: approved に変更                                      │
│     ↓                                                       │
│ MMQトップに表示、他組織も利用可能に                          │
└─────────────────────────────────────────────────────────────┘

【データの流れ】
scenario_masters に追加（submitted_by_organization_id = 作成した組織ID）
organization_scenarios に追加（作成した組織の設定）
    ↓
MMQ運営が承認
    ↓
他組織も「マスタから追加」で利用可能
```

### パターン比較

| 項目 | パターン1: MMQ運営が登録 | パターン2: 組織が登録 |
|------|------------------------|---------------------|
| 登録者 | MMQ運営（license_admin） | 組織管理者（admin/staff） |
| 初期ステータス | approved | draft |
| submitted_by_organization_id | NULL | 組織ID |
| 他組織の利用 | 即座に可能 | 承認後に可能 |
| MMQトップ表示 | 即座に表示 | 承認後に表示 |
| 主な用途 | 有名シナリオの一括登録 | 組織独自シナリオの共有 |

---

### 補足: 既存マスタを組織で利用する場合

```
【フロー】
1. 組織管理者がシナリオ管理で「マスタから追加」をクリック
2. マスタを検索・選択
3. 組織設定を入力（料金、GM、対応店舗など）
4. organization_scenarios に保存
5. 即座に公演可能

※ マスタの追加ではなく、既存マスタへの「参照」を作成
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

## 組織から新シナリオを追加するフロー（詳細）

### ステータスの運用方針

```
draft    : 自組織専用（他組織には非公開）
pending  : 承認待ち（他組織も利用可、MMQトップには非表示）
approved : 承認済み（全組織利用可、MMQトップにも表示）
rejected : 却下（利用可だが問題あり）
```

**基本方針:**
- MMQ運営が直接追加するシナリオは即 `approved`
- 組織から申請されたシナリオも基本的にすぐ `approved` にする
- `pending` は「保留」が必要なケースのみ使用

### フロー

#### パターンA: マスタから追加（既存シナリオを利用）

```
1. 組織管理者が「シナリオ追加」→「マスタから追加」
   ↓
2. シナリオを検索・選択
   ↓
3. 組織設定を入力（料金、GM、対応店舗など）
   ↓
4. organization_scenarios に保存
   ↓
5. 即座に公演可能
```

#### パターンB: 新規作成（組織独自のシナリオ）

```
1. 組織管理者が「シナリオ追加」→「新規作成」
   ↓
2. シナリオ基本情報を入力（タイトル、作者、人数など）
   ↓
3. scenario_masters に追加（status: 'draft'）
   ↓
4. 組織設定を入力（料金、GM、対応店舗など）
   ↓
5. organization_scenarios に追加
   ↓
6. 自組織では即座に公演可能
```

#### パターンC: MMQ運営が承認（管理画面から）

```
1. MMQ管理画面でマスタ一覧を開く
   ↓
2. draft/pending のシナリオを確認
   ↓
3. ワンクリックで「承認」（→ approved）
   ↓
4. MMQトップに表示、全組織で利用可能
```

**ポイント:**
- 組織からの申請を待たず、MMQ運営が気づいたら承認でOK
- 承認UIは一覧画面から直接操作できるようにする（ダイアログ不要）

---

## 管理画面構造

### ページ一覧

| ページ | パス | 権限 | 用途 |
|--------|------|------|------|
| シナリオマスタ管理 | `/admin/scenario-masters` | license_admin | MMQ運営がマスタを承認・編集 |
| シナリオ管理 | `/scenario-management` | admin/staff | 組織が自分のシナリオを設定 |

### シナリオマスタ管理（MMQ運営者用）

**パス**: `/admin/scenario-masters`
**権限**: license_admin のみ

**機能:**
- マスタ一覧表示（テーブル形式）
- ステータスフィルタ（all/approved/pending/draft/rejected）
- タイトル・作者で検索
- **ワンクリック承認**（一覧から直接 approved に変更）
- 編集ダイアログ（詳細編集）
- 新規マスタ作成

**ステータス操作:**
```
draft → approved   : ワンクリック承認 or ダイアログで変更
pending → approved : ワンクリック承認 or ダイアログで変更  
approved → draft   : ダイアログでのみ変更可
```

### シナリオ管理（組織管理者用）

**パス**: `/scenario-management`
**権限**: admin, staff

**機能:**
- 組織シナリオ一覧表示
- マスタから追加（AddFromMasterDialog）
- 組織設定の編集（料金、GM、対応店舗など）
- シナリオ解除

**注意:** 承認操作はこのページでは行わない

### 現在の実装状況と課題

#### 実装済み
- ✅ マスタからの追加（パターンA）
- ✅ organization_scenarios への保存
- ✅ 組織一覧表示
- ✅ **新規作成時に3テーブル同期**（2026-01-09追加）
  - `scenario_masters` に追加（draft状態）
  - `organization_scenarios` に追加
  - `scenarios` に追加（後方互換）
- ✅ **ワンクリック承認**（マスタ管理画面から）

#### 未実装・課題
- ❌ マスタ公開申請のUI（組織から申請ボタン）
- ❌ 承認通知

### テーブル間の関係

```
┌─────────────────────────────────────────────────────────────────────┐
│                     scenario_masters                                │
│ (作品そのものの情報 - MMQ全体で共有)                                │
├─────────────────────────────────────────────────────────────────────┤
│ id | title | author | description | player_count | difficulty | ... │
│ ────────────────────────────────────────────────────────────────────│
│ A  | 黒猫館の殺人 | 山田太郎 | ... | 4-6 | ★★★ |                   │
│ B  | 深淵の扉    | 佐藤花子 | ... | 5-8 | ★★★★ |                  │
└─────────────────────────────────────────────────────────────────────┘
         ↑
         │ scenario_master_id
         │
┌─────────────────────────────────────────────────────────────────────┐
│                  organization_scenarios                             │
│ (組織ごとの設定 - 料金、GM、店舗など)                               │
├─────────────────────────────────────────────────────────────────────┤
│ org_id | master_id | 料金 | 担当GM | 対応店舗 | 公演時間 | status   │
│ ────────────────────────────────────────────────────────────────────│
│ 組織X  | A         | ¥4500 | 田中,鈴木 | 馬場,別館 | 180分 | available│
│ 組織X  | B         | ¥5000 | 佐藤 | 馬場 | 200分 | available          │
│ 組織Y  | A         | ¥4000 | 山本 | 神楽坂 | 150分 | available        │
└─────────────────────────────────────────────────────────────────────┘
```

### データ項目の分類

#### マスタ情報（scenario_masters）
作品そのものの情報。全組織で共通。

| 項目 | 例 |
|------|-----|
| タイトル | 黒猫館の殺人 |
| 作者 | 山田太郎 |
| 説明/あらすじ | 古い洋館で起きた事件... |
| 最小・最大人数 | 4〜6名 |
| 公式目安時間 | 180分 |
| 難易度 | ★★★ |
| ジャンル | 推理、ホラー |
| キービジュアル | https://... |

#### 組織設定（organization_scenarios）
組織ごとにカスタマイズする情報。

| 項目 | 例 | 説明 |
|------|-----|------|
| 公演時間 | 150分 | 組織独自（省略時はマスタを使用） |
| 参加費 | ¥4,500 | 組織が設定 |
| ライセンス料 | ¥500 | 作者への支払い |
| 担当GM | 田中、鈴木 | この組織で対応可能なGM |
| 体験済スタッフ | 山本 | 参加済みスタッフ |
| 対応店舗 | 高田馬場、別館 | 公演可能な店舗 |
| GM報酬 | ¥3,000 | 組織が設定 |
| 制作費 | ¥10,000 | 組織が投資した費用 |
| 組織内ステータス | 公開中 | available/unavailable |
| 公演回数 | 15回 | この組織での実績 |

---

## 実装状況（2026-01-09更新）

### 完了
- ✅ テーブル設計（scenario_masters, organization_scenarios）
- ✅ ビュー作成（organization_scenarios_with_master）
- ✅ RLSポリシー設定
- ✅ API層実装（src/lib/api/scenarioMasterApi.ts）
- ✅ シナリオマスタ管理UI（/admin/scenario-masters）
- ✅ マスタ編集ダイアログ（ScenarioMasterEditDialog）
- ✅ マスタ検索・追加ダイアログ（AddFromMasterDialog）
- ✅ 組織シナリオ一覧UI（OrganizationScenarioList）- テーブル形式
- ✅ UIモード切り替え機能（ScenarioManagement）
- ✅ 移行スクリプト（migrate_scenarios_to_masters.sql）
- ✅ 旧scenarios→organization_scenarios同期（sync_scenarios_to_organization_scenarios.sql）

### 使用方法
1. シナリオ管理ページで「新UI（マスタ連携）」を選択
2. 「マスタから追加」で共通マスタを自組織に追加
3. 公開ステータス・料金などを組織ごとに設定

### 今後の予定

**優先度高:**
- [ ] 組織からの新規シナリオ作成 → 自動的にマスタ登録
- [ ] MMQ管理画面で一覧からワンクリック承認
- [ ] 予約サイトでの organization_scenarios 表示対応

**優先度中:**
- [ ] 既存 scenarios テーブルからの完全移行
- [ ] フィーチャーフラグによる本格切り替え

**優先度低:**
- [ ] 組織からの公開申請ワークフロー（必要なら）

---

## 作成日
2026-01-05

## 更新履歴
- 2026-01-09: 組織シナリオ追加フローの詳細追加、テーブル関係図追加

