# RLS セキュリティ監査レポート

**監査日**: 2026-01-23  
**監査者**: セキュリティ監査AI  
**プロジェクト**: MMQ予約システム

**監査方針**:
- フロントエンド制御は信用しない
- IDOR（Insecure Direct Object Reference）の可能性を徹底調査
- 同時操作・悪用・想定外入力を前提とする

---

## 🚨 Critical（即座に修正必須）

### V-1: 予約テーブルの `FOR ALL` ポリシー（IDOR）

**危険度**: 🔴 **Critical**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L104-111

**問題のコード**:
```sql
CREATE POLICY reservations_strict ON reservations FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  END
);
```

**脆弱性**:
1. **`FOR ALL` = SELECT + INSERT + UPDATE + DELETE** を許可
2. INSERT時に `customer_id` をパラメータで受け取り、検証なし
3. UPDATE時に他人の予約を変更可能（organization_idチェックのみ）
4. DELETE時に自分の予約を削除可能（データ整合性破壊）

**攻撃シナリオ**: IDOR - 他人の予約情報を取得・変更

```javascript
// ブラウザコンソールから実行
// 1. 他人の customer_id で予約を作成（なりすまし）
await supabase.from('reservations').insert({
  customer_id: 'OTHER_CUSTOMER_UUID',  // 他人のID
  schedule_event_id: 'event-123',
  participant_count: 5,
  total_price: 10000
  // organization_id はフロントで設定されるが信用できない
})

// 2. 他人の予約を UPDATE（同じ organization_id なら変更可能）
await supabase.from('reservations').update({
  participant_count: 1,  // 人数を勝手に変更
  status: 'cancelled'    // キャンセルに変更
}).eq('id', 'OTHER_RESERVATION_UUID')

// 3. 自分の予約を DELETE（在庫返却されず、データ不整合）
await supabase.from('reservations').delete()
  .eq('customer_id', 'MY_CUSTOMER_ID')
```

**現実的な被害**:
- **他人のメールアドレスで予約** → その人に確認メールが届く
- **同組織内の予約を勝手に変更・キャンセル**
- **予約レコードを直接削除** → schedule_events.current_participants が狂う

**修正方針**:
```sql
-- SELECT: 自分の予約 OR 自組織スタッフ
CREATE POLICY reservations_select ON reservations FOR SELECT USING (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  OR organization_id = get_user_organization_id()
  OR is_org_admin()
);

-- INSERT: RPC関数のみ許可（直接INSERT禁止）
-- RPC関数内で customer_id と auth.uid() の紐付けを検証
CREATE POLICY reservations_insert ON reservations FOR INSERT WITH CHECK (FALSE);

-- UPDATE: 自組織スタッフのみ（status更新など）
CREATE POLICY reservations_update ON reservations FOR UPDATE USING (
  organization_id = get_user_organization_id()
  OR is_org_admin()
) WITH CHECK (
  organization_id = get_user_organization_id()
  OR is_org_admin()
);

-- DELETE: 完全禁止（論理削除で対応）
CREATE POLICY reservations_delete ON reservations FOR DELETE USING (FALSE);
```

---

### V-2: 顧客テーブルの `FOR ALL` ポリシー（organization_id 偽装）

**危険度**: 🔴 **Critical**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L121-128

**問題のコード**:
```sql
CREATE POLICY customers_strict ON customers FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      user_id = auth.uid()
  END
);
```

**脆弱性**:
1. 顧客が自分の `customers` レコードを UPDATE/DELETE できる
2. `organization_id` を書き換えて別組織に侵入可能
3. `email`, `phone` などの個人情報を改ざん可能

**攻撃シナリオ**: organization_id を書き換えてマルチテナント境界を突破

```javascript
// 自分の customers レコードの organization_id を書き換え
await supabase.from('customers').update({
  organization_id: 'TARGET_ORG_UUID'  // 他組織のID
}).eq('user_id', auth.uid())

// → 次回以降、他組織のデータにアクセス可能になる？
// （実際は get_user_organization_id() は staff テーブル参照なので無効だが、
//   論理的には攻撃の余地がある）
```

**現実的な被害**:
- **個人情報の改ざん** - email, phone を変更して連絡不能に
- **customers レコード削除** - 予約履歴が追えなくなる
- **データ整合性の破壊**

**修正方針**:
```sql
-- SELECT: 自分 OR 自組織スタッフ
CREATE POLICY customers_select ON customers FOR SELECT USING (
  user_id = auth.uid()
  OR organization_id = get_user_organization_id()
  OR is_org_admin()
);

-- INSERT: RPC関数のみ（user_id と auth.uid() の一致を強制）
CREATE POLICY customers_insert ON customers FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND organization_id IS NOT NULL  -- 必須
);

-- UPDATE: 自組織スタッフのみ（顧客は自分で更新不可）
-- または、顧客は限定フィールドのみ更新可能（avatar_url等）
CREATE POLICY customers_update_staff ON customers FOR UPDATE USING (
  organization_id = get_user_organization_id()
  OR is_org_admin()
);

-- DELETE: 完全禁止
CREATE POLICY customers_delete ON customers FOR DELETE USING (FALSE);
```

---

### V-3: Edge Function で認証チェックなし（スパム送信）

**危険度**: 🔴 **Critical**

**ファイル**: `supabase/functions/send-booking-confirmation/index.ts`

**問題のコード**:
```typescript
serve(async (req) => {
  // ...
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )

  // リクエストボディを取得
  const bookingData: BookingConfirmationRequest = await req.json()
  
  // ❌ 認証チェックなし！
  
  // 任意のメールアドレスにメール送信
  const resendResponse = await fetch('https://api.resend.com/emails', {
    // ...
    to: [bookingData.customerEmail],  // 検証なし
```

**脆弱性**:
1. **認証チェックが一切ない**
2. 任意のメールアドレスにメールを送信可能
3. レート制限なし

**攻撃シナリオ**: スパムメール送信

```javascript
// 攻撃者がブラウザから直接呼び出し
await fetch('https://PROJECT.supabase.co/functions/v1/send-booking-confirmation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerEmail: 'victim@example.com',  // 被害者のメール
    customerName: 'スパム',
    scenarioTitle: '悪意のある内容',
    // ...
  })
})

// → 無制限にスパムメールを送信可能
```

**現実的な被害**:
- **Resend アカウントの停止** - スパム報告でAPI利用停止
- **送信元ドメインのブラックリスト登録**
- **法的リスク** - 迷惑メール防止法違反

**影響範囲**: 同じパターンの Edge Functions
- `send-booking-confirmation`
- `send-booking-change-confirmation`
- `send-cancellation-confirmation`
- `send-private-booking-confirmation`
- `send-contact-inquiry`  ← 特に危険（問い合わせフォーム）

**修正方針**:
```typescript
import { verifyAuth, errorResponse, getCorsHeaders } from '../_shared/security.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ✅ 認証チェック追加
  const authResult = await verifyAuth(req)
  if (!authResult.success) {
    return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
  }

  const bookingData = await req.json()
  
  // ✅ 予約IDから正当性を検証
  const { data: reservation } = await supabaseClient
    .from('reservations')
    .select('customer_id, customer_email, organization_id')
    .eq('id', bookingData.reservationId)
    .single()
  
  if (!reservation) {
    return errorResponse('予約が見つかりません', 404, corsHeaders)
  }
  
  // ✅ メールアドレスの一致確認
  if (reservation.customer_email !== bookingData.customerEmail) {
    return errorResponse('メールアドレスが一致しません', 403, corsHeaders)
  }
  
  // ✅ 組織の一致確認（スタッフの場合）
  if (authResult.user.role !== 'customer') {
    const staffOrg = await getStaffOrganizationId(authResult.user.id)
    if (staffOrg !== reservation.organization_id) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }
  }
  
  // メール送信処理
  // ...
})
```

---

### V-4: 貸切予約の顧客用ポリシー欠如

**危険度**: 🔴 **Critical**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L206-208

**問題のコード**:
```sql
CREATE POLICY private_booking_requests_strict ON private_booking_requests FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);
```

**脆弱性**:
1. 顧客からの貸切申込なのに、顧客用のポリシーがない
2. スタッフ・管理者のみアクセス可能
3. **顧客は自分の申込を見られない**

**攻撃シナリオ**: organization_id を偽装して申込

```javascript
// 顧客は RLS で弾かれるが、ブラウザコンソールから試みる
await supabase.from('private_booking_requests').insert({
  organization_id: 'GUESSED_ORG_UUID',  // 推測したID
  contact_name: '攻撃者',
  contact_email: 'attacker@example.com',
  // ...
})

// → RLS で弾かれる（顧客用ポリシーがない）
// しかし、正しい organization_id を推測できれば挿入可能
```

**現実的な被害**:
- **顧客が自分の申込を確認できない** - UX問題
- **organization_id を推測されると不正申込** - UUIDなので困難だが可能性はある

**修正方針**:
```sql
-- SELECT: 自分の申込 OR 自組織スタッフ
CREATE POLICY private_booking_requests_select ON private_booking_requests FOR SELECT USING (
  contact_email = auth.email()  -- 顧客用
  OR organization_id = get_user_organization_id()
  OR is_org_admin()
);

-- INSERT: 認証済みユーザー（メールアドレス一致を確認）
CREATE POLICY private_booking_requests_insert ON private_booking_requests FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND contact_email = auth.email()  -- 自分のメールのみ
);

-- UPDATE/DELETE: 自組織スタッフのみ
CREATE POLICY private_booking_requests_update ON private_booking_requests FOR UPDATE USING (
  organization_id = get_user_organization_id()
  OR is_org_admin()
);
```

---

## 🟠 High（早急に修正推奨）

### V-5: キャンセル待ちの `auth.users` 直接参照

**危険度**: 🟠 **High**

**ファイル**: `database/migrations/create_waitlist.sql` L42

**問題**: 既に分析済み（C-2）

**概要**:
- RLSポリシーが `auth.users` テーブルを直接 SELECT
- `permission denied for table users` エラー発生
- 未認証ユーザーの登録を許可する矛盾した設計

**修正方針**: `CRITICAL_FIXES_PLAN.md` の C-2 を参照

---

### V-6: scenario_likes の `FOR ALL` ポリシー

**危険度**: 🟠 **High**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L177-184

**問題のコード**:
```sql
CREATE POLICY scenario_likes_strict ON scenario_likes FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  END
);
```

**脆弱性**:
1. `FOR ALL` で INSERT/UPDATE/DELETE を許可
2. 他人の `customer_id` で「いいね」を登録可能
3. 他人の「いいね」を削除可能（同組織内）

**攻撃シナリオ**: いいね操作

```javascript
// 他人の customer_id で「いいね」
await supabase.from('scenario_likes').insert({
  customer_id: 'OTHER_CUSTOMER_UUID',
  scenario_id: 'scenario-123',
  organization_id: 'org-123'
})

// 他人の「いいね」を削除
await supabase.from('scenario_likes').delete()
  .eq('customer_id', 'OTHER_CUSTOMER_UUID')
```

**修正方針**:
```sql
-- SELECT: 全員閲覧可能（いいね数の表示）
CREATE POLICY scenario_likes_select ON scenario_likes FOR SELECT USING (TRUE);

-- INSERT: 自分のみ
CREATE POLICY scenario_likes_insert ON scenario_likes FOR INSERT WITH CHECK (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  AND organization_id IS NOT NULL
);

-- DELETE: 自分のみ
CREATE POLICY scenario_likes_delete ON scenario_likes FOR DELETE USING (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
);

-- UPDATE: 禁止
CREATE POLICY scenario_likes_update ON scenario_likes FOR UPDATE USING (FALSE);
```

---

### V-7: user_notifications の `FOR INSERT WITH CHECK (TRUE)`

**危険度**: 🟠 **High**

**ファイル**: `database/migrations/create_user_notifications.sql` L75-76

**問題のコード**:
```sql
-- トリガー関数から通知を作成するため、INSERTは許可
CREATE POLICY "Allow insert for triggers" ON user_notifications
  FOR INSERT WITH CHECK (TRUE);
```

**脆弱性**:
1. **誰でも通知を作成できる**
2. 他人に偽の通知を送信可能
3. 通知スパム

**攻撃シナリオ**: 偽通知の作成

```javascript
// 他人に偽の通知を送信
await supabase.from('user_notifications').insert({
  user_id: 'TARGET_USER_UUID',
  customer_id: null,
  organization_id: 'org-123',
  type: 'reservation_confirmed',
  title: '偽の予約確定通知',
  message: '詐欺サイトへのリンク',
  link: 'https://malicious.example.com'
})
```

**修正方針**:
```sql
-- INSERT: トリガー関数のみ（SECURITY DEFINER）
-- クライアントからの直接INSERTを完全ブロック
CREATE POLICY "Block direct insert" ON user_notifications
  FOR INSERT WITH CHECK (FALSE);

-- トリガー関数は SECURITY DEFINER で RLS をバイパス
-- （既に実装済み: create_notification 関数）
```

---

## 🟡 Medium（改善推奨）

### V-8: staff テーブルの未ログイン時の挙動

**危険度**: 🟡 **Medium**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L139-143

**問題のコード**:
```sql
CREATE POLICY staff_strict ON staff FOR ALL USING (
  get_user_organization_id() IS NULL  -- ❓ 未ログインは見えない？
  OR organization_id = get_user_organization_id() 
  OR is_org_admin()
);
```

**脆弱性**:
1. ロジックが逆（`IS NULL` で TRUE になる）
2. おそらくバグ（意図: `IS NOT NULL`）

**修正方針**:
```sql
CREATE POLICY staff_select ON staff FOR SELECT USING (
  auth.uid() IS NOT NULL  -- 認証必須
  AND (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  )
);
```

---

### V-9: schedule_events の公開ポリシー（過去イベント）

**危険度**: 🟡 **Medium**

**ファイル**: `database/migrations/003_create_organization_functions_and_rls.sql` L250-252

**問題のコード**:
```sql
CREATE POLICY schedule_events_public_read ON schedule_events FOR SELECT USING (
  is_cancelled = false
);
```

**脆弱性**:
1. 過去のイベントも表示される
2. 日付フィルタがない

**修正方針**:
```sql
CREATE POLICY schedule_events_public_read ON schedule_events FOR SELECT USING (
  is_cancelled = false
  AND date >= CURRENT_DATE - INTERVAL '7 days'  -- 過去1週間のみ
);
```

---

### V-10: external_performance_reports の `true`

**危険度**: 🟡 **Medium**

**ファイル**: `database/migrations/004_strict_rls_policies_safe.sql` L247

**問題のコード**:
```sql
CREATE POLICY external_performance_reports_strict ON external_performance_reports FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR organization_id IS NULL OR is_org_admin()
    ELSE
      true  -- ❌ 外部報告フォームからの投稿を許可
  END
);
```

**脆弱性**:
1. 未認証ユーザーが **SELECT/INSERT/UPDATE/DELETE** 全て可能
2. スパム投稿
3. 他人のレポートを削除可能

**修正方針**:
```sql
-- SELECT: 自組織のみ
CREATE POLICY external_performance_reports_select ON external_performance_reports FOR SELECT USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

-- INSERT: 未認証でも可能（外部フォーム用）、ただし organization_id 検証
CREATE POLICY external_performance_reports_insert ON external_performance_reports FOR INSERT WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM organizations WHERE id = organization_id AND is_active = true)
);

-- UPDATE/DELETE: 自組織スタッフのみ
CREATE POLICY external_performance_reports_update ON external_performance_reports FOR UPDATE USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

CREATE POLICY external_performance_reports_delete ON external_performance_reports FOR DELETE USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);
```

---

## 修正優先順位まとめ

| # | 問題 | 危険度 | 影響範囲 | 優先度 |
|---|------|--------|----------|--------|
| **V-1** | reservations の FOR ALL | Critical | 全予約データ | **1位** |
| **V-2** | customers の FOR ALL | Critical | 顧客個人情報 | **2位** |
| **V-3** | Edge Function 認証なし | Critical | メール送信（スパム） | **3位** |
| **V-4** | 貸切予約の顧客ポリシー欠如 | Critical | 貸切申込 | **4位** |
| **V-5** | キャンセル待ちの auth.users 参照 | High | キャンセル待ち機能 | **5位** |
| **V-6** | scenario_likes の FOR ALL | High | いいね機能 | **6位** |
| **V-7** | user_notifications の WITH CHECK (TRUE) | High | 通知機能 | **7位** |
| V-8 | staff の IS NULL バグ | Medium | スタッフ一覧 | 8位 |
| V-9 | schedule_events の過去表示 | Medium | UX問題 | 9位 |
| V-10 | external_performance_reports の true | Medium | 外部フォーム | 10位 |

---

## 実装手順

### Phase 1: 緊急対応（1-2日）

1. **V-3 Edge Function 認証追加**（最速で対応）
   - send-booking-confirmation
   - send-cancellation-confirmation
   - send-contact-inquiry
   - その他のメール送信系

2. **V-1 reservations ポリシー分離**
   - FOR ALL を SELECT/INSERT/UPDATE/DELETE に分離
   - INSERT は RPC のみ許可

### Phase 2: Critical 対応（3-5日）

3. **V-2 customers ポリシー分離**
4. **V-4 private_booking_requests に顧客用ポリシー追加**
5. **V-5 キャンセル待ち修正**（C-2 対応）

### Phase 3: High 対応（1週間）

6. **V-6 scenario_likes ポリシー分離**
7. **V-7 user_notifications INSERT 禁止**

### Phase 4: Medium 対応（2週間）

8. **V-8〜V-10 その他の改善**

---

## テスト方法

### 1. RLS ポリシーの単体テスト

```sql
-- 未認証ユーザーで INSERT（失敗すべき）
SET LOCAL ROLE anon;
INSERT INTO reservations (...) VALUES (...);  -- エラー

-- 認証済みユーザーで他人の customer_id（失敗すべき）
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"user-uuid","email":"test@example.com"}';
INSERT INTO reservations (customer_id,...) VALUES ('OTHER_UUID',...);  -- エラー

-- 正常な INSERT（成功すべき）
SELECT create_reservation_with_lock(...);  -- 成功
```

### 2. Edge Function の認証テスト

```bash
# 認証なしで呼び出し（401 エラーすべき）
curl -X POST https://PROJECT.supabase.co/functions/v1/send-booking-confirmation \
  -H "Content-Type: application/json" \
  -d '{"customerEmail":"test@example.com",...}'

# 認証ありで呼び出し（200 成功）
curl -X POST https://PROJECT.supabase.co/functions/v1/send-booking-confirmation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reservationId":"valid-uuid",...}'
```

### 3. IDOR テスト

```javascript
// Playwright E2E テスト
test('他人の予約を閲覧できない', async () => {
  // ユーザーA でログイン
  await loginAsUserA()
  
  // ユーザーB の予約IDを取得（DBから直接）
  const userBReservationId = await getReservationIdOfUserB()
  
  // ユーザーA が ユーザーB の予約を取得試行
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', userBReservationId)
    .single()
  
  // RLS で弾かれるべき
  expect(error).toBeTruthy()
  expect(data).toBeNull()
})
```

---

## 継続的な監視

### 1. RLS ポリシーの定期チェック

```sql
-- 危険な FOR ALL ポリシーを検出
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd  -- ALL が含まれていないか
FROM pg_policies
WHERE cmd = 'ALL'
  AND schemaname = 'public';
```

### 2. Edge Function の認証漏れチェック

```bash
# verifyAuth() の呼び出しがない関数を検出
cd supabase/functions
for dir in */; do
  if ! grep -q "verifyAuth" "$dir/index.ts"; then
    echo "⚠️ 認証チェックなし: $dir"
  fi
done
```

### 3. customer_id / organization_id の検証漏れチェック

```bash
# customer_id をパラメータで受け取っているが検証していない箇所
grep -rn "customer_id" src --include="*.ts" --include="*.tsx" | \
  grep -v "auth.uid()" | \
  grep -v "SELECT id FROM customers"
```

---

*このレポートは 2026-01-23 に作成されました。*  
*定期的に見直し、更新することを推奨します。*




