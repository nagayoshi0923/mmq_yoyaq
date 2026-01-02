# シナリオ管理機能 詳細

**最終更新**: 2025-12-30

マーダーミステリーシナリオの情報を管理する機能。

---

## 1. 概要

### この機能が解決する課題

- シナリオの基本情報を一元管理したい
- 参加費・ライセンス料を管理したい
- GM担当者を管理したい
- 制作費・必要道具を管理したい
- 公演可能店舗を設定したい

### 主な機能

| 機能 | 説明 |
|------|------|
| シナリオ一覧 | 全シナリオの表示・検索・フィルター |
| シナリオ登録 | 新規シナリオ追加 |
| シナリオ編集 | 情報更新 |
| 料金設定 | 参加費・ライセンス料の設定 |
| GM配置設定 | 必要GM数・報酬設定 |
| 制作費管理 | 項目別制作費・必要道具管理 |

---

## 2. 画面構成

### 2.1 シナリオ一覧

```
┌─────────────────────────────────────────────────────────────────────┐
│ シナリオ管理                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [検索...]   ステータス: [▼ すべて]          [+ 新規シナリオ]        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ タイトル         作者        時間    人数    参加費   操作  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ 〇〇の事件簿     山田作家    180分   4〜6名  ¥4,500  [編集] │   │
│  │ △△殺人事件     佐藤作家    150分   5〜8名  ¥4,000  [編集] │   │
│  │ □□館の謎       鈴木作家    120分   4〜5名  ¥3,500  [編集] │   │
│  │ ...                                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 シナリオ編集画面（4セクション構成）

```
┌─────────────────────────────────────────────────────────────────────┐
│ シナリオ編集                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 【基本情報】                                                 │   │
│  │ タイトル*: [〇〇の事件簿_________________]                   │   │
│  │ 作者: [山田作家_______________]                              │   │
│  │ 作者メール: [author@example.com_______]                      │   │
│  │ 所要時間: [180] 分                                           │   │
│  │ 参加人数: [4] 〜 [6] 名                                      │   │
│  │ 難易度: ★★★☆☆                                            │   │
│  │ ステータス: (●) 公開中 ( ) メンテナンス中 ( ) 非公開        │   │
│  │ あらすじ: [__________________________]                       │   │
│  │ キービジュアルURL: [__________________________]              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 【ゲーム設定】                                               │   │
│  │ [✓] 事前読み込み必要                                        │   │
│  │ ジャンル: [✓] 推理 [✓] 協力 [ ] 対立 [ ] ホラー             │   │
│  │ 公演可能店舗: [✓] 高田馬場 [✓] 別館① [ ] 神楽坂            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 【料金設定】                                                 │   │
│  │                                                               │   │
│  │ ■ 参加費パターン                                             │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ 時間帯        金額              [削除]                   │ │   │
│  │ │ 通常         ¥4,500            [×]                      │ │   │
│  │ │ 平日昼       ¥3,500            [×]                      │ │   │
│  │ │ [新規パターン追加...]                                    │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │ ■ ライセンス料                                               │   │
│  │ 通常公演: ¥[500]  GMテスト: ¥[0]                            │   │
│  │ フランチャイズ通常: ¥[1000]  フランチャイズGMテスト: ¥[500] │   │
│  │                                                               │   │
│  │ ■ GM配置                                                     │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ 役割          報酬              [削除]                   │ │   │
│  │ │ メインGM     ¥3,000            [×]                      │ │   │
│  │ │ サブGM       ¥2,000            [×]                      │ │   │
│  │ │ [+ GM追加]                                               │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 【制作費・道具】                                             │   │
│  │                                                               │   │
│  │ ■ 制作費                                                     │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ 項目名        金額              [削除]                   │ │   │
│  │ │ 印刷代       ¥10,000           [×]                      │ │   │
│  │ │ 小道具       ¥5,000            [×]                      │ │   │
│  │ │ [+ 項目追加]                                             │ │   │
│  │ │ 合計: ¥15,000                                            │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │ ■ 必要道具                                                   │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ 道具名        金額              [削除]                   │ │   │
│  │ │ 封筒         ¥500              [×]                      │ │   │
│  │ │ [+ 道具追加]                                             │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [キャンセル]                              [保存]                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. データ構造

### 3.1 scenarios テーブル

```typescript
interface Scenario {
  id: string
  organization_id?: string          // マルチテナント識別（共有シナリオはNULL）
  is_shared?: boolean               // 他組織に共有するか
  
  // 基本情報
  title: string
  description?: string
  synopsis?: string                 // 詳細あらすじ
  author: string
  author_email?: string             // 作者メール（作者ポータル連携）
  
  // ゲーム設定
  duration: number                  // 所要時間（分）
  player_count_min: number
  player_count_max: number
  difficulty: number                // 難易度（1-5）
  genre: string[]                   // ジャンル配列
  has_pre_reading: boolean          // 事前読み込み必要
  
  // ステータス
  status: 'available' | 'maintenance' | 'retired'
  scenario_type?: 'normal' | 'managed'  // 通常 or 管理シナリオ
  
  // 料金設定
  participation_fee: number         // 基本参加費
  participation_costs: Array<{      // 時間帯別料金
    time_slot: string               // '通常', '平日昼', etc.
    amount: number
    type: 'percentage' | 'fixed'
    status?: 'active' | 'legacy'
  }>
  
  // ライセンス料
  license_amount?: number           // 通常ライセンス料
  gm_test_license_amount?: number   // GMテストライセンス料
  franchise_license_amount?: number // フランチャイズ通常
  franchise_gm_test_license_amount?: number // フランチャイズGMテスト
  
  // GM配置
  gm_count?: number                 // 必要GM数
  gm_costs: Array<{                 // GM報酬設定
    role: string                    // 'メインGM', 'サブGM', etc.
    reward: number
    category?: 'normal' | 'gmtest'
  }>
  
  // 制作費・道具
  production_cost: number           // 制作費合計（DB保存用）
  production_costs?: Array<{        // 項目別制作費（UI用）
    item: string
    amount: number
  }>
  required_props: Array<{           // 必要道具
    item: string
    amount: number
    frequency: 'recurring' | 'one-time'
  }>
  
  // 顧客向け表示
  key_visual_url?: string           // キービジュアルURL
  official_site_url?: string        // 公式サイトURL
  rating?: number                   // 評価
  play_count: number                // 公演回数
  
  // 店舗設定
  available_stores?: string[]       // 公演可能店舗ID
  available_gms: string[]           // 担当可能GM ID
  
  notes?: string
  release_date?: string
  
  created_at: string
  updated_at: string
}
```

### 3.2 ステータスの意味

| ステータス | 意味 | 予約サイト表示 |
|-----------|------|--------------|
| `available` | 公開中 | ✅ 表示 |
| `maintenance` | メンテナンス中 | ❌ 非表示 |
| `retired` | 非公開 | ❌ 非表示 |

---

## 4. 料金設定の詳細

### 4.1 参加費パターン

複数の料金パターンを設定可能:

```typescript
participation_costs: [
  { time_slot: '通常', amount: 4500, type: 'fixed' },
  { time_slot: '平日昼', amount: 3500, type: 'fixed' },
  { time_slot: '学割', amount: 3000, type: 'fixed' }
]
```

### 4.2 ライセンス料の種類

| 種類 | 用途 |
|------|------|
| `license_amount` | 通常公演時のライセンス料 |
| `gm_test_license_amount` | GMテスト公演時のライセンス料 |
| `franchise_license_amount` | フランチャイズ店舗での通常公演 |
| `franchise_gm_test_license_amount` | フランチャイズ店舗でのGMテスト |

### 4.3 GM配置と報酬

```typescript
gm_costs: [
  { role: 'メインGM', reward: 3000, category: 'normal' },
  { role: 'サブGM', reward: 2000, category: 'normal' },
  { role: 'メインGM', reward: 2500, category: 'gmtest' }
]
```

---

## 5. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/ScenarioManagement/index.tsx` | シナリオ一覧 |
| `src/pages/ScenarioEdit/index.tsx` | シナリオ編集 |
| `src/pages/ScenarioCatalog/index.tsx` | シナリオカタログ（顧客向け） |
| `src/pages/ScenarioDetailPage/index.tsx` | シナリオ詳細（顧客向け） |

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `components/ScenarioEditDialog.tsx` | 編集ダイアログ |
| `components/ScenarioRow.tsx` | 一覧行表示 |
| `components/PricingSection.tsx` | 料金設定セクション |
| `components/GMCostsSection.tsx` | GM配置セクション |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useScenarioData.ts` | シナリオデータ取得 |
| `hooks/useScenarioMutations.ts` | 作成・更新・削除 |
| `hooks/useScenarioFilter.ts` | フィルター管理 |

---

## 6. 注意点

### 6.1 production_cost と production_costs

- `production_cost`: 合計金額（数値）→ DBに保存
- `production_costs`: 項目別配列 → UI表示用

保存時に `production_costs` の合計を `production_cost` に設定:

```typescript
const totalCost = production_costs.reduce((sum, item) => sum + item.amount, 0)
await supabase.from('scenarios').update({
  production_cost: totalCost,
  production_costs: production_costs
})
```

### 6.2 organization_id と共有シナリオ

- `organization_id = NULL` かつ `is_shared = true` で全組織で共有
- `organization_id = 特定ID` で組織専用シナリオ

### 6.3 author_email

- 作者ポータルとの連携に使用
- 公演報告時に自動でライセンス料計算
- メールアドレスで作者を識別

---

## 7. トラブルシューティング

### シナリオが予約サイトに表示されない

1. `status` が `available` か確認
2. `available_stores` に対象店舗が含まれているか確認
3. `schedule_events` に公演が登録されているか確認
4. 公演が中止になっていないか確認

### 料金が正しく表示されない

1. `participation_costs` 配列の設定確認
2. `participation_fee` の値確認（後方互換用）
3. フロントエンドでの表示ロジック確認

### GM配置が保存されない

1. `gm_costs` 配列の形式確認
2. 必須フィールド（role, reward）確認
3. RLSポリシー確認

---

## 8. 関連ドキュメント

- [staff-management/](../staff-management/) - スタッフ管理（GM担当設定）
- [schedule-manager/](../schedule-manager/) - スケジュール管理
- [features/README.md](../README.md) - 機能概要一覧


