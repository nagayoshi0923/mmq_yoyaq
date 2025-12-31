# 作者ポータル機能 詳細

**最終更新**: 2025-12-30

シナリオ作者が公演報告とライセンス料を確認するためのポータル。

---

## 1. 概要

### この機能が解決する課題

- 作者が自分のシナリオの公演状況を確認したい
- ライセンス料の計算結果を確認したい
- 複数組織からの報告を一元管理したい

### アクセス方法

作者はメールアドレスでログインし、そのメールアドレスに紐づくシナリオの報告を閲覧。

---

## 2. 画面構成

### 2.1 作者ダッシュボード

```
┌─────────────────────────────────────────────────────────────────────┐
│ 作者ポータル                                     [山田作家 ▼]       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ シナリオ数   │ │ 総公演数    │ │ 今月公演    │ │ ライセンス料│   │
│  │ 5本         │ │ 120回       │ │ 15回        │ │ ¥60,000     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  最近の公演報告                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 日付     シナリオ      組織       公演数   ライセンス料     │   │
│  │ 12/25   〇〇の事件    クイーンズ  2回     ¥1,000           │   │
│  │ 12/20   〇〇の事件    A社         1回     ¥500             │   │
│  │ 12/18   △△殺人      クイーンズ  3回     ¥900             │   │
│  │ ...                                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 シナリオ別詳細

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  〇〇の事件簿                                                        │
│                                                                      │
│  ライセンス料: ¥500/公演                                            │
│  総公演数: 45回                                                      │
│  総ライセンス料: ¥22,500                                            │
│                                                                      │
│  組織別内訳                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 組織名          公演数     ライセンス料                      │   │
│  │ クイーンズ      30回       ¥15,000                           │   │
│  │ A社             10回       ¥5,000                            │   │
│  │ B社             5回        ¥2,500                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 認証フロー

### 3.1 ログイン方式

```
┌─────────────────────────────────────────────────────────────────────┐
│                        作者ログインフロー                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【作者】                                                            │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 1. 作者ログインページでメールアドレス入力                │        │
│  │    /author-login                                         │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 2. scenarios.author_email で検索                         │        │
│  │    → 該当シナリオがあればログイン成功                    │        │
│  │    → なければエラー表示                                  │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 3. 作者ダッシュボードへ遷移                              │        │
│  │    /author-dashboard                                     │        │
│  │    → メールアドレスをセッションに保存                    │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 データ取得

作者のメールアドレスに紐づくシナリオと報告を取得:

```typescript
// 作者のシナリオを取得
const { data: scenarios } = await supabase
  .from('scenarios')
  .select('*')
  .eq('author_email', authorEmail)

// 公演報告を取得（承認済みのみ）
const { data: reports } = await supabase
  .from('external_performance_reports')
  .select('*')
  .in('scenario_id', scenarioIds)
  .eq('status', 'approved')
```

---

## 4. データ構造

### 4.1 作者識別

作者はメールアドレスで識別（専用テーブルなし）:

```typescript
// scenarios.author_email で紐付け
interface Scenario {
  id: string
  title: string
  author: string              // 作者名（表示用）
  author_email?: string       // 作者メールアドレス（識別用）
  license_amount?: number     // 1公演あたりライセンス料
  // ...
}
```

### 4.2 作者向けビュー

```typescript
interface AuthorPerformanceReport {
  author_email: string
  author_name: string
  
  scenario_id: string
  scenario_title: string
  
  organization_id: string
  organization_name: string
  
  report_id: string
  performance_date: string
  performance_count: number
  participant_count?: number
  venue_name?: string
  
  report_status: 'pending' | 'approved' | 'rejected'
  reported_at: string
  
  license_amount: number
  calculated_license_fee: number  // performance_count * license_amount
}
```

### 4.3 作者サマリー

```typescript
interface AuthorSummary {
  author_email: string
  
  total_scenarios: number         // シナリオ数
  total_approved_reports: number  // 承認済み報告数
  total_performance_count: number // 総公演数
  total_license_fee: number       // 総ライセンス料
  organizations_count: number     // 報告元組織数
}
```

---

## 5. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/AuthorLogin/index.tsx` | 作者ログイン |
| `src/pages/AuthorDashboard/index.tsx` | 作者ダッシュボード |
| `src/pages/AuthorReport/index.tsx` | 作者向け報告詳細 |

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `components/AuthorReportList.tsx` | 報告一覧 |
| `components/AuthorEmailDialog.tsx` | メール送信ダイアログ |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useAuthorReportData.ts` | 作者向けデータ取得 |

---

## 6. セキュリティ考慮事項

### 6.1 アクセス制限

- メールアドレスベースの簡易認証
- 該当シナリオのデータのみ閲覧可能
- 編集機能なし（閲覧のみ）

### 6.2 RLSポリシー

```sql
-- 作者は自分のシナリオの報告のみ閲覧可能
CREATE POLICY "Authors can view their reports"
ON external_performance_reports
FOR SELECT
USING (
  scenario_id IN (
    SELECT id FROM scenarios
    WHERE author_email = current_user_email()
  )
)
```

---

## 7. 関連ドキュメント

- [license-management/](../license-management/) - ライセンス管理
- [scenario-management/](../scenario-management/) - シナリオ管理
- [features/README.md](../README.md) - 機能概要一覧

