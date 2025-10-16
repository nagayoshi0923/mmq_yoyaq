# スタッフ招待機能のセットアップガイド

## 概要

スタッフ招待機能により、以下が自動化されます：

1. **auth.users** にユーザー作成
2. **users** テーブルに `role='staff'` で作成
3. **staff** テーブルに `user_id` 付きで作成
4. 招待メール自動送信（パスワード設定リンク付き）

---

## セットアップ手順

### 1. Edge Functionのデプロイ

```bash
cd /Users/nagayoshimai/mmq_yoyaq
npx supabase functions deploy invite-staff
```

### 2. 環境変数の確認

Supabase DashboardでEdge Functionの環境変数が設定されていることを確認：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (オプション) メール送信設定

### 3. 使い方

#### フロントエンドから呼び出し

```typescript
import { inviteStaff } from '@/lib/staffInviteApi'

// スタッフを招待
const result = await inviteStaff({
  email: 'newstaff@example.com',
  name: '新しいスタッフ',
  phone: '090-1234-5678',
  line_name: 'staff_line',
  x_account: '@staff_x',
  discord_id: '123456789',
  discord_channel_id: '987654321',
  role: ['gm'],
  stores: []
})

if (result.success) {
  console.log('招待成功！', result.data)
  // result.data.user_id: auth.usersのID
  // result.data.staff_id: staffテーブルのID
}
```

---

## 既存のスタッフ追加との違い

### 従来の方法（手動）
1. スタッフ管理画面で基本情報を入力
2. staffテーブルにレコード作成
3. **別途** メールアドレスを共有してユーザー登録してもらう
4. **手動で** user_idを紐付ける

### 新しい方法（招待）
1. スタッフ管理画面で「スタッフを招待」ボタン
2. メールアドレスと基本情報を入力
3. **自動的に** ユーザー作成 + staff作成 + 紐付け
4. **自動的に** 招待メール送信

---

## 今後の改善案

### Phase 1: 基本機能（現在）
- [x] Edge Function作成
- [x] APIクライアント作成
- [ ] スタッフ管理画面にUI追加

### Phase 2: UX改善
- [ ] 招待状態の表示（招待済み/未承認/承認済み）
- [ ] 招待メールの再送信機能
- [ ] 招待のキャンセル機能

### Phase 3: 高度な機能
- [ ] カスタム招待メールテンプレート
- [ ] 招待時にシナリオアサインも同時実行
- [ ] 一括招待機能（CSVアップロード）

---

## トラブルシューティング

### 招待メールが届かない
- Supabase Dashboard → Authentication → Email Templates で設定確認
- SPFレコード、DKIMの設定確認
- Gmailの場合、迷惑メールフォルダを確認

### user_idが紐付かない
- Edge Functionのログを確認：Supabase Dashboard → Edge Functions → Logs
- RLSポリシーの確認

### メールアドレスが既に存在する
- 既存のユーザーには招待を送れません
- 既存ユーザーの場合は、手動でstaffテーブルにuser_idを設定してください

---

## データベース構造

```
auth.users (Supabase管理)
  ↓ id
users (アプリ管理)
  - id (auth.usersのidと同じ)
  - email
  - role: 'staff'
  ↓ id
staff
  - id (UUID)
  - user_id (users.idを参照)
  - name
  - email
  - ...その他の情報
```

招待機能により、この3つのテーブルが自動的に連携されます。

