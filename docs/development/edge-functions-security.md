# Edge Functions セキュリティガイド

**最終更新**: 2026-01-12

---

## 概要

Supabase Edge Functions のセキュリティ対策について説明します。
すべてのEdge Functionsは、以下のセキュリティ要件を満たす必要があります。

---

## ✅ 対応済みのEdge Functions

| ファイル | 認証チェック | CORS制限 | ログマスキング |
|----------|------------|----------|---------------|
| `delete-user/index.ts` | ✅ 管理者のみ | ✅ | ✅ |
| `invite-staff/index.ts` | ✅ 管理者のみ | ✅ | ✅ |
| `send-booking-confirmation/index.ts` | - | ✅ | ✅ |

---

## 🔧 共通セキュリティヘルパー

`_shared/security.ts` に共通のセキュリティ機能を実装しています。

### 使い方

```typescript
import { 
  getCorsHeaders, 
  maskEmail, 
  maskName, 
  verifyAuth 
} from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 認証が必要な場合
  const auth = await verifyAuth(req, ['admin', 'license_admin'])
  if (!auth.success) {
    return new Response(
      JSON.stringify({ success: false, error: auth.error }),
      { status: auth.statusCode, headers: corsHeaders }
    )
  }

  // ログにはマスキングした情報のみ出力
  console.log('Processing request by:', maskEmail(auth.user?.email || ''))

  // ... 処理 ...
})
```

### 提供される関数

| 関数 | 説明 |
|------|------|
| `getCorsHeaders(origin)` | 許可されたオリジンのみを返すCORSヘッダー |
| `maskEmail(email)` | メールアドレスをマスキング（例: `ex***@gmail.com`） |
| `maskName(name)` | 名前をマスキング（例: `山***`） |
| `maskPhone(phone)` | 電話番号をマスキング（例: `090-****-5678`） |
| `verifyAuth(req, requiredRoles?)` | 認証と権限を検証 |

---

## 📋 Edge Functions 修正チェックリスト

### 認証が必要なEdge Functions

以下のEdge Functionsは、管理者権限が必要な操作を行うため、認証チェックが必須です：

- [x] `delete-user/index.ts` - ユーザー削除
- [x] `invite-staff/index.ts` - スタッフ招待
- [ ] `send-author-report/index.ts` - 作者レポート送信（要修正）

### CORS制限が必要なEdge Functions

以下のEdge Functionsは、フロントエンドからの呼び出しを想定しているため、CORS制限が必要です：

- [x] `delete-user/index.ts`
- [x] `invite-staff/index.ts`
- [x] `send-booking-confirmation/index.ts`
- [ ] `send-cancellation-confirmation/index.ts` - 要修正
- [ ] `send-private-booking-confirmation/index.ts` - 要修正
- [ ] `send-private-booking-request-confirmation/index.ts` - 要修正
- [ ] `send-booking-change-confirmation/index.ts` - 要修正
- [ ] `send-reminder-emails/index.ts` - 要修正
- [ ] `send-email/index.ts` - 要修正

### Webhook/外部サービス向けのEdge Functions

以下のEdge Functionsは、外部サービス（Discord, Google Sheets等）からの呼び出しを想定しているため、CORSよりもWebhook署名検証が重要です：

- `discord-interactions/index.ts` - Discord署名検証あり
- `discord-shift-interactions/index.ts` - Discord署名検証あり
- `sync-shifts-to-google-sheet/index.ts` - 内部呼び出し専用
- `notify-*-discord/index.ts` - 内部トリガー専用

---

## 🛡️ 修正パターン

### パターン1: 認証必須のEdge Function

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, maskEmail, verifyAuth } from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 管理者のみ許可
  const auth = await verifyAuth(req, ['admin', 'license_admin'])
  if (!auth.success) {
    return new Response(
      JSON.stringify({ success: false, error: auth.error }),
      { status: auth.statusCode, headers: corsHeaders }
    )
  }

  console.log('✅ Authenticated:', maskEmail(auth.user?.email || ''))

  // ... 処理 ...
})
```

### パターン2: 認証不要だがCORS制限が必要なEdge Function

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, maskEmail } from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ... 処理 ...
  console.log('Sending email to:', maskEmail(email))

  return new Response(
    JSON.stringify({ success: true }),
    { headers: corsHeaders }
  )
})
```

---

## 🚫 禁止事項

1. **ログに個人情報を直接出力しない**
   ```typescript
   // ❌ 悪い例
   console.log('User email:', email)
   
   // ✅ 良い例
   console.log('User email:', maskEmail(email))
   ```

2. **CORSで全オリジンを許可しない**
   ```typescript
   // ❌ 悪い例
   'Access-Control-Allow-Origin': '*'
   
   // ✅ 良い例
   const corsHeaders = getCorsHeaders(origin)
   ```

3. **管理操作に認証チェックなしで許可しない**
   ```typescript
   // ❌ 悪い例
   const { userId } = await req.json()
   await supabase.auth.admin.deleteUser(userId)
   
   // ✅ 良い例
   const auth = await verifyAuth(req, ['admin'])
   if (!auth.success) return errorResponse(...)
   await supabase.auth.admin.deleteUser(userId)
   ```

---

## 📝 許可オリジン一覧

`_shared/security.ts` で定義されている許可オリジン：

```typescript
const ALLOWED_ORIGINS = [
  'https://mmq-yoyaq.vercel.app',
  'https://mmq-yoyaq-git-main-nagayoshi0923s-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]
```

新しいデプロイ先を追加する場合は、このリストに追加してください。

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `_shared/security.ts` | 共通セキュリティヘルパー |
| `_shared/organization-settings.ts` | 組織設定取得ヘルパー |



