# 店舗・組織管理機能 詳細

**最終更新**: 2025-12-30

店舗と組織（会社）を管理する機能。

---

## 1. 概要

### マルチテナント構成

MMQシステムはマルチテナント構成で、複数組織が同一システムを利用可能。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        マルチテナント構成                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  organizations（組織）                                               │
│  ├── クイーンズワルツ（is_license_manager: true）                   │
│  │   ├── stores: 高田馬場店, 別館①, 別館②, 神楽坂店, 中野店, 門前仲町│
│  │   ├── staff: 20名                                                │
│  │   └── scenarios: 50本                                            │
│  │                                                                   │
│  ├── A社（is_license_manager: false）                                │
│  │   ├── stores: 新宿店                                              │
│  │   ├── staff: 5名                                                  │
│  │   └── scenarios: 10本（共有シナリオ含む）                        │
│  │                                                                   │
│  └── B社（is_license_manager: false）                                │
│      ├── stores: 渋谷店                                              │
│      ├── staff: 3名                                                  │
│      └── scenarios: 5本（共有シナリオ含む）                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 店舗管理

### 2.1 画面構成

```
┌─────────────────────────────────────────────────────────────────────┐
│ 店舗管理                                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [+ 新規店舗]                                                        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 店舗名       略称    住所              識別色    操作       │   │
│  │ 高田馬場店   馬場    東京都新宿区...   ■青      [編集]     │   │
│  │ 別館①       別①    東京都新宿区...   ■緑      [編集]     │   │
│  │ 別館②       別②    東京都新宿区...   ■赤      [編集]     │   │
│  │ 神楽坂店     神楽    東京都新宿区...   ■紫      [編集]     │   │
│  │ ...                                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 データ構造

```typescript
interface Store {
  id: string
  organization_id: string         // 所属組織
  
  name: string                    // 店舗名
  short_name: string              // 略称（カレンダー表示用）
  
  address?: string                // 住所
  phone?: string                  // 電話番号
  
  color: string                   // 識別色（hex）
  
  display_order: number           // 表示順
  is_active: boolean              // 有効フラグ
  
  notes?: string
  
  created_at: string
  updated_at: string
}
```

### 2.3 店舗識別色システム

各店舗に固有の色を設定し、UI全体で一貫して使用:

```typescript
// 色の使用例
// スケジュール管理のヘッダー
<th style={{ backgroundColor: store.color }}>
  {store.short_name}
</th>

// 予約サイトのバッジ
<Badge style={{ backgroundColor: store.color }}>
  {store.name}
</Badge>
```

---

## 3. 組織管理

### 3.1 データ構造

```typescript
interface Organization {
  id: string
  
  name: string                    // 組織名
  slug: string                    // URL識別子（例: 'queens-waltz'）
  
  plan: 'free' | 'basic' | 'pro'  // 契約プラン
  
  contact_email?: string          // 連絡先メール
  contact_name?: string           // 連絡先担当者
  
  is_license_manager: boolean     // ライセンス管理組織か
  is_active: boolean              // 有効フラグ
  
  settings?: Record<string, unknown>  // 組織固有設定
  notes?: string
  
  created_at: string
  updated_at: string
}
```

### 3.2 組織固有設定（settings）

```typescript
// organization.settings の例
{
  // シフト設定
  shift_submission_enabled: true,
  shift_target_month: '2025-02',
  shift_deadline: '2025-01-20',
  
  // 予約設定
  booking_enabled: true,
  private_booking_deadline_days: 14,
  
  // 表示設定
  default_store_id: 'store-123'
}
```

---

## 4. URL構造（マルチテナント）

### 4.1 管理画面

管理画面はログイン後の組織情報に基づいてデータを分離:

```
/schedule           → 自組織のスケジュールのみ表示
/staff              → 自組織のスタッフのみ表示
/scenarios          → 自組織のシナリオ + 共有シナリオ
```

### 4.2 予約サイト

予約サイトはURLパスで組織を識別:

```
/booking/queens-waltz/          → クイーンズワルツの予約サイト
/booking/company-a/             → A社の予約サイト
/booking/company-a/scenario/xxx → A社のシナリオ詳細
```

---

## 5. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/StoreManagement.tsx` | 店舗管理 |
| `src/pages/OrganizationManagement/index.tsx` | 組織管理 |
| `src/pages/OrganizationSettings/index.tsx` | 組織設定 |
| `src/pages/OrganizationRegister/index.tsx` | 組織登録 |

### コンポーネント

| ファイル | 役割 |
|---------|------|
| `components/OrganizationCreateDialog.tsx` | 組織作成 |
| `components/OrganizationEditDialog.tsx` | 組織編集 |

### フック

| ファイル | 役割 |
|---------|------|
| `src/hooks/useOrganization.ts` | 組織情報取得 |
| `src/hooks/useStores.ts` | 店舗一覧取得 |

---

## 6. データ分離（RLS）

Row Level Security (RLS) で組織間のデータを分離:

```sql
-- 例: staffテーブルのRLS
CREATE POLICY "Users can view staff in their organization"
ON staff
FOR SELECT
USING (
  organization_id = (
    SELECT organization_id 
    FROM staff 
    WHERE user_id = auth.uid()
  )
);
```

---

## 7. 関連ドキュメント

- [auth-system/](../auth-system/) - 認証システム
- [features/README.md](../README.md) - 機能概要一覧

