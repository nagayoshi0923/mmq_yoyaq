# 顧客管理機能 詳細

**最終更新**: 2025-12-30

予約した顧客の情報を管理する機能。

---

## 1. 概要

### この機能が解決する課題

- 顧客情報を一元管理したい
- リピーター顧客を識別したい
- 連絡先情報を検索したい

---

## 2. 画面構成

### 2.1 顧客一覧

```
┌─────────────────────────────────────────────────────────────────────┐
│ 顧客管理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [検索...]                                                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 名前         メール              電話        予約回数  操作│   │
│  │ 山田 太郎    yamada@example.com  090-xxxx    5回      [編集]│   │
│  │ 佐藤 花子    sato@example.com    080-xxxx    3回      [編集]│   │
│  │ 鈴木 一郎    suzuki@example.com  070-xxxx    1回      [編集]│   │
│  │ ...                                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 顧客編集モーダル

```
┌─────────────────────────────────────────────────────────────────────┐
│ 顧客情報編集                                                 [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  名前: [山田 太郎_____________]                                      │
│  メール: [yamada@example.com__]                                      │
│  電話: [090-xxxx-xxxx________]                                       │
│                                                                      │
│  予約履歴                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 日付       シナリオ        店舗       人数    ステータス    │   │
│  │ 12/25     〇〇の事件      高田馬場   3名     完了          │   │
│  │ 12/10     △△殺人        別館①     2名     完了          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [キャンセル]                              [保存]                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. データ構造

### 3.1 customers テーブル

```typescript
interface Customer {
  id: string
  organization_id: string         // マルチテナント識別
  
  // 基本情報
  name: string
  email: string
  phone?: string
  
  // 会員連携
  user_id?: string                // ログインユーザーと紐付く場合
  
  // 統計（自動集計）
  total_reservations?: number     // 予約回数
  total_participations?: number   // 参加回数
  
  notes?: string
  
  created_at: string
  updated_at: string
}
```

### 3.2 顧客の自動登録

予約時に顧客情報を自動登録/更新:

```typescript
// 予約確定時の処理
const createOrUpdateCustomer = async (
  name: string,
  email: string,
  phone?: string
) => {
  // 既存顧客を検索
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .eq('organization_id', organizationId)
    .single()
  
  if (existing) {
    // 更新
    await supabase
      .from('customers')
      .update({ name, phone })
      .eq('id', existing.id)
    return existing.id
  } else {
    // 新規作成
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({ name, email, phone, organization_id: organizationId })
      .select('id')
      .single()
    return newCustomer.id
  }
}
```

---

## 4. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/CustomerManagement/index.tsx` | 顧客一覧 |

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `components/CustomerRow.tsx` | 顧客行表示 |
| `components/CustomerEditModal.tsx` | 編集モーダル |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useCustomerData.ts` | 顧客データ取得 |

---

## 5. 関連ドキュメント

- [reservation/](../reservation/) - 予約機能
- [features/README.md](../README.md) - 機能概要一覧

