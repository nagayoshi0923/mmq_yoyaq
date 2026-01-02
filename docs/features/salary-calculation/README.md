# 給与計算機能 詳細

**最終更新**: 2025-12-30

スタッフの給与を公演実績に基づいて計算する機能。

---

## 1. 概要

### この機能が解決する課題

- GMの公演報酬を自動計算したい
- 役割別（メインGM/サブGM）の報酬を管理したい
- 月次の給与明細を作成したい

---

## 2. 画面構成

```
┌─────────────────────────────────────────────────────────────────────┐
│ 給与計算                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  期間: [▼ 2024年12月]                                               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ スタッフ名    公演数    メインGM   サブGM    合計報酬      │   │
│  │ 山田 太郎     8回       5回        3回       ¥21,000       │   │
│  │ 佐藤 花子     6回       4回        2回       ¥16,000       │   │
│  │ 鈴木 一郎     4回       2回        2回       ¥10,000       │   │
│  │ ...                                                          │   │
│  │                                                              │   │
│  │ 合計          18回                           ¥47,000       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [明細をダウンロード]                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 計算ロジック

### 3.1 報酬の計算式

```typescript
// 1. 各公演での報酬を計算
const calculatePerformanceReward = (
  event: ScheduleEvent,
  staffName: string,
  scenario: Scenario
): number => {
  // スタッフの役割を取得
  const role = event.gm_roles?.[staffName] || 'メインGM'
  
  // シナリオのGM報酬設定から該当役割の報酬を取得
  const gmCost = scenario.gm_costs.find(gc => gc.role === role)
  
  return gmCost?.reward || 0
}

// 2. 月間報酬を集計
const calculateMonthlyReward = (
  staffId: string,
  events: ScheduleEvent[],
  scenarios: Scenario[]
): SalaryData => {
  let totalReward = 0
  let mainGMCount = 0
  let subGMCount = 0
  
  events.forEach(event => {
    const scenario = scenarios.find(s => s.id === event.scenario_id)
    if (!scenario) return
    
    const role = event.gm_roles?.[staffName] || 'メインGM'
    const reward = calculatePerformanceReward(event, staffName, scenario)
    
    totalReward += reward
    if (role === 'メインGM') mainGMCount++
    else subGMCount++
  })
  
  return {
    staffId,
    totalPerformances: mainGMCount + subGMCount,
    mainGMCount,
    subGMCount,
    totalReward
  }
}
```

### 3.2 報酬単価の取得元

シナリオごとに設定された `gm_costs` 配列から取得:

```typescript
// scenarios.gm_costs
[
  { role: 'メインGM', reward: 3000 },
  { role: 'サブGM', reward: 2000 },
  { role: 'アシスタント', reward: 1500 }
]
```

---

## 4. データ構造

### 4.1 給与計算結果

```typescript
interface SalaryData {
  staffId: string
  staffName: string
  
  period: string              // 'YYYY-MM'
  
  // 公演数
  totalPerformances: number
  mainGMCount: number
  subGMCount: number
  
  // 報酬
  totalReward: number
  
  // 内訳
  breakdown: PerformanceBreakdown[]
}

interface PerformanceBreakdown {
  eventId: string
  date: string
  scenarioTitle: string
  storeName: string
  role: string
  reward: number
}
```

---

## 5. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/SalaryCalculation/index.tsx` | 給与計算画面 |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useSalaryData.ts` | 給与データ計算 |

---

## 6. 注意点

### 6.1 gm_roles の設定

`schedule_events.gm_roles` が設定されていない場合:
- `gms` 配列の最初のGMを「メインGM」として扱う
- それ以外を「サブGM」として扱う

### 6.2 中止公演の扱い

`is_cancelled = true` の公演は給与計算から除外。

---

## 7. 関連ドキュメント

- [schedule-manager/](../schedule-manager/) - スケジュール管理
- [scenario-management/](../scenario-management/) - シナリオ管理（GM報酬設定）
- [sales-management/](../sales-management/) - 売上管理
- [features/README.md](../README.md) - 機能概要一覧


