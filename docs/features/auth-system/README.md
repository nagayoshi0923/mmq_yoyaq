# 認証・権限システム 詳細

**最終更新**: 2025-12-30

ユーザー認証と権限管理の仕組み。

---

## 1. 概要

### 認証基盤

- **Supabase Auth** を使用
- メール/パスワード認証
- 招待制（スタッフは招待メールからアカウント作成）

### ユーザー種別

| 種別 | 説明 | アクセス範囲 |
|------|------|-------------|
| **admin** | 管理者 | 全機能 |
| **gm** | ゲームマスター | 担当シナリオ関連 |
| **staff** | スタッフ | 一般機能 |
| **author** | 作家 | 作者ポータルのみ |
| **customer** | 顧客 | 予約サイトのみ |

---

## 2. 認証フロー

### 2.1 スタッフログイン

```
┌─────────────────────────────────────────────────────────────────────┐
│                      スタッフログインフロー                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【スタッフ】                                                        │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 1. ログインページでメール・パスワード入力                │        │
│  │    /login                                                │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 2. Supabase Auth で認証                                  │        │
│  │    → auth.users テーブルで検証                           │        │
│  │    → JWT トークン発行                                    │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 3. staff テーブルから追加情報取得                        │        │
│  │    → staff.user_id = auth.users.id で紐付け              │        │
│  │    → role, organization_id 取得                          │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 4. AuthContext にユーザー情報保存                        │        │
│  │    → 管理画面へリダイレクト                              │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 スタッフ招待フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                      スタッフ招待フロー                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【管理者】                                                          │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 1. スタッフ招待ダイアログ                                │        │
│  │    → 名前、メール、役割を入力                            │        │
│  │    → organization_invitations に登録                     │        │
│  │    → トークン生成（有効期限7日）                         │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 2. 招待メール送信                                        │        │
│  │    Edge Function: invite-staff                           │        │
│  │    → 招待リンク付きメール送信                            │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│  【招待されたスタッフ】     ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 3. 招待リンクをクリック                                  │        │
│  │    /accept-invitation?token=xxx                          │        │
│  │    → トークン検証                                        │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 4. パスワード設定画面                                    │        │
│  │    → パスワード入力                                      │        │
│  │    → Supabase Auth でアカウント作成                      │        │
│  │    → staff.user_id に紐付け                              │        │
│  │    → invitation.accepted_at 更新                         │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. データ構造

### 3.1 auth.users（Supabase管理）

```typescript
// Supabase Auth が管理
interface AuthUser {
  id: string                      // UUID
  email: string
  encrypted_password: string
  created_at: string
  // ... その他Supabase標準フィールド
}
```

### 3.2 staff テーブル（アプリ管理）

```typescript
interface Staff {
  id: string
  organization_id: string
  
  name: string
  email?: string
  
  // Authとの紐付け
  user_id?: string                // auth.users.id
  
  // 権限
  role: string[]                  // ['admin', 'gm', 'staff', 'author']
  
  // ... その他フィールド
}
```

### 3.3 organization_invitations テーブル

```typescript
interface OrganizationInvitation {
  id: string
  organization_id: string
  
  email: string
  name: string
  role: string[]                  // 付与する役割
  
  token: string                   // 招待トークン
  expires_at: string              // 有効期限
  
  accepted_at?: string            // 承認日時
  staff_id?: string               // 作成されたstaff.id
  created_by?: string             // 招待者のuser_id
  
  created_at: string
}
```

---

## 4. 権限チェック

### 4.1 AuthContext

```typescript
interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

interface User {
  id: string                      // auth.users.id
  email: string
  role: 'admin' | 'gm' | 'staff' | 'customer'
  staffId?: string                // staff.id
  organizationId?: string
}
```

### 4.2 権限による表示制御

```typescript
// 使用例
const { user } = useAuth()

// 管理者のみ表示
if (user?.role === 'admin') {
  return <AdminOnlyComponent />
}

// GMまたは管理者
if (['admin', 'gm'].includes(user?.role || '')) {
  return <GMComponent />
}
```

### 4.3 ルート保護

```typescript
// ProtectedRoute コンポーネント
<Route 
  path="/admin/*" 
  element={
    <ProtectedRoute requiredRole="admin">
      <AdminLayout />
    </ProtectedRoute>
  } 
/>
```

---

## 5. パスワードリセット

### 5.1 フロー

1. ユーザーがパスワードリセットをリクエスト
2. Supabase がリセットメール送信
3. ユーザーがメールのリンクをクリック
4. `/reset-password` ページで新パスワード設定

### 5.2 関連ページ

| ページ | パス | 役割 |
|-------|------|------|
| パスワードリセット要求 | `/forgot-password` | メール入力 |
| パスワード設定 | `/reset-password` | 新パスワード入力 |
| パスワード設定（招待） | `/set-password` | 招待からの初期設定 |

---

## 6. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/Login/index.tsx` | ログイン（存在する場合） |
| `src/pages/AcceptInvitation/index.tsx` | 招待承認 |
| `src/pages/SetPassword.tsx` | パスワード設定 |
| `src/pages/ResetPassword.tsx` | パスワードリセット |

### コンテキスト

| ファイル | 役割 |
|---------|------|
| `src/contexts/AuthContext.tsx` | 認証状態管理 |

### フック

| ファイル | 役割 |
|---------|------|
| `src/hooks/useAuth.ts` | 認証フック（AuthContext使用） |
| `src/hooks/useOrganization.ts` | 組織情報取得 |

### Edge Functions

| 関数 | 役割 |
|------|------|
| `invite-staff` | 招待メール送信 |
| `delete-user` | ユーザー削除 |

---

## 7. セキュリティ

### 7.1 Row Level Security (RLS)

全テーブルにRLSを適用し、組織間のデータを分離:

```sql
-- 自組織のデータのみアクセス可能
CREATE POLICY "Users can access their organization data"
ON staff
USING (
  organization_id = get_user_organization_id(auth.uid())
);
```

### 7.2 招待トークン

- ランダムUUID形式
- 有効期限7日間
- 1回使用で無効化

---

## 8. 関連ドキュメント

- [staff-management/](../staff-management/) - スタッフ管理
- [store-organization/](../store-organization/) - 組織管理
- [features/README.md](../README.md) - 機能概要一覧


