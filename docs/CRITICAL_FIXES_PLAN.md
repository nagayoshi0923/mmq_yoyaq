# クリティカル問題 修正計画

**作成日**: 2026-01-23  
**目的**: 顧客テスト（2026-01-21）で発見されたクリティカル問題の修正方針を整理

**原則**:
- フロントエンド制御は信用しない
- データベース層で物理的に防ぐ
- 同時操作・悪用・想定外入力を前提とする
- 「炎上・返金・現場混乱」リスクを重視

---

## 修正優先順位（Tier分類）

### 🚨 Tier 0: 即座に運用停止レベル
1. **C-1**: 残席より多い人数を予約できる（対応済み）
2. **C-10**: 新規登録でメール確認なし + 重複登録可（対応中）
3. **C-6**: 過去の日付が選択・予約できる
4. **C-2**: キャンセル待ちでRLSエラー

### 🔴 Tier 1: 営業損失・顧客トラブル確定
5. **C-7**: 2月以降のカレンダー表示されない
6. **C-14**: 同時刻の別公演で警告出ない
7. **C-3/C-4**: 予約変更・キャンセルができない

### 🟡 Tier 2: 認証系（アカウント汚染・UX破壊）
8. **C-8**: パスワードリセット失敗
9. **C-9**: X/Discordログイン動作しない
10. **C-11**: ログイン後に予約フローに戻れない

---

## C-1: 残席オーバーブッキング問題

**ステータス**: ✅ 完了（2026-01-23）
**実装内容**:
- 予約作成: `create_reservation_with_lock` RPCの使用（既存）
- 参加人数変更: RPC（`update_reservation_participants`）へ統一
- 影響箇所: `ReservationsPage`, `ReservationList`

### 問題の本質
- 2人が同時に「残席3」の公演で「3名予約」→ 両方成功 → 6名予約
- `SELECT → 在庫チェック → INSERT` の間に競合発生（Read-Check-Write問題）
- データベース層でアトミック制御なし

### 採用方式: **RPC + FOR UPDATE（悲観的ロック）**

**選定理由**:
- データベース層で確実に防げる（人為ミス排除）
- Supabase RPCを既に使用中（追加学習コスト低）
- SECURITY DEFINER + RLS でマルチテナント対応
- 1関数完結でテスト・デバッグ容易

**却下した案**:
- ❌ **DB制約（CHECK + トリガー）**: デバッグ困難、RLS相互作用リスク
- ❌ **Edge Function集中制御**: ネットワーク越しの在庫制御リスク、コールドスタート

### 実装設計

#### データベース関数

```sql
-- ① 予約作成（在庫確保）
CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_event_id UUID,
  p_customer_id UUID,
  p_count INT,
  p_organization_id UUID
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_reservation_id UUID;
BEGIN
  -- 行ロック + 在庫確認
  IF NOT EXISTS (
    SELECT 1 FROM schedule_events
    WHERE id = p_event_id
      AND organization_id = p_organization_id
      AND current_participants + p_count <= max_participants
    FOR UPDATE  -- 他トランザクションをブロック
  ) THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0001';
  END IF;
  
  -- 在庫減算
  UPDATE schedule_events
  SET current_participants = current_participants + p_count
  WHERE id = p_event_id;
  
  -- 予約レコード作成
  INSERT INTO reservations (
    customer_id, schedule_event_id, participant_count, 
    organization_id, status, created_at
  ) VALUES (
    p_customer_id, p_event_id, p_count, 
    p_organization_id, 'confirmed', NOW()
  ) RETURNING id INTO v_reservation_id;
  
  RETURN v_reservation_id;
END;
$$;

-- ② キャンセル（在庫返却）
CREATE OR REPLACE FUNCTION cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_count INT;
BEGIN
  -- 予約情報取得 + ロック
  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_count
  FROM reservations
  WHERE id = p_reservation_id
    AND customer_id = p_customer_id
    AND status != 'cancelled'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  
  -- 在庫返却
  UPDATE schedule_events
  SET current_participants = current_participants - v_count
  WHERE id = v_event_id;
  
  -- ステータス更新
  UPDATE reservations
  SET status = 'cancelled', cancelled_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN TRUE;
END;
$$;

-- ③ 予約変更（差分調整）
CREATE OR REPLACE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INT,
  p_customer_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_old_count INT;
  v_diff INT;
BEGIN
  -- 既存予約取得 + ロック
  SELECT schedule_event_id, participant_count
  INTO v_event_id, v_old_count
  FROM reservations
  WHERE id = p_reservation_id AND customer_id = p_customer_id
  FOR UPDATE;
  
  v_diff := p_new_count - v_old_count;
  
  -- 増加の場合は在庫確認
  IF v_diff > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM schedule_events
      WHERE id = v_event_id
        AND current_participants + v_diff <= max_participants
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'INSUFFICIENT_SEATS';
    END IF;
  END IF;
  
  -- 在庫調整
  UPDATE schedule_events
  SET current_participants = current_participants + v_diff
  WHERE id = v_event_id;
  
  -- 予約更新
  UPDATE reservations
  SET participant_count = p_new_count
  WHERE id = p_reservation_id;
  
  RETURN TRUE;
END;
$$;
```

#### API層（フロントエンド呼び出し）

```typescript
// src/lib/reservationApi.ts（新規作成）
export async function createReservation(params: CreateReservationParams) {
  const orgId = await getCurrentOrganizationId()
  
  const { data, error } = await supabase.rpc('create_reservation_with_lock', {
    p_event_id: params.eventId,
    p_customer_id: params.customerId,
    p_count: params.participantCount,
    p_organization_id: orgId
  })
  
  if (error?.code === 'P0001' && error.message === 'SOLD_OUT') {
    throw new ApiError('SOLD_OUT', '満席です。キャンセル待ちに登録しますか？')
  }
  
  if (error) throw error
  
  return data  // reservation_id
}

export async function cancelReservation(reservationId: string, customerId: string) {
  const { data, error } = await supabase.rpc('cancel_reservation_with_lock', {
    p_reservation_id: reservationId,
    p_customer_id: customerId
  })
  
  if (error?.message === 'RESERVATION_NOT_FOUND') {
    throw new ApiError('NOT_FOUND', '予約が見つかりません')
  }
  
  if (error) throw error
  return data
}

export async function updateReservationParticipants(
  reservationId: string,
  newCount: number,
  customerId: string
) {
  const { data, error } = await supabase.rpc('update_reservation_participants', {
    p_reservation_id: reservationId,
    p_new_count: newCount,
    p_customer_id: customerId
  })
  
  if (error?.message === 'INSUFFICIENT_SEATS') {
    throw new ApiError('INSUFFICIENT_SEATS', '選択した人数分の空席がありません')
  }
  
  if (error) throw error
  return data
}
```

#### 防御層の多重化

| 層 | 役割 | 目的 |
|---|------|------|
| 1. フロントUI | 残席表示、選択制限 | UX向上（エラー前に防ぐ） |
| 2. API層バリデーション | パラメータチェック | 不正リクエスト拒否 |
| 3. **RPC関数（FOR UPDATE）** | **アトミック在庫制御** | **物理的に競合を防ぐ（最終防衛線）** |
| 4. CHECK制約（追加推奨） | `current_participants <= max_participants` | バグ・直接UPDATE対策 |

### リスクと対策

| リスク | 対策 |
|--------|------|
| デッドロック | `statement_timeout = '5s'` 設定、リトライロジック |
| ロック待ち遅延 | 「予約処理中...」表示、30秒でタイムアウト |
| RLS権限エラー | SECURITY DEFINER で実行、関数内で organization_id 検証 |
| 在庫計算バグ | CHECK制約追加で二重防御 |

### 監視・検証

```sql
-- ロック待ち監視
SELECT pid, wait_event, query 
FROM pg_stat_activity 
WHERE wait_event_type = 'Lock';

-- 在庫整合性チェック（日次バッチ）
SELECT 
  id,
  current_participants,
  max_participants,
  (SELECT COUNT(*) * AVG(participant_count) 
   FROM reservations 
   WHERE schedule_event_id = se.id AND status = 'confirmed') as actual_count
FROM schedule_events se
WHERE current_participants != actual_count;
```

### 実装手順

1. ✅ マイグレーションファイル作成（3つのRPC関数）
2. ⬜ CHECK制約追加（二重防御）
3. ⬜ API層の既存コード置き換え（BookingConfirmation.tsx等）
4. ⬜ エラーハンドリング追加（SOLD_OUT → キャンセル待ち誘導）
5. ⬜ 負荷テスト（10人同時予約）
6. ⬜ 在庫整合性チェックバッチ追加

---

## C-2: キャンセル待ち RLSエラー

**ステータス**: 原因特定完了、修正方針策定中

### 問題の本質

`permission denied for table users` エラーは、**RLSポリシーが `auth.users` テーブルを直接参照**していることが原因。

```sql
-- ❌ 問題のあるポリシー（create_waitlist.sql）
CREATE POLICY "Organization members can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (
    ...
    OR
    customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    -- ↑ auth.users テーブルへの直接アクセスは RLS で拒否される
  );
```

### 現在の状況

1. **マイグレーションファイルが2つ存在**
   - `create_waitlist.sql` - 初期版（auth.users直接参照）
   - `fix_waitlist_rls.sql` - 修正版（auth.email()使用）

2. **本番環境でどちらが適用されているか不明**
   - fix版が適用されていない可能性
   - または、他の原因でエラーが発生している

3. **フロントエンドの実装**（BookingConfirmation/index.tsx L217-229）
   ```typescript
   // 未認証ユーザーでも customer_id が NULL で INSERT できる設計
   const { error: insertError } = await supabase
     .from('waitlist')
     .insert({
       organization_id: eventData.organization_id,
       customer_id: customerId,  // ← NULL の可能性
       customer_email: customerEmail,
       ...
     })
   ```

---

## 1. 根本原因の整理

### 原因A: RLSポリシーが古いまま
- `fix_waitlist_rls.sql` が本番環境に適用されていない
- `auth.users` テーブルへの直接参照が残っている

### 原因B: 未認証ユーザーの登録を許可する設計の矛盾
```sql
-- fix_waitlist_rls.sql では未認証も許可
OR (
  auth.uid() IS NULL 
  AND EXISTS (SELECT 1 FROM organizations WHERE id = organization_id AND is_active = true)
)
```

**問題点**:
- 未認証ユーザーは `auth.uid()` も `auth.email()` も NULL
- RLSポリシーの `customer_email = auth.email()` が機能しない
- スパム登録のリスク（CAPTCHA・レート制限なし）

### 原因C: customer_id の NULL 許可設計
```sql
-- waitlistテーブル定義
customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,  -- NULLABLE
```

**問題点**:
- 未認証ユーザーは `customers` レコードがない
- `customer_id` が NULL のレコードは「誰のキャンセル待ちか」特定できない
- 通知時に user_id が取得できない（トリガーで失敗）

---

## 2. 「誰が」「どの操作を」できるべきか

### 権限マトリックス

| 役割 | SELECT | INSERT | UPDATE | DELETE | 備考 |
|------|--------|--------|--------|--------|------|
| **未ログイン** | ❌ | ❌ | ❌ | ❌ | まずログインが必要 |
| **ログイン顧客** | 自分のみ ✅ | 自分のみ ✅ | 自分のみ ✅ | 自分のみ ✅ | customer_email = auth.email() |
| **staff** | 自組織 ✅ | 自組織 ✅ | 自組織 ✅ | 自組織 ✅ | 代理登録可能 |
| **admin** | 自組織 ✅ | 自組織 ✅ | 自組織 ✅ | 自組織 ✅ | 管理権限 |

### ユースケース別の要求

| ユースケース | 要求される情報 | 認証状態 |
|--------------|----------------|----------|
| 顧客が自分で登録 | customer_id, email, phone | **ログイン必須** |
| スタッフが代理登録 | customer情報（検索or新規） | ログイン必須 |
| キャンセル発生時の通知 | customer_id → user_id → email | 必須 |
| 予約への自動繰り上げ | customer_id, participant_count | 必須 |

**結論**: `customer_id` を **NOT NULL** にし、未認証ユーザーは登録不可とすべき。

---

## 3. 最小権限RLSポリシー案

### 方針
1. **未認証ユーザーは登録不可** - セキュリティ優先
2. **customer_id を NOT NULL** - データ整合性確保
3. **auth.users テーブルへの直接参照を排除** - auth.uid(), auth.email() 使用
4. **マルチテナント対応** - organization_id で厳密に分離

### waitlist テーブルのRLSポリシー

```sql
-- 既存ポリシーを全削除
DROP POLICY IF EXISTS "Organization members can view waitlist" ON waitlist;
DROP POLICY IF EXISTS "Anyone can insert waitlist" ON waitlist;
DROP POLICY IF EXISTS "Organization members can update waitlist" ON waitlist;
DROP POLICY IF EXISTS "Organization members can delete waitlist" ON waitlist;

-- ① SELECT: 自分のキャンセル待ち または 自組織のスタッフ
CREATE POLICY "Users can view own or org waitlist" ON waitlist
  FOR SELECT USING (
    -- 自分のキャンセル待ち
    customer_email = auth.email()
    OR
    -- 自組織のスタッフ・管理者
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ② INSERT: 認証済みユーザーのみ（自分のメール または スタッフ）
CREATE POLICY "Authenticated users can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL  -- 認証必須
    AND (
      -- 自分のメールで登録
      customer_email = auth.email()
      OR
      -- 自組織のスタッフが代理登録
      organization_id IN (
        SELECT organization_id FROM staff WHERE user_id = auth.uid()
      )
    )
  );

-- ③ UPDATE: 自分のキャンセル待ち または 自組織のスタッフ
CREATE POLICY "Users can update own or org waitlist" ON waitlist
  FOR UPDATE USING (
    customer_email = auth.email()
    OR
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ④ DELETE: 自分のキャンセル待ち または 自組織のスタッフ
CREATE POLICY "Users can delete own or org waitlist" ON waitlist
  FOR DELETE USING (
    customer_email = auth.email()
    OR
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );
```

### customers テーブルのRLS（参考）

```sql
-- 顧客は自分のレコードのみ閲覧可能
CREATE POLICY "Users can view own customer record" ON customers
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    -- スタッフは自組織の顧客を閲覧可能
    EXISTS (
      SELECT 1 FROM staff 
      WHERE user_id = auth.uid() 
      AND organization_id = customers.organization_id
    )
  );
```

### users テーブル（auth.users）

```sql
-- ❌ 直接アクセス禁止
-- ✅ auth.uid(), auth.email() のみ使用
```

---

## 4. 将来機能との整合性チェック

### 機能A: キャンセル発生時の通知

**要求**:
- キャンセル待ちリストの先頭者にメール送信
- customer_id → customers.user_id → email を取得

**設計の整合性**:
```sql
-- ✅ customer_id が NOT NULL なので取得可能
SELECT 
  w.id,
  w.customer_email,
  c.user_id,
  c.name
FROM waitlist w
JOIN customers c ON c.id = w.customer_id
WHERE w.schedule_event_id = ?
  AND w.status = 'waiting'
ORDER BY w.created_at
LIMIT 1;
```

**トリガー関数**（既存: create_user_notifications.sql L196-249）:
```sql
CREATE OR REPLACE FUNCTION notify_on_waitlist_available()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_user_id UUID;
BEGIN
  -- ✅ customer_id から user_id を取得
  SELECT user_id INTO v_customer_user_id
  FROM customers
  WHERE id = NEW.customer_id;
  
  -- 通知作成
  PERFORM create_notification(...);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**問題なし**: customer_id が NOT NULL なら正常動作

---

### 機能B: 予約への自動繰り上げ

**フロー**:
1. キャンセル発生 → 空席が出る
2. waitlist から先頭者を取得
3. 自動的に reservations へ INSERT
4. waitlist.status を 'converted' に更新
5. 顧客にメール通知

**要求データ**:
- customer_id: reservations.customer_id に設定
- participant_count: 予約人数
- organization_id: マルチテナント対応

**RPC関数案**:
```sql
CREATE OR REPLACE FUNCTION convert_waitlist_to_reservation(
  p_schedule_event_id UUID,
  p_freed_seats INT
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_waitlist_record waitlist%ROWTYPE;
  v_reservation_id UUID;
BEGIN
  -- キャンセル待ちリストから先頭者を取得（ロック）
  SELECT * INTO v_waitlist_record
  FROM waitlist
  WHERE schedule_event_id = p_schedule_event_id
    AND status = 'waiting'
    AND participant_count <= p_freed_seats
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- 競合回避
  
  IF NOT FOUND THEN
    RETURN NULL;  -- 該当なし
  END IF;
  
  -- 予約作成（C-1の関数を再利用）
  v_reservation_id := create_reservation_with_lock(
    v_waitlist_record.schedule_event_id,
    v_waitlist_record.customer_id,  -- ✅ NOT NULL
    v_waitlist_record.participant_count,
    v_waitlist_record.organization_id
  );
  
  -- キャンセル待ちステータス更新
  UPDATE waitlist
  SET status = 'converted'
  WHERE id = v_waitlist_record.id;
  
  RETURN v_reservation_id;
END;
$$;
```

**整合性**: ✅ customer_id が NOT NULL なら正常動作

---

### 機能C: リアルタイム通知（ベルマーク）

**要求**:
- user_notifications テーブルへの INSERT
- customer_id → user_id の紐付け

**既存実装**（create_user_notifications.sql）:
```sql
CREATE TABLE user_notifications (
  user_id UUID REFERENCES auth.users(id),
  customer_id UUID REFERENCES customers(id),
  related_waitlist_id UUID REFERENCES waitlist(id),
  ...
);

-- RLSポリシー
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (
    user_id = auth.uid() 
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
```

**整合性**: ✅ customer_id が NOT NULL なら正常動作

---

## 5. 実装方針

### Phase 1: RLSポリシー修正（即時）

1. **マイグレーションファイル作成**: `fix_waitlist_rls_v2.sql`
   - 既存ポリシー削除
   - 新ポリシー適用（auth.users参照を完全排除）
   - customer_id NOT NULL 制約は Phase 2 で対応（既存データ影響）

2. **本番環境への適用**
   ```bash
   supabase db push
   ```

### Phase 2: customer_id NOT NULL 化（既存データ確認後）

1. **既存データの確認**
   ```sql
   SELECT COUNT(*) FROM waitlist WHERE customer_id IS NULL;
   ```

2. **NULL レコードの処理**
   - メールアドレスから customers を検索
   - 存在しなければダミーcustomer作成 or レコード削除

3. **NOT NULL 制約追加**
   ```sql
   ALTER TABLE waitlist ALTER COLUMN customer_id SET NOT NULL;
   ```

### Phase 3: フロントエンド修正

1. **BookingConfirmation/index.tsx**
   - キャンセル待ち登録前に認証チェック追加
   - 未ログインならログインページへ誘導
   - customer_id を必ず設定

```typescript
const handleWaitlistSubmit = async () => {
  // 認証チェック
  if (!user) {
    toast.error('キャンセル待ちに登録するにはログインが必要です')
    // 現在の状態を保存
    sessionStorage.setItem('waitlist_return', JSON.stringify({
      eventId,
      participantCount: waitlistParticipantCount
    }))
    navigate('/login')
    return
  }
  
  // customer_id を取得（必須）
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  if (!customer) {
    // customers レコードがなければ作成
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({
        user_id: user.id,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        organization_id: eventData.organization_id
      })
      .select('id')
      .single()
    customerId = newCustomer.id
  } else {
    customerId = customer.id
  }
  
  // キャンセル待ち登録
  await supabase.from('waitlist').insert({
    organization_id: eventData.organization_id,
    schedule_event_id: eventId,
    customer_id: customerId,  // ✅ NOT NULL
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    participant_count: waitlistParticipantCount,
    status: 'waiting'
  })
}
```

### Phase 4: テスト

1. **RLSポリシーのテスト**
   ```sql
   -- 未認証ユーザーでINSERT（失敗すべき）
   SET LOCAL ROLE anon;
   INSERT INTO waitlist (...) VALUES (...);  -- エラー
   
   -- 認証済みユーザーで自分のメール（成功）
   SET LOCAL ROLE authenticated;
   SET LOCAL request.jwt.claims TO '{"sub":"user-uuid","email":"test@example.com"}';
   INSERT INTO waitlist (customer_email,...) VALUES ('test@example.com',...);  -- 成功
   ```

2. **通知機能のテスト**
   - キャンセル待ち登録 → キャンセル発生 → 通知送信

3. **予約繰り上げのテスト**
   - キャンセル発生 → 自動予約変換 → メール送信

---

## リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| 既存の NULL customer_id レコード | Phase2でエラー | 事前に確認・クリーンアップ |
| 未ログインユーザーの不満 | UX低下 | 明確な誘導（「ログインして登録」ボタン）|
| スタッフ代理登録の複雑化 | 運用負荷 | 管理画面で顧客検索UI提供 |

---

## 次のアクション

1. ✅ 問題の根本原因特定完了
2. ⬜ `fix_waitlist_rls_v2.sql` 作成
3. ⬜ 既存データの customer_id NULL 件数確認
4. ⬜ Phase 1 実装（RLSポリシー修正）
5. ⬜ フロントエンド修正（認証チェック追加）

---

## C-3/C-4: 予約変更・キャンセル機能の業務フロー設計

**ステータス**: 業務フロー確定、実装待ち

### 問題の本質
- マイページで予約変更・キャンセルボタンが動作しない
- 残席管理、キャンセル待ち通知、通知との整合性が不明確
- トランザクション順序を間違えるとデータ不整合

---

## 1. 予約変更の業務フロー

### 1.1 前提条件

| 項目 | 条件 |
|------|------|
| **誰が変更できるか** | 本人（顧客）、または 自組織のスタッフ |
| **何を変更できるか** | 参加人数のみ（日時・店舗・シナリオの変更は「キャンセル→新規予約」） |
| **いつまで変更可能か** | 公演開始の24時間前まで |
| **料金の再計算** | 人数変更時は料金を再計算（従量課金の場合） |

### 1.2 変更パターンと在庫影響

| パターン | 在庫影響 | キャンセル待ち通知 | 例 |
|----------|----------|-------------------|-----|
| **増加** | 在庫減少（競合制御必須） | なし | 3名 → 5名（+2席消費） |
| **減少** | 在庫増加（キャンセル待ち通知） | **あり** | 5名 → 3名（+2席開放） |
| **不変** | 影響なし | なし | 3名 → 3名（変更なし） |

### 1.3 正しい処理順序（増加の場合）

```
[フェーズ1: 事前検証]
1-1. 予約の存在確認
     - reservations.id が存在するか
     - status = 'confirmed' か（cancelled/no_show は変更不可）
     
1-2. 権限確認
     - 本人（customer_id と auth.uid() が紐づく）
     - または 自組織スタッフ（organization_id 一致）
     
1-3. 期限確認
     - schedule_events.date + start_time が「現在時刻 + 24時間」より後か
     
1-4. ビジネスルール確認
     - 増加の場合: 差分人数分の空席があるか（後でロックして再確認）
     - 減少の場合: 残り人数 ≧ シナリオの最低人数か

[フェーズ2: トランザクション開始]
2-1. 予約レコードをロック（FOR UPDATE）
     - SELECT * FROM reservations WHERE id = ? FOR UPDATE
     - 同じ予約への同時変更を防ぐ
     
2-2. 公演イベントをロック（FOR UPDATE）
     - SELECT * FROM schedule_events WHERE id = ? FOR UPDATE
     - 在庫の競合制御

[フェーズ3: 在庫確認（増加の場合のみ）]
3-1. 差分人数の確保確認
     - IF current_participants + (new_count - old_count) > max_participants THEN
         RAISE EXCEPTION 'INSUFFICIENT_SEATS'
     - 同時に別の予約が入っていても FOR UPDATE で防げる

[フェーズ4: データ更新]
4-1. 在庫調整
     - 増加: current_participants += diff
     - 減少: current_participants -= diff
     
4-2. 予約レコード更新
     - participant_count = new_count
     - total_price = 再計算（従量課金の場合）
     - updated_at = NOW()
     
4-3. 変更履歴の記録
     - reservation_change_history テーブルに記録
       * changed_by: 'customer' or 'staff'
       * old_count, new_count
       * change_reason（オプション）

[フェーズ5: 通知・後処理（減少の場合のみ）]
5-1. キャンセル待ち通知（非同期）
     - 開放された席数を notify-waitlist に通知
     - Edge Function で先頭者にメール送信
     
5-2. 顧客への変更確認メール
     - send-booking-change-confirmation を呼び出し
     
5-3. user_notifications にレコード作成
     - type: 'reservation_changed'

[フェーズ6: コミット]
6-1. トランザクションコミット
     - すべて成功したら確定
```

### 1.4 減少の場合の処理順序（重要な違い）

```
[フェーズ1〜4は同じ]

[フェーズ5: 通知・後処理]
5-1. 在庫開放を確定してから通知
     - ⚠️ 先に通知するとキャンセル待ちが予約を取れない
     - トランザクションコミット後に notify-waitlist 呼び出し

5-2. キャンセル待ちの繰り上げ処理（別トランザクション）
     - waitlist から先頭者を取得
     - 自動的に予約作成（convert_waitlist_to_reservation）
     - ⚠️ 元のトランザクションとは分離（デッドロック防止）
```

### 1.5 「この順で処理しないと壊れる」ポイント

| # | 問題のある順序 | 正しい順序 | なぜ壊れるか |
|---|----------------|-----------|-------------|
| ⚠️1 | 先に在庫を減らす → 予約更新 | 予約更新 → 在庫調整 | 予約更新が失敗すると在庫だけ減る |
| ⚠️2 | 先に通知 → 在庫開放 | 在庫開放 → 通知 | 通知を受け取った人が予約できない |
| ⚠️3 | 予約ロックなし → 在庫ロック | 予約ロック → 在庫ロック | 同じ予約を同時変更できる |
| ⚠️4 | 在庫確認 → （時間経過）→ 在庫更新 | FOR UPDATE で確認と更新を原子化 | 確認後に別の予約が入る |
| ⚠️5 | メール送信失敗でロールバック | メール送信は別トランザクション | メール失敗で在庫が戻らない |

---

## 2. 予約キャンセルの業務フロー

### 2.1 前提条件

| 項目 | 条件 |
|------|------|
| **誰がキャンセルできるか** | 本人（顧客）、または 自組織のスタッフ |
| **いつまでキャンセル可能か** | 公演開始の24時間前まで無料、それ以降はキャンセル料 |
| **キャンセル後の復活** | 不可（再度予約が必要） |
| **返金処理** | 決済システムと連携（未実装の場合は手動） |

### 2.2 キャンセルの種類

| 種類 | 実行者 | 理由 | キャンセル料 | 通知 |
|------|--------|------|-------------|------|
| **顧客都合** | 顧客 | 予定変更など | 期限に応じて | 顧客にメール |
| **店舗都合** | スタッフ | 公演中止、オーバーブッキング対応 | なし | 顧客にメール + 謝罪 |
| **No Show** | スタッフ | 当日来店なし | 全額 | 記録のみ |

### 2.3 正しい処理順序

```
[フェーズ1: 事前検証]
1-1. 予約の存在確認
     - reservations.id が存在するか
     - status = 'confirmed' か（既にキャンセル済みは再キャンセル不可）
     
1-2. 権限確認
     - 本人 または 自組織スタッフ
     
1-3. キャンセル料の計算
     - 公演開始まで24時間以上: 無料
     - 24時間以内〜開始まで: 50%
     - 開始後: 100%（No Show扱い）
     
1-4. キャンセル理由の記録（オプション）
     - 店舗都合の場合は必須（補償・謝罪が必要）

[フェーズ2: トランザクション開始]
2-1. 予約レコードをロック（FOR UPDATE）
     - SELECT * FROM reservations WHERE id = ? FOR UPDATE
     - 同時キャンセルを防ぐ
     
2-2. 公演イベントをロック（FOR UPDATE）
     - SELECT * FROM schedule_events WHERE id = ? FOR UPDATE
     - 在庫返却の競合制御

[フェーズ3: データ更新]
3-1. 在庫返却
     - current_participants -= cancelled_count
     - ⚠️ 必ず減算（絶対に負数にならないことを確認）
     
3-2. 予約レコードのステータス更新
     - status = 'cancelled'
     - cancelled_at = NOW()
     - cancelled_by = 'customer' | 'staff' | 'system'
     - cancellation_reason = '...'
     - cancellation_fee = 計算済み金額
     
3-3. キャンセル履歴の記録
     - reservation_cancellations テーブル（存在する場合）
       * reservation_id
       * cancelled_by
       * reason
       * fee

[フェーズ4: 通知・後処理]
4-1. キャンセル待ち通知（最重要）
     - 開放された席数を notify-waitlist に通知
     - ⚠️ トランザクションコミット後に実行
     
4-2. 顧客へのキャンセル確認メール
     - send-cancellation-confirmation を呼び出し
     - キャンセル料がある場合は明記
     
4-3. user_notifications にレコード作成
     - type: 'reservation_cancelled'
     
4-4. 店舗都合の場合の追加処理
     - 謝罪メール（カスタムテンプレート）
     - 補償クーポン発行（未実装）

[フェーズ5: キャンセル待ち繰り上げ（別トランザクション）]
5-1. waitlist から条件に合う先頭者を取得
     - WHERE schedule_event_id = ?
     - AND status = 'waiting'
     - AND participant_count <= freed_seats
     - ORDER BY created_at
     - LIMIT 1
     - FOR UPDATE SKIP LOCKED
     
5-2. 自動予約作成
     - convert_waitlist_to_reservation() を呼び出し
     - 在庫の再ロック（FOR UPDATE）
     - 予約作成（create_reservation_with_lock）
     - waitlist.status = 'converted'
     
5-3. 繰り上げ通知
     - 「空きが出たので予約しました」メール
     - user_notifications 作成

[フェーズ6: コミット]
6-1. トランザクションコミット
```

### 2.4 「この順で処理しないと壊れる」ポイント

| # | 問題のある順序 | 正しい順序 | なぜ壊れるか |
|---|----------------|-----------|-------------|
| 🚨1 | 先にメール送信 → status更新 | status更新 → メール送信 | メール送信失敗で予約がゾンビ状態 |
| 🚨2 | status更新 → 在庫返却なし | status更新 + 在庫返却をアトミックに | 在庫が戻らず、満席のまま |
| 🚨3 | 同一トランザクション内でキャンセル待ち繰り上げ | 別トランザクションで実行 | デッドロック発生 |
| 🚨4 | 在庫返却 → コミット前に通知 | コミット → 通知 | ロールバックで在庫が戻るのに通知済み |
| 🚨5 | 削除（DELETE） | 論理削除（status='cancelled'） | 履歴が消える、統計が狂う |

---

## 3. 残席・キャンセル待ち・通知との整合性

### 3.1 在庫管理の基本原則

```
【不変条件】
schedule_events.current_participants 
  = SUM(reservations.participant_count WHERE status='confirmed' AND schedule_event_id=X)

【検証クエリ】
SELECT 
  se.id,
  se.current_participants as stored_count,
  COALESCE(SUM(r.participant_count), 0) as actual_count,
  se.current_participants - COALESCE(SUM(r.participant_count), 0) as diff
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id AND r.status = 'confirmed'
GROUP BY se.id
HAVING se.current_participants != COALESCE(SUM(r.participant_count), 0);
```

**この差分が0以外の場合はバグ**

### 3.2 キャンセル待ち通知の条件判定

```
[条件1: 空席が発生したか]
- 予約変更で人数減少
- 予約キャンセル
- 公演の定員増加（稀）

[条件2: キャンセル待ちが存在するか]
SELECT COUNT(*) FROM waitlist
WHERE schedule_event_id = ?
  AND status = 'waiting'
  AND participant_count <= freed_seats

[条件3: 通知対象の選定]
- 先着順（created_at）
- 希望人数が空席数以下
- ステータスが 'waiting'

[条件4: 通知のタイミング]
❌ トランザクション内: 在庫が確定していない
✅ コミット後: 在庫が確定してから通知
```

### 3.3 通知の種類と優先度

| 優先度 | 通知 | トリガー | 送信先 | 失敗時の対応 |
|--------|------|----------|--------|-------------|
| **1** | 予約確定通知 | 新規予約 | 顧客 | リトライ（user_notifications に記録済み）|
| **2** | キャンセル待ち空き通知 | キャンセル | キャンセル待ち先頭者 | リトライ（期限付き）|
| **3** | 予約変更通知 | 人数変更 | 顧客 | リトライ |
| **4** | キャンセル確認通知 | キャンセル | 顧客 | リトライ |
| 5 | リマインダー | 24時間前 | 顧客 | スキップ可 |

**原則**: 在庫に影響する通知（1, 2）は必ず送信、それ以外は失敗しても継続

### 3.4 トランザクション境界の設計

```
[トランザクション A: 予約変更/キャンセル]
BEGIN;
  -- 予約ロック
  -- 在庫調整
  -- 予約更新
COMMIT;
  ↓
[非同期処理: 通知]
  -- メール送信（失敗してもロールバックしない）
  -- user_notifications 作成
  ↓
[トランザクション B: キャンセル待ち繰り上げ]（別トランザクション）
BEGIN;
  -- waitlist ロック（SKIP LOCKED）
  -- 予約作成
  -- waitlist.status = 'converted'
COMMIT;
  ↓
[非同期処理: 繰り上げ通知]
  -- メール送信
```

**なぜ分離するか**:
- トランザクションAが失敗しても通知は送信されない
- メール送信失敗でトランザクションAがロールバックしない
- キャンセル待ち繰り上げがデッドロックしても元の予約は確定済み

---

## 4. エラーハンドリングと整合性保証

### 4.1 ロールバックが必要な場合

| エラー | ロールバック対象 | 復旧方法 |
|--------|----------------|----------|
| 在庫不足 | トランザクションA全体 | ユーザーにエラー表示 |
| 権限エラー | トランザクションA全体 | 403エラー |
| デッドロック | トランザクションA全体 | リトライ（最大3回）|
| メール送信失敗 | **ロールバックしない** | user_notifications に記録、後でリトライ |
| キャンセル待ち繰り上げ失敗 | トランザクションB のみ | 次のキャンセル待ちに通知 |

### 4.2 整合性チェック（日次バッチ）

```sql
-- チェック1: 在庫数の不整合
SELECT 
  se.id,
  se.scenario,
  se.date,
  se.current_participants as stored,
  COALESCE(SUM(r.participant_count), 0) as actual,
  se.current_participants - COALESCE(SUM(r.participant_count), 0) as diff
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id AND r.status = 'confirmed'
GROUP BY se.id
HAVING diff != 0;

-- チェック2: 孤立したキャンセル待ち
SELECT w.*
FROM waitlist w
LEFT JOIN schedule_events se ON se.id = w.schedule_event_id
WHERE se.id IS NULL
  AND w.status = 'waiting';

-- チェック3: 通知送信失敗
SELECT *
FROM user_notifications
WHERE created_at < NOW() - INTERVAL '1 hour'
  AND is_read = FALSE
  AND type IN ('reservation_confirmed', 'waitlist_available');
```

### 4.3 リカバリー手順

```
[在庫不整合の修復]
1. 該当公演の予約を全取得
2. 実際の participant_count を合計
3. schedule_events.current_participants を更新
4. 差分をログに記録（原因調査）

[孤立キャンセル待ちの処理]
1. 該当レコードを 'expired' に変更
2. 顧客に「公演がキャンセルされました」メール送信

[通知送信失敗のリトライ]
1. user_notifications から未読の重要通知を取得
2. 24時間以内なら再送信
3. 3回失敗したら管理者に通知
```

---

## 5. 実装時の注意事項

### 5.1 UI側での事前チェック（UX向上）

```typescript
// ❌ UI側チェックのみ（信用しない）
if (newCount > availableSeats) {
  toast.error('空席が不足しています')
  return
}

// ✅ UI側チェック + サーバー側検証
// UI: ユーザーに早めにフィードバック
if (newCount > availableSeats) {
  toast.warning('空席が不足している可能性があります。試行します...')
}

// サーバー: RPC関数で厳密に検証
const { error } = await supabase.rpc('update_reservation_participants', {...})
if (error?.message === 'INSUFFICIENT_SEATS') {
  toast.error('申し訳ございません。空席が不足していました。')
}
```

### 5.2 楽観的UI更新の禁止

```typescript
// ❌ 楽観的更新（サーバーの確定前に画面を更新）
setReservations(prev => prev.filter(r => r.id !== cancellingId))
await cancelReservation(cancellingId)

// ✅ 悲観的更新（サーバー確定後に画面を更新）
await cancelReservation(cancellingId)
setReservations(prev => prev.filter(r => r.id !== cancellingId))
```

**理由**: 在庫管理では「表示と実態の乖離」が致命的

### 5.3 同時操作の制御

```typescript
// ✅ 操作中フラグで二重送信を防ぐ
const [isUpdating, setIsUpdating] = useState(false)

const handleUpdate = async () => {
  if (isUpdating) return  // 二重送信防止
  
  setIsUpdating(true)
  try {
    await updateReservation(...)
  } finally {
    setIsUpdating(false)
  }
}
```

---

## 6. テストシナリオ

### 6.1 単体テスト（RPC関数）

```
[予約変更: 増加]
- 正常ケース: 3名 → 5名（空席あり）
- エラーケース: 3名 → 10名（空席不足）
- エッジケース: 3名 → 定員ぴったり

[予約変更: 減少]
- 正常ケース: 5名 → 3名（キャンセル待ちあり）
- 正常ケース: 5名 → 3名（キャンセル待ちなし）
- エラーケース: 3名 → 1名（最低人数未満）

[予約キャンセル]
- 正常ケース: 24時間以上前（無料）
- 正常ケース: 24時間以内（キャンセル料50%）
- エラーケース: 既にキャンセル済み（二重キャンセル）
```

### 6.2 統合テスト（競合制御）

```
[シナリオ: 同時変更]
1. ユーザーA: 予約1を 3名 → 5名 に変更開始
2. ユーザーB: 予約2を 2名 → 4名 に変更開始
3. 残席3席の状態で両方が +2 を要求
4. 期待結果: 片方が成功、片方が INSUFFICIENT_SEATS

[シナリオ: 変更中にキャンセル]
1. ユーザーA: 予約1の人数変更開始（ロック取得）
2. ユーザーB: 予約1のキャンセル試行
3. 期待結果: ユーザーBはロック待ち → ユーザーA完了後に実行

[シナリオ: キャンセル待ち繰り上げの競合]
1. 予約がキャンセルされる（2席開放）
2. キャンセル待ち1（2名希望）が繰り上げ開始
3. 同時に別の予約が入る
4. 期待結果: 片方が成功、片方が INSUFFICIENT_SEATS
```

---

## まとめ: 絶対に守るべき原則

| # | 原則 | 理由 |
|---|------|------|
| 1 | **在庫調整と予約更新はアトミック** | 片方だけ成功すると不整合 |
| 2 | **FOR UPDATE で排他制御** | 同時操作による在庫オーバーを防ぐ |
| 3 | **メール送信は別トランザクション** | メール失敗で在庫が戻らない |
| 4 | **コミット後に通知** | ロールバックで通知だけ送られる |
| 5 | **キャンセル待ち繰り上げは別トランザクション** | デッドロック防止 |
| 6 | **論理削除（DELETE禁止）** | 履歴・統計・監査ログが必要 |
| 7 | **日次整合性チェック** | 早期発見・早期修復 |

これらを守らないと、「在庫が狂う」「ダブルブッキング」「通知が届かない」などの重大事故につながります。

---

## C-6/C-7: 日付フィルタリングの設計問題

**ステータス**: 原因特定完了、設計確定

### 問題の本質

両方とも **「日付範囲指定の設計ミス」** という一つの問題。

| 問題 | 症状 | 根本原因 |
|------|------|----------|
| C-6 | 過去の日付が選択・予約可能 | 過去日付を除外するフィルタがない |
| C-7 | 2月以降が表示されない | 「6ヶ月先まで」の実装が不正確 |

**コードの問題箇所**:

```typescript
// src/pages/ScenarioDetailPage/hooks/useScenarioDetail.ts L60-75
const currentDate = new Date()
for (let i = 0; i < 6; i++) {
  const targetDate = new Date(currentDate)
  targetDate.setMonth(currentDate.getMonth() + i)
  
  // ❌ 各月の1日〜末日を取得（過去も含まれる）
  monthPromises.push(scheduleApi.getByMonth(year, month, orgId))
}

// src/lib/api/scheduleApi.ts L299-324
.gte('date', startDate)  // ❌ 月初〜月末（過去も含む）
.lte('date', endDate)
// ❌ is_cancelled のフィルタなし
// ❌ CURRENT_DATE との比較なし
```

---

## 1. API取得条件で起きがちな設計ミス

### ミス1: 「月の範囲」と「未来の範囲」の混同

```typescript
// ❌ 悪い例: 「1月」を取得 = 1/1〜1/31（過去も含む）
.gte('date', '2026-01-01').lte('date', '2026-01-31')

// ✅ 良い例: 「今日以降の1月」を取得
.gte('date', GREATEST('2026-01-01', CURRENT_DATE))
```

**具体例**（2026-01-23 時点）:
```
現在の月 = 2026年1月
i=0: 2026-01 → 1/1〜1/31 を取得（1/1〜1/22 は過去！）
i=1: 2026-02 → 2/1〜2/28 を取得
```

### ミス2: is_cancelled の考慮漏れ

```typescript
// ❌ 悪い例: キャンセル済みも表示
.from('schedule_events').select('*').gte('date', today)

// ✅ 良い例
.from('schedule_events').select('*').gte('date', today).eq('is_cancelled', false)
```

---

## 2. 日付範囲指定の安全な書き方

### パターンA: 「今日以降の未来N日間」

```typescript
// ✅ フロントエンド実装
const fetchUpcomingEvents = async (daysAhead: number = 180) => {
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + daysAhead)
  const endDateStr = endDate.toISOString().split('T')[0]
  
  const { data } = await supabase
    .from('schedule_events')
    .select('*')
    .gte('date', today)               // ← 今日以降
    .lte('date', endDateStr)          // ← N日後まで
    .eq('is_cancelled', false)        // ← キャンセル除外
    .order('date', { ascending: true })
  
  return data
}

// ✅ SQL（データベース関数）
SELECT *
FROM schedule_events
WHERE organization_id = $1
  AND date >= CURRENT_DATE
  AND date <= CURRENT_DATE + INTERVAL '180 days'
  AND is_cancelled = false
ORDER BY date, start_time;
```

### パターンB: 「特定月の未来部分のみ」

```typescript
// ✅ フロントエンド実装
const fetchMonthEvents = async (year: number, month: number) => {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  
  // 今日と月初の遅い方
  const effectiveStart = monthStart > today ? monthStart : today
  
  const { data } = await supabase
    .from('schedule_events')
    .select('*')
    .gte('date', effectiveStart)      // ← 今日 or 月初（遅い方）
    .lte('date', monthEnd)            // ← 月末
    .eq('is_cancelled', false)
  
  return data
}
```

---

## 3. UIで止めるべきか、APIで止めるべきか

### 防御層の設計（多層防御）

```
[層1: UI]       → DatePicker disabled で過去選択不可（UX向上）
[層2: API層]    → 送信前に日付検証（不正リクエスト削減）
[層3: データベース] → CHECK制約 + RPC関数（最終防衛線）✅
```

### 判断基準

| 条件 | UIで止める | APIで止める | DBで止める |
|------|-----------|------------|----------|
| **UX向上** | ✅ 必須 | ⚪ 推奨 | - |
| **不正リクエスト防止** | ❌ 不十分 | ⚪ 補助 | ✅ 必須 |
| **データ整合性保証** | ❌ 無理 | ❌ 無理 | ✅ 必須 |
| **ブラウザコンソール攻撃耐性** | ❌ なし | ❌ なし | ✅ あり |

**原則**: **データベースで必ず止める、UIは補助的に使う**

### 実装例

```typescript
// 層1: UI
<Calendar
  disabled={(date) => date < new Date()}  // 過去無効
  fromDate={new Date()}
/>

// 層2: API層
if (new Date(eventDate) < new Date()) {
  toast.error('過去の公演は予約できません')
  return
}

// 層3: データベース
CREATE OR REPLACE FUNCTION create_reservation_with_lock(...) AS $$
BEGIN
  SELECT * INTO v_event FROM schedule_events WHERE id = p_event_id FOR UPDATE;
  
  IF v_event.date < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_EVENT';
  END IF;
  
  IF v_event.is_cancelled THEN
    RAISE EXCEPTION 'EVENT_CANCELLED';
  END IF;
  -- ...
END;
$$;
```

---

## 4. 修正実装案

### 修正A: scheduleApi.getByMonth() の改善

```typescript
async getByMonth(
  year: number, 
  month: number, 
  organizationId?: string,
  options?: {
    includePast?: boolean      // デフォルト false
    includeCancelled?: boolean // デフォルト false
  }
) {
  const today = new Date().toISOString().split('T')[0]
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  
  // ✅ 月初と今日の遅い方
  const effectiveStartDate = options?.includePast 
    ? startDate 
    : (startDate > today ? startDate : today)
  
  let query = supabase
    .from('schedule_events')
    .select('...')
    .gte('date', effectiveStartDate)  // ← 過去除外
    .lte('date', endDate)
  
  // ✅ キャンセル除外
  if (!options?.includeCancelled) {
    query = query.eq('is_cancelled', false)
  }
  
  // ...
}
```

### 修正B: データベース制約追加

```sql
-- ✅ 過去日付の予約を禁止
CREATE OR REPLACE FUNCTION check_reservation_future_date()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT date FROM schedule_events WHERE id = NEW.schedule_event_id) < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book past events';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_reservation_future_date
  BEFORE INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_future_date();
```

---

## まとめ: 日付フィルタリングの原則

| # | 原則 | 理由 |
|---|------|------|
| 1 | **データベースで過去を防ぐ** | ブラウザ攻撃に耐える |
| 2 | **CURRENT_DATE を基準にする** | サーバータイムゾーンで統一 |
| 3 | **is_cancelled を必ず確認** | キャンセル済みは予約不可 |
| 4 | **UIは補助的に使う** | UX向上のため |
| 5 | **月の範囲 ≠ 未来の範囲** | 混同しない |
| 6 | **管理画面と顧客画面で分ける** | includePast オプション |

---

## C-8/C-9/C-10/C-11: 認証フロー統合設計

**ステータス**: 設計完了、実装待ち

### 問題の本質

これらは全て **「認証状態の管理」と「フロー中断からの復帰」** という一つの設計問題として扱うべき。

| 問題番号 | 症状 | 根本原因 |
|---------|------|----------|
| C-8 | パスワードリセット失敗 | Supabase Auth設定 or リダイレクトURL不正 |
| C-9 | X/Discordログイン動作しない | OAuth Provider未設定 or Callback URL不正 |
| C-10 | メール確認なしでログイン可能 | `Confirm email` が無効化されている |
| C-11 | ログイン後に予約フローに戻れない | 復帰先の保存・復元ロジックなし |

**共通の問題**: 認証フローの各ステートが明確に定義されておらず、中断→復帰の設計がない

---

## 1. 認証状態のステート定義

### 1.1 ユーザーのライフサイクル

```
[未登録]
  ↓ サインアップ
[仮登録]（email_confirmed = false）
  ↓ メール確認リンククリック
[確認済み]（email_confirmed = true）
  ↓ プロフィール入力
[アクティブ]（customers レコード作成済み）
  ↓ 予約
[利用中]
```

### 1.2 Supabase Auth のステート

| ステート | auth.users | email_confirmed | users テーブル | customers テーブル |
|----------|-----------|-----------------|---------------|------------------|
| **未登録** | なし | - | なし | なし |
| **仮登録** | あり | `false` | あり（role='customer'） | なし |
| **確認済み** | あり | `true` | あり | なし |
| **アクティブ** | あり | `true` | あり | あり |

### 1.3 ステート遷移図

```
[未登録]
  ↓
  サインアップ（メール/パスワード）
  ↓
[仮登録] ← auth.users.email_confirmed = false
  ↓ ← メールリンククリック
  ↓ ← または OAuth（Google等）で自動確認
  ↓
[確認済み] ← auth.users.email_confirmed = true
  ↓ ← プロフィール入力 or 初回予約時
  ↓ ← customers テーブル INSERT
  ↓
[アクティブ] ← customers レコード存在
```

### 1.4 各ステートでできること

| ステート | できること | できないこと | リダイレクト先 |
|----------|-----------|-------------|--------------|
| 未登録 | 公演閲覧、問い合わせ | 予約、お気に入り | - |
| 仮登録 | 公演閲覧 | 予約、マイページ | `/confirm-email`（確認待ち画面）|
| 確認済み | 公演閲覧、予約開始 | マイページ（customers未作成）| - |
| アクティブ | すべて | - | - |

---

## 2. 予約フロー中断→復帰の正しい設計

### 2.1 中断が発生するタイミング

```
[予約フロー]
1. 公演一覧 → 詳細ページ → 日程選択
2. 人数選択 → 予約者情報入力
3. ← ここで「ログインが必要です」
4. ログイン/サインアップページへ遷移
5. 認証完了
6. ← ここで復帰先が不明
```

### 2.2 保存すべき情報

| 情報 | 保存場所 | 理由 |
|------|---------|------|
| **復帰先URL** | sessionStorage | タブを閉じたら破棄（セキュリティ） |
| **選択中の公演ID** | sessionStorage | 同上 |
| **選択中の人数** | sessionStorage | 同上 |
| **入力済みのフォームデータ** | sessionStorage | 同上（個人情報は保存しない）|
| **キャンセル待ち登録フラグ** | sessionStorage | 満席時の登録復帰 |

**なぜ localStorage ではないか**:
- タブを閉じたら破棄すべき（一時的な状態）
- 複数タブで異なる予約をしている可能性
- 個人情報の長期保存を避ける

### 2.3 復帰フローの実装パターン

```typescript
// ========================================
// パターンA: 復帰先URLを保存（推奨）
// ========================================

// [予約確認画面] 未ログインユーザーが予約ボタンをクリック
const handleBookingClick = () => {
  if (!user) {
    // 現在のURLと予約情報を保存
    sessionStorage.setItem('return_to', window.location.pathname)
    sessionStorage.setItem('booking_context', JSON.stringify({
      eventId,
      participantCount,
      scenarioTitle,
      eventDate,
      startTime
    }))
    
    // ログインページへ
    navigate('/login?returnTo=' + encodeURIComponent(window.location.pathname))
    return
  }
  
  // ログイン済みなら通常処理
  proceedToBooking()
}

// [ログインページ] 認証完了後
const handleLoginSuccess = async () => {
  // URL パラメータから復帰先を取得
  const params = new URLSearchParams(window.location.search)
  const returnTo = params.get('returnTo')
  
  // または sessionStorage から取得
  const savedReturnTo = sessionStorage.getItem('return_to')
  const bookingContext = sessionStorage.getItem('booking_context')
  
  if (returnTo || savedReturnTo) {
    // 復帰先に遷移
    navigate(returnTo || savedReturnTo)
    
    // 予約情報があれば復元（次の画面で使用）
    if (bookingContext) {
      // グローバル state または Context に設定
      setBookingContext(JSON.parse(bookingContext))
    }
    
    // クリーンアップ
    sessionStorage.removeItem('return_to')
    sessionStorage.removeItem('booking_context')
  } else {
    // 復帰先がなければマイページへ
    navigate('/mypage')
  }
}

// ========================================
// パターンB: 状態をURLパラメータに埋め込む
// ========================================

// [予約確認画面]
const handleBookingClick = () => {
  if (!user) {
    navigate('/login', {
      state: {
        from: location.pathname,
        bookingData: {
          eventId,
          participantCount
        }
      }
    })
    return
  }
  // ...
}

// [ログインページ]
const location = useLocation()
const handleLoginSuccess = () => {
  const { from, bookingData } = location.state || {}
  
  if (from && bookingData) {
    navigate(from, { state: { bookingData } })
  } else {
    navigate('/mypage')
  }
}
```

### 2.4 復帰時のデータ検証

```typescript
// [予約確認画面] 復帰後の処理
useEffect(() => {
  // sessionStorage から復元
  const bookingContext = sessionStorage.getItem('booking_context')
  
  if (bookingContext && user) {
    try {
      const data = JSON.parse(bookingContext)
      
      // ✅ データの検証（古いデータかもしれない）
      if (Date.now() - data.timestamp > 30 * 60 * 1000) {
        // 30分以上前のデータは破棄
        sessionStorage.removeItem('booking_context')
        toast.warning('セッションが期限切れです。再度選択してください。')
        return
      }
      
      // ✅ 公演がまだ有効か確認
      const { data: event } = await supabase
        .from('schedule_events')
        .select('id, date, available_seats')
        .eq('id', data.eventId)
        .single()
      
      if (!event) {
        toast.error('選択した公演が見つかりません')
        sessionStorage.removeItem('booking_context')
        return
      }
      
      if (event.available_seats < data.participantCount) {
        toast.warning('空席が不足しています。人数を調整してください。')
      }
      
      // ✅ フォームに復元
      setEventId(data.eventId)
      setParticipantCount(Math.min(data.participantCount, event.available_seats))
      
      // クリーンアップ
      sessionStorage.removeItem('booking_context')
      
    } catch (error) {
      logger.error('予約情報の復元エラー:', error)
      sessionStorage.removeItem('booking_context')
    }
  }
}, [user])
```

### 2.5 「この順で処理しないと壊れる」ポイント

| # | ❌ 問題のある順序 | ✅ 正しい順序 | なぜ壊れるか |
|---|------------------|--------------|-------------|
| 1 | 先にクリア → 復帰処理 | 復帰処理 → クリア | データが消えて復帰できない |
| 2 | localStorage に個人情報保存 | sessionStorage に限定 | XSS でデータ漏洩 |
| 3 | 復帰時にデータ検証なし | タイムスタンプ・在庫確認 | 古いデータで予約失敗 |
| 4 | 認証完了後にすぐリダイレクト | customer レコード作成確認 | customers 未作成で予約エラー |

---

## 3. Supabase Auth で実現する場合の注意点

### 3.1 メール確認設定（C-10対応）
**対応方針**:
- Supabase Authの`Confirm email`を有効化
- `Allow duplicate emails`を無効化
- アプリ側でも未確認ユーザーのログインを拒否（追加対応）

**実施内容（アプリ側）**:
- `AuthContext.signIn` で `email_confirmed_at` 未設定の場合にログイン拒否

**手順（Supabase Dashboard）**:
1. Supabase Dashboard → Authentication → Providers → Email
2. `Confirm email` を **ON**
3. `Allow duplicate emails` を **OFF**


```
[Supabase Dashboard]
Authentication → Settings → Email Auth

✅ Enable email confirmations: ON（必須）
✅ Confirm email: ON（必須）
✅ Double confirm email changes: ON（推奨）

Redirect URLs:
  - https://mmq-yoyaq.vercel.app/auth/callback
  - http://localhost:5173/auth/callback（開発用）
```

**設定後の挙動**:
```
1. サインアップ → auth.users.email_confirmed = false
2. 確認メール送信 → リンククリック
3. Redirect URL へ遷移 + トークン付き
4. auth.users.email_confirmed = true に更新
```

**フロントエンド実装**:
```typescript
// [コールバックページ] /auth/callback
useEffect(() => {
  const handleAuthCallback = async () => {
    // URLからトークンを取得
    const { data, error } = await supabase.auth.getSession()
    
    if (error) {
      toast.error('メール確認に失敗しました')
      navigate('/login')
      return
    }
    
    if (data.session) {
      // ✅ email_confirmed を確認
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email_confirmed_at) {
        toast.warning('メール確認が完了していません')
        navigate('/confirm-email')
        return
      }
      
      // ✅ customers レコードを作成（初回のみ）
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (!customer) {
        // プロフィール入力ページへ
        navigate('/onboarding')
      } else {
        // 復帰先へ
        const returnTo = sessionStorage.getItem('return_to') || '/mypage'
        navigate(returnTo)
      }
    }
  }
  
  handleAuthCallback()
}, [])
```

### 3.2 OAuth プロバイダ設定（C-9対応）

```
[Supabase Dashboard]
Authentication → Providers

Google:
  ✅ Enabled
  Client ID: [Google Console から取得]
  Client Secret: [Google Console から取得]
  
Twitter (X):
  ✅ Enabled（設定必要）
  API Key: [X Developer Portal から取得]
  API Secret Key: [同上]
  Callback URL: https://{project}.supabase.co/auth/v1/callback
  
Discord:
  ✅ Enabled（設定必要）
  Client ID: [Discord Developer Portal から取得]
  Client Secret: [同上]
  Redirect URI: https://{project}.supabase.co/auth/v1/callback
```

**OAuth プロバイダ側の設定（X の場合）**:
```
[X Developer Portal]
1. App 作成
2. OAuth 2.0 Settings
   - Callback URL: https://{project}.supabase.co/auth/v1/callback
   - Website URL: https://mmq-yoyaq.vercel.app
3. Permissions: Read email, Read users
```

**フロントエンド実装**:
```typescript
// [ログインページ]
const handleSocialLogin = async (provider: 'google' | 'twitter' | 'discord') => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + '/auth/callback',
      queryParams: {
        // 復帰先を埋め込む
        return_to: sessionStorage.getItem('return_to') || '/mypage'
      }
    }
  })
  
  if (error) {
    logger.error(`${provider} ログインエラー:`, error)
    
    // ユーザーフレンドリーなエラーメッセージ
    if (error.message.includes('Provider not enabled')) {
      toast.error(`${provider} ログインは現在利用できません`)
    } else if (error.message.includes('User cancelled')) {
      // ユーザーがキャンセルした場合は通知不要
    } else {
      toast.error('ログインに失敗しました')
    }
  }
}
```

### 3.3 パスワードリセット設定（C-8対応）

```
[Supabase Dashboard]
Authentication → Email Templates → Reset Password

Subject: パスワードリセット
Body: 以下のリンクからパスワードを再設定してください
Link: {{ .ConfirmationURL }}

Redirect URL: https://mmq-yoyaq.vercel.app/reset-password
```

**フロントエンド実装**:
```typescript
// [パスワード忘れページ] /forgot-password
const handlePasswordReset = async () => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password'
  })
  
  if (error) {
    toast.error('パスワードリセットメールの送信に失敗しました')
    return
  }
  
  toast.success('パスワードリセットメールを送信しました')
}

// [パスワードリセットページ] /reset-password
useEffect(() => {
  const handleResetPassword = async () => {
    // URLからトークンを取得
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const type = hashParams.get('type')
    
    if (type !== 'recovery') {
      toast.error('無効なリンクです')
      navigate('/login')
      return
    }
    
    // セッションを設定
    const { error } = await supabase.auth.setSession({
      access_token: accessToken!,
      refresh_token: hashParams.get('refresh_token')!
    })
    
    if (error) {
      toast.error('セッションの設定に失敗しました')
      navigate('/login')
      return
    }
    
    // パスワード変更フォームを表示
    setShowPasswordForm(true)
  }
  
  handleResetPassword()
}, [])

const handleUpdatePassword = async () => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })
  
  if (error) {
    // ✅ エラーメッセージを日本語化
    if (error.message.includes('same as the old password')) {
      toast.error('新しいパスワードは以前のものと異なるものを設定してください')
    } else if (error.message.includes('Password should be at least')) {
      toast.error('パスワードは8文字以上で設定してください')
    } else {
      toast.error('パスワードの更新に失敗しました')
    }
    return
  }
  
  toast.success('パスワードを更新しました')
  navigate('/login')
}
```

### 3.4 セッション管理とリフレッシュ

```typescript
// [AuthContext] セッションの自動更新
useEffect(() => {
  // セッションの変化を監視
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      logger.log('Auth event:', event)
      
      if (event === 'SIGNED_IN') {
        // ログイン成功
        setUser(session?.user ?? null)
        
        // customers レコード確認
        if (session?.user) {
          await ensureCustomerRecord(session.user)
        }
      }
      
      if (event === 'SIGNED_OUT') {
        // ログアウト
        setUser(null)
        sessionStorage.clear()
      }
      
      if (event === 'TOKEN_REFRESHED') {
        // トークン更新
        logger.log('Session refreshed')
      }
      
      if (event === 'USER_UPDATED') {
        // ユーザー情報更新（パスワード変更等）
        setUser(session?.user ?? null)
      }
    }
  )
  
  return () => {
    subscription.unsubscribe()
  }
}, [])

// customers レコードの自動作成
const ensureCustomerRecord = async (user: User) => {
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  if (!customer && user.email_confirmed_at) {
    // メール確認済みなら customers レコード作成
    const orgId = await getCurrentOrganizationId()
    
    await supabase.from('customers').insert({
      user_id: user.id,
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'ゲスト',
      email: user.email!,
      organization_id: orgId
    })
    
    logger.log('Customer record created for:', user.id)
  }
}
```

### 3.5 認証状態のルートガード

```typescript
// [ProtectedRoute] 認証が必要なページ
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  
  if (loading) {
    return <LoadingSpinner />
  }
  
  if (!user) {
    // ログインページへリダイレクト（現在のパスを保存）
    sessionStorage.setItem('return_to', location.pathname)
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  
  // ✅ メール確認チェック
  if (!user.email_confirmed_at) {
    return <Navigate to="/confirm-email" replace />
  }
  
  // ✅ customers レコード確認
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single()
  
  if (!customer) {
    // プロフィール入力が必要
    return <Navigate to="/onboarding" replace />
  }
  
  return <>{children}</>
}

// [使用例]
<Route path="/mypage" element={
  <ProtectedRoute>
    <MyPage />
  </ProtectedRoute>
} />
```

---

## 4. エラーハンドリングと UX 改善

### 4.1 エラーメッセージの日本語化

```typescript
const getAuthErrorMessage = (error: AuthError): string => {
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
    'Email not confirmed': 'メールアドレスが確認されていません',
    'User already registered': 'このメールアドレスは既に登録されています',
    'Password should be at least 6 characters': 'パスワードは6文字以上で設定してください',
    'same as the old password': '新しいパスワードは以前のものと異なるものを設定してください',
    'Provider not enabled': 'このログイン方法は現在利用できません',
    'Email rate limit exceeded': 'メール送信の上限に達しました。しばらく待ってから再度お試しください',
  }
  
  for (const [key, message] of Object.entries(errorMap)) {
    if (error.message.includes(key)) {
      return message
    }
  }
  
  return 'エラーが発生しました。しばらく待ってから再度お試しください。'
}
```

### 4.2 ローディング状態の管理

```typescript
const [authState, setAuthState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

const handleLogin = async () => {
  setAuthState('loading')
  
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) throw error
    
    setAuthState('success')
    
    // 復帰処理
    await handlePostLogin()
    
  } catch (error) {
    setAuthState('error')
    toast.error(getAuthErrorMessage(error as AuthError))
  }
}

// UI での表示
<Button 
  disabled={authState === 'loading'}
  onClick={handleLogin}
>
  {authState === 'loading' ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ログイン中...
    </>
  ) : (
    'ログイン'
  )}
</Button>
```

### 4.3 リトライロジック

```typescript
const signInWithRetry = async (
  email: string, 
  password: string, 
  maxRetries = 3
): Promise<{ data: any; error: AuthError | null }> => {
  let lastError: AuthError | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (!error) {
      return { data, error: null }
    }
    
    lastError = error
    
    // リトライ可能なエラーか判定
    if (
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.status === 500
    ) {
      logger.warn(`ログイン試行 ${attempt}/${maxRetries} 失敗:`, error.message)
      
      // 指数バックオフ
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    } else {
      // リトライ不可能なエラー（認証情報間違い等）
      break
    }
  }
  
  return { data: null, error: lastError }
}
```

---

## 5. テストシナリオ

### 5.1 認証フローのテスト

```typescript
// E2E テスト
describe('認証フロー', () => {
  test('新規登録 → メール確認 → ログイン', async () => {
    // サインアップ
    await page.goto('/signup')
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    
    // メール確認待ち画面
    await expect(page).toHaveURL('/confirm-email')
    await expect(page.locator('text=確認メールを送信しました')).toBeVisible()
    
    // メール確認リンクをシミュレート
    const confirmToken = await getConfirmTokenFromDB('test@example.com')
    await page.goto(`/auth/callback?token=${confirmToken}&type=signup`)
    
    // プロフィール入力へ
    await expect(page).toHaveURL('/onboarding')
  })
  
  test('予約中にログイン → 復帰', async () => {
    // 公演詳細ページ
    await page.goto('/scenario/test-scenario')
    await page.click('button:has-text("予約する")')
    
    // 人数選択
    await page.selectOption('[name="participantCount"]', '3')
    await page.click('button:has-text("予約情報入力へ")')
    
    // ログインが必要
    await expect(page).toHaveURL(/\/login/)
    
    // ログイン
    await page.fill('[name="email"]', 'user@example.com')
    await page.fill('[name="password"]', 'password')
    await page.click('button[type="submit"]')
    
    // 元のページに復帰
    await expect(page).toHaveURL(/\/booking\//)
    await expect(page.locator('[name="participantCount"]')).toHaveValue('3')
  })
})
```

---

## まとめ: 認証設計の原則

| # | 原則 | 理由 |
|---|------|------|
| 1 | **メール確認を必須化** | アカウント乗っ取り防止 |
| 2 | **復帰先は sessionStorage** | タブ単位、個人情報保護 |
| 3 | **復帰時にデータ検証** | 古いデータで予約失敗を防ぐ |
| 4 | **customers レコード作成確認** | 予約前に必須データを確保 |
| 5 | **エラーメッセージ日本語化** | UX向上 |
| 6 | **OAuth は完全設定してから表示** | 信用失墜防止 |
| 7 | **認証状態の監視** | セッション切れに対応 |

---

## C-12: 特定シナリオ「02てすとぴょん」の表示エラー

**ステータス**: 調査待ち

### 問題
- PC Chromeでクリック時に詳細ページ表示できない
- SPでは問題なし

### 調査項目
- [ ] 該当シナリオのデータ確認
- [ ] ブラウザコンソールのエラーログ
- [ ] ルーティング・パス解決の問題

---

## C-13: PC Chromeで予約完了情報が表示されない

**ステータス**: 調査待ち

### 問題
- 予約番号・サマリーが表示されない（SPでは表示）

### 調査項目
- [ ] ブラウザ依存のCSS問題
- [ ] JavaScriptエラー（コンソール確認）
- [ ] 予約完了画面のレスポンシブ対応

---

## C-14: 重複予約の警告設計

**ステータス**: 原因特定完了、設計確定

### 問題の本質

既存のコードに `checkDuplicateReservation()` 関数が存在するが、以下の問題で機能していない：

```typescript
// src/pages/BookingConfirmation/hooks/useBookingSubmit.ts L71-183
export const checkDuplicateReservation = async (
  eventId: string,
  customerEmail: string,
  customerPhone?: string,
  eventDate?: string,  // ← オプション（必須にすべき）
  startTime?: string   // ← オプション（必須にすべき）
) => {
  // ...
  // L122-176: 同じ日時の別公演への予約をチェック
  if (eventDate && startTime) {  // ← eventDateとstartTimeが渡されていない可能性
    // 時間帯重複を計算
    const isOverlapping = targetStartTime < resEndTime && targetEndTime > resStartTime
    
    if (isOverlapping) {
      return { hasDuplicate: true, isTimeConflict: true }
    }
  }
}
```

**問題点**:
1. `eventDate` と `startTime` が optional なので、呼び出し側で渡していない可能性
2. 重複が見つかっても「警告」なのか「ブロック」なのか不明確
3. ユーザーが確認すれば予約可能にすべきか、完全ブロックすべきか未定義

---

### 1. どこで止めるのが正解か

#### 防御層の設計

```
[層1: UI - 予約確認画面]
  → 重複予約を検知したら警告ダイアログ表示
  → 「それでも予約する」ボタンで続行可能
  
[層2: API層 - checkDuplicateReservation]
  → 時間帯重複を検出
  → { hasDuplicate: true, isTimeConflict: true } を返す
  → ユーザーの意思確認を待つ（強制ブロックしない）
  
[層3: データベース - RPC関数]
  → 同一公演への重複は完全ブロック（UNIQUE制約相当）
  → 時間帯重複は記録のみ（後で分析可能）
```

#### 各層の役割

| 層 | 役割 | 同一公演重複 | 時間帯重複 |
|---|------|-------------|-----------|
| **UI** | ユーザー体験 | ❌ ブロック | ⚠️ 警告（確認すれば可）|
| **API層** | 重複検知 | ❌ 返却（ブロック）| ⚠️ 返却（警告フラグ）|
| **DB** | データ整合性 | ❌ UNIQUE制約 | ⚪ 記録（分析用）|

---

### 2. 警告と強制ブロックの境界

#### パターンA: 同一公演への重複（完全ブロック）

```typescript
// ❌ 絶対に許可しない
const result = await checkDuplicateReservation(eventId, email)

if (result.hasDuplicate && !result.isTimeConflict) {
  // 同一公演への重複 = 完全ブロック
  toast.error('この公演はすでに予約済みです。人数を変更したい場合はマイページから編集してください。')
  return // 予約処理を中断
}
```

**理由**:
- 同じ公演に2回予約する理由がない
- データ不整合・売上計算ミスにつながる
- マイページで人数変更できる

#### パターンB: 時間帯重複（警告 + 確認）

```typescript
// ⚠️ 警告を出すが、確認すれば許可
if (result.hasDuplicate && result.isTimeConflict) {
  // 時間帯重複 = 警告ダイアログ
  const confirmed = await showConfirmDialog({
    title: '重複予約の確認',
    message: `
      ${formatDateTime(result.existingReservation.requested_datetime)} に
      別の予約が既に入っています。
      
      物理的に両方の公演に参加することはできません。
      それでも予約を続けますか？
    `,
    confirmText: '予約する',
    cancelText: 'キャンセル',
    type: 'warning'
  })
  
  if (!confirmed) {
    return // 予約処理を中断
  }
  
  // ユーザーが確認したので続行
  // → reservations.has_time_conflict = true でフラグ保存
}
```

**理由**:
- 正当なユースケースが存在する
- 強制ブロックすると顧客が困る

#### 正当なユースケース（時間帯重複を許可すべき理由）

| ケース | 説明 | 頻度 |
|--------|------|------|
| **代理予約** | 友人Aが友人Bの予約を代行（同じメールアドレス使用）| 高 |
| **グループ分散** | 大人数で複数公演に分かれて参加 | 中 |
| **キャンセル予定** | 片方をキャンセルする予定だが、両方押さえておきたい | 中 |
| **店舗間移動** | 18:00〜20:00 店舗A → 20:30〜22:30 店舗B（物理的に可能）| 低 |
| **予約変更中** | 旧予約をキャンセルする前に新予約を確保 | 低 |

**これらを完全ブロックすると電話問い合わせが爆発する**

---

### 3. 現場オペレーション視点での最適解

#### 現場の声（想定）

**店舗スタッフの視点**:

```
【厳しすぎる場合】
- 顧客: 「システムで予約できないんですけど！」
- 店舗: 「代理予約ですね。電話で承ります」
→ 電話対応が増える、スタッフ負荷↑

【緩すぎる場合】
- 顧客: 両方予約 → 片方 No Show
- 店舗: 空席が埋まらず損失
→ 売上減、リソース無駄

【ちょうどいい】
- 顧客: 重複を警告される → 理由を考える → 確認して予約
- 店舗: No Show は減る、電話対応も減る
→ バランスが取れる
```

**顧客の視点**:

```
【完全ブロック】
- 「代理予約できないじゃん！」
- 「システム使いづらい」
→ 離脱、電話予約へ

【警告なし】
- 「あれ？ダブルブッキングしちゃった」
- 「当日どっちか忘れそう」
→ No Show リスク

【警告 + 確認】
- 「あ、重複してる。でも代理だから大丈夫」
- 「確認ボタンで進める」
→ ストレスフリー
```

#### 最適解：3段階の防御

```
[段階1: リアルタイム警告（予約確認画面）]
  → 人数選択・日程選択時に「他の予約があります」と表示
  → 予約を中断せずに情報提供のみ

[段階2: 確認ダイアログ（予約確定前）]
  → 「予約する」ボタンクリック時に警告ダイアログ
  → 「それでも予約する」で続行可能
  → デフォルトは「キャンセル」（誤操作防止）

[段階3: 予約完了メール]
  → 「重複予約にご注意ください」の文言追加
  → マイページのリンク（変更・キャンセル可能）
```

---

### 4. 実装設計

#### 修正A: checkDuplicateReservation を必須パラメータに

```typescript
// src/pages/BookingConfirmation/hooks/useBookingSubmit.ts
export const checkDuplicateReservation = async (
  eventId: string,
  customerEmail: string,
  eventDate: string,      // ✅ 必須に変更
  startTime: string,      // ✅ 必須に変更
  customerPhone?: string  // ← これはオプションでOK
): Promise<{
  hasDuplicate: boolean
  existingReservation?: any
  conflictType?: 'same_event' | 'time_overlap'  // ✅ 重複タイプを明示
}> => {
  // ... 実装は既存コードをベースに修正
}
```

#### 修正B: UI層での確認ダイアログ

```typescript
// src/pages/BookingConfirmation/index.tsx
const handleBookingSubmit = async () => {
  // 重複チェック
  const duplicateResult = await checkDuplicateReservation(
    eventId,
    customerEmail,
    eventDate,      // ✅ 必須
    startTime       // ✅ 必須
  )
  
  if (duplicateResult.hasDuplicate) {
    if (duplicateResult.conflictType === 'same_event') {
      // 同一公演 = 完全ブロック
      toast.error('この公演はすでに予約済みです。マイページから編集してください。')
      return
    }
    
    if (duplicateResult.conflictType === 'time_overlap') {
      // 時間帯重複 = ユーザー確認済みなら続行
      if (!userConfirmedDuplicate) {
        setShowDuplicateDialog(true)
        return
      }
    }
  }
  
  // 予約処理を続行
  await createReservation({
    ...bookingData,
    has_time_conflict: duplicateResult.conflictType === 'time_overlap'  // ✅ フラグ保存
  })
}
```

#### 修正C: データベーススキーマ追加

```sql
-- ✅ reservations テーブルに時間帯重複フラグを追加
ALTER TABLE reservations 
ADD COLUMN has_time_conflict BOOLEAN DEFAULT FALSE;

-- インデックス追加（分析用）
CREATE INDEX idx_reservations_time_conflict 
ON reservations(has_time_conflict) 
WHERE has_time_conflict = TRUE;

-- 分析クエリ（No Show との相関を確認）
SELECT 
  has_time_conflict,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'no_show') as no_show_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'no_show') / COUNT(*),
    2
  ) as no_show_rate
FROM reservations
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY has_time_conflict, status;
```

---

### 5. 判断基準まとめ

#### 同一公演への重複

| 観点 | 判断 |
|------|------|
| **許可すべきか** | ❌ 不可 |
| **理由** | データ不整合、売上計算ミス |
| **代替手段** | マイページで人数変更 |
| **実装** | 完全ブロック + 誘導メッセージ |

#### 時間帯重複

| 観点 | 判断 |
|------|------|
| **許可すべきか** | ⚠️ 警告後に許可 |
| **理由** | 代理予約・グループ分散等の正当なユースケース |
| **リスク** | No Show 増加の可能性 |
| **実装** | 警告ダイアログ + 確認後続行 + フラグ保存 |

#### 運用での検証

```sql
-- 月次レポート: 時間帯重複予約の No Show 率
SELECT 
  TO_CHAR(created_at, 'YYYY-MM') as month,
  has_time_conflict,
  COUNT(*) as total_reservations,
  COUNT(*) FILTER (WHERE status = 'no_show') as no_show_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'no_show') / COUNT(*),
    2
  ) as no_show_rate
FROM reservations
WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY month, has_time_conflict
ORDER BY month DESC, has_time_conflict;
```

**もし No Show 率が異常に高ければ**:
- 警告文言を強化
- キャンセルポリシーの見直し
- 電話確認を追加（時間帯重複の場合のみ）

---

### まとめ: 重複予約の原則

| # | 原則 | 理由 |
|---|------|------|
| 1 | **同一公演は完全ブロック** | データ整合性 |
| 2 | **時間帯重複は警告 + 確認** | 正当なユースケース存在 |
| 3 | **ユーザーの意思を尊重** | 強制ブロックは電話対応増 |
| 4 | **フラグを保存して分析** | 運用改善のデータ収集 |
| 5 | **確認メールで再通知** | 当日の No Show 防止 |
| 6 | **マイページで変更誘導** | セルフサービス促進 |

---

## 次のアクション

1. **C-1修正完了**（2026-01-23）
2. **C-10** メール確認なし + 重複登録可（Supabase設定の反映待ち）
3. **C-6** 過去の日付が選択・予約できる（Tier0）
4. **C-2** キャンセル待ちでRLSエラー（Tier0）

---

*このドキュメントは随時更新されます。*

