# セキュリティISSUE修正計画（2026-01-30）

**作成日**: 2026-01-30  
**元ISSUE**: `docs/SECURITY_PRE_RELEASE_ISSUE_2026-01-30.md`  
**目的**: P0→P1→P2の順で修正を実施し、本番リリース前に全脆弱性を潰す

---

## 現状ステータス（2026-01-30 時点）

### P0（リリースブロッカー）

- **✅ 完了**
  - **SEC-P0-01**: `reservations` 顧客UPDATE権限の厳格化（重要列の直接変更をブロック）
  - **SEC-P0-03**: `notify-waitlist` の `bookingUrl` をサーバー側生成に変更（入力値無視）
  - **SEC-P0-05**: 人数変更の二重UPDATE削除（RPC経由に統一）
  - **SEC-P0-06**: 日程変更をRPC化（在庫をアトミックに調整）

- **⏸️ 未完（要確認/要対応）**
  - **SEC-P0-02**: `create_reservation_with_lock` の **本番DB上の実シグネチャ確定**が前提（022 vs 005/006混在問題）
  - **SEC-P0-04**: 貸切承認フローのアトミック化（RPCは作成済み、フロント適用はPhase 2）

### 根本原因（再発の仕組み）

同じP0が“別ルートで再発”するのは、個別の穴埋め（実装）だけで、以下の構造問題が未解決なため。

- **ルール不在**（予約関連はRPC経由などが明文化されていない）
- **強制力不在**（型/Lint/CIで危険経路を止められない）
- **検出不在**（RLS/権限/在庫のセキュリティ回帰テストがない）
- **移行不整合**（`database/migrations` と `supabase/migrations` の二重管理で“どれが本番か”が曖昧）

詳細: `docs/SECURITY_ROOT_CAUSE_ANALYSIS_2026-01-30.md`

---

## 修正の大原則

1. **DB層で物理的に防ぐ**（フロントは補助）
2. **アトミック性の保証**（部分成功を許さない）
3. **fail-closed**（エラー時は安全側に倒す）
4. **全経路を疑う**（API/フロント/管理画面/Edge Function）
5. **監査証跡を残す**（誰が/いつ/何をしたか）

---

## Phase 1: P0修正（リリースブロッカー）

### 🚨 SEC-P0-01: `reservations` の顧客UPDATE許可を厳格化

#### 現在の問題
```sql
-- database/migrations/025_allow_customer_reservation_update.sql
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
-- ↑ 列制限なし = status, participant_count, schedule_event_id, 価格すべて変更可能
```

#### 修正方針

**オプションA（推奨）: 顧客の直接UPDATE完全禁止**

```sql
-- 新マイグレーション: 026_restrict_customer_reservation_update.sql

-- 顧客用のUPDATEポリシーを削除
DROP POLICY IF EXISTS reservations_update_customer ON reservations;

-- 顧客は備考のみ更新可能（他は全てRPC経由）
CREATE POLICY reservations_update_customer_notes_only ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    -- 更新可能な列を限定（以下以外は変更不可）
    AND (OLD.status = NEW.status)
    AND (OLD.participant_count = NEW.participant_count)
    AND (OLD.schedule_event_id IS NOT DISTINCT FROM NEW.schedule_event_id)
    AND (OLD.total_price = NEW.total_price)
    AND (OLD.final_price = NEW.final_price)
    AND (OLD.base_price = NEW.base_price)
    -- customer_notes のみ変更可能
  );

COMMENT ON POLICY reservations_update_customer_notes_only ON reservations IS 
'顧客は自分の予約の備考（customer_notes）のみ更新可能。status/人数/金額/日程はRPC経由のみ';
```

#### 影響範囲の確認

```typescript
// src/ 配下で reservations を直接 UPDATE している箇所を全て確認
// grep 結果から、以下が該当:
// - src/pages/MyPage/pages/ReservationsPage.tsx (L535-543: 料金更新)
// - src/lib/reservationApi.ts (L335-348: 直接UPDATE)
// - src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts (L97-106)
// - src/hooks/useEventOperations.ts (L885-895)
```

これら全てを**RPC経由に置き換え**または**スタッフ権限のみ**に制限する必要がある。

#### 実装タスク

1. **マイグレーション作成**
   - `026_restrict_customer_reservation_update.sql`
   - 上記のポリシー修正
   
2. **フロント修正**: 以下のファイルで直接UPDATEを削除/RPC化
   - `src/pages/MyPage/pages/ReservationsPage.tsx`
     - L535-543の料金更新 → `updateParticipantsWithLock` RPC内で処理（既にRPC呼んでいるので統合）
   - `src/lib/reservationApi.ts`
     - L335-348の `updateParticipantCount` → 既に `updateParticipantsWithLock` を呼んでいるので、その後の直接UPDATEを削除
   - `src/hooks/useEventOperations.ts`
     - L885-895の貸切予約更新 → スタッフ操作なので影響なし（organization_id フィルタ確認）

3. **テスト**
   - 顧客が人数変更できることを確認（RPC経由）
   - 顧客が status を直接変更できないことを確認
   - 顧客が schedule_event_id を変更できないことを確認

#### 工数見積もり
- マイグレーション: 0.5h
- フロント修正: 1h
- テスト: 1h
- **合計**: 2.5h

---

### 🚨 SEC-P0-02: 料金・日時の入力検証をDB側で強化

#### 現在の問題

```typescript
// src/lib/reservationApi.ts: L190-214
// クライアント側で料金計算・日時設定を行い、そのままRPCに送信
const reservationNumber = `${dateStr}-${randomStr}`
await supabase.rpc('create_reservation_with_lock', {
  p_total_price: reservation.total_price,  // ← クライアント計算
  p_unit_price: reservation.unit_price,    // ← クライアント計算
  p_requested_datetime: reservation.requested_datetime  // ← クライアント指定
})
```

#### 修正方針

**(1) まず本番DBの実シグネチャを確定**し、**(2) “料金/日時はサーバーが決める”**に統一する。

#### ステップ0: 本番DBで「実際に存在する関数定義」を確定（必須）

Supabase SQL Editor で実行:

```sql
-- create_reservation_with_lock の引数名を確認（最優先）
SELECT
  p.proname,
  p.oid::regprocedure AS signature,
  array_to_string(p.proargnames, ', ') AS arg_names
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_reservation_with_lock'
ORDER BY p.oid;
```

判定:
- **022型（価格/日時なし）が有効**: フロント側は“価格/日時パラメータ送信”を即時撤去（予約作成が壊れている可能性が高い）
- **005/006型（価格/日時あり）が有効**: **料金改ざんが成立**し得るため、RPC内でサーバー再計算へ即修正

#### ステップ1: 互換性を壊さず統一する設計（推奨）

「既存フロントを壊さない」ため、いきなり破壊的変更をせず **“新関数”を追加→段階移行→旧関数を廃止** とする。

- **新関数**: `create_reservation_v2`（サーバー計算のみ、入力は最小）
- **旧関数**: `create_reservation_with_lock` は当面残し、内部で `create_reservation_v2` を呼ぶ“薄いラッパ”に寄せる（可能なら）

#### ステップ2: 料金/日時のサーバー確定（実装）

**DB側で料金・日時を再計算し、入力値は信用しない（あれば無視）**

```sql
-- 新マイグレーション: 027_server_side_pricing_validation.sql

CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_schedule_event_id UUID,
  p_participant_count INTEGER,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_scenario_id UUID,
  p_store_id UUID,
  -- ↓ 以下は削除または参考値扱い
  -- p_requested_datetime TIMESTAMPTZ,  ← 削除（schedule_eventsから取得）
  -- p_base_price INTEGER,               ← 削除（サーバー計算）
  -- p_total_price INTEGER,              ← 削除（サーバー計算）
  -- p_unit_price INTEGER,               ← 削除（サーバー計算）
  p_duration INTEGER,
  p_reservation_number TEXT,
  p_notes TEXT,
  p_created_by UUID,
  p_organization_id UUID,
  p_title TEXT
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_available_seats INTEGER;
  v_reservation_id UUID;
  v_event_date DATE;
  v_event_start_time TIME;
  v_scenario_participation_fee INTEGER;
  v_calculated_datetime TIMESTAMPTZ;
  v_calculated_unit_price INTEGER;
  v_calculated_total_price INTEGER;
BEGIN
  IF p_participant_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0001';
  END IF;

  -- ✅ イベント情報を取得してロック
  SELECT 
    organization_id,
    COALESCE(max_participants, capacity, 8),
    date,
    start_time,
    is_cancelled
  INTO 
    v_event_org_id, 
    v_max_participants,
    v_event_date,
    v_event_start_time,
    v_is_cancelled
  FROM schedule_events
  WHERE id = p_schedule_event_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  
  IF v_is_cancelled THEN
    RAISE EXCEPTION 'EVENT_CANCELLED' USING ERRCODE = 'P0014';
  END IF;
  
  -- ✅ 過去日付チェック
  IF v_event_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_EVENT' USING ERRCODE = 'P0015';
  END IF;
  
  -- ✅ 締切チェック（reservation_deadline_hours）
  DECLARE
    v_deadline_hours INTEGER;
    v_event_datetime TIMESTAMPTZ;
    v_hours_until_event NUMERIC;
  BEGIN
    -- イベント日時を計算
    v_event_datetime := (v_event_date + v_event_start_time)::TIMESTAMPTZ;
    
    -- 締切時間を取得
    SELECT reservation_deadline_hours INTO v_deadline_hours
    FROM schedule_events
    WHERE id = p_schedule_event_id;
    
    IF v_deadline_hours IS NOT NULL THEN
      v_hours_until_event := EXTRACT(EPOCH FROM (v_event_datetime - NOW())) / 3600;
      
      IF v_hours_until_event < v_deadline_hours THEN
        RAISE EXCEPTION 'PAST_DEADLINE' USING ERRCODE = 'P0016';
      END IF;
    END IF;
  END;
  
  -- ✅ 料金をサーバー側で再計算
  SELECT participation_fee INTO v_scenario_participation_fee
  FROM scenarios
  WHERE id = p_scenario_id;
  
  IF v_scenario_participation_fee IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND' USING ERRCODE = 'P0017';
  END IF;
  
  v_calculated_unit_price := v_scenario_participation_fee;
  v_calculated_total_price := v_scenario_participation_fee * p_participant_count;
  
  -- ✅ requested_datetime をサーバー側で確定
  v_calculated_datetime := (v_event_date + v_event_start_time)::TIMESTAMPTZ;

  -- 認証チェック（既存コードを維持）
  v_caller_org_id := get_user_organization_id();
  v_is_admin := is_org_admin();
  -- ... 既存の認可ロジック ...

  -- 在庫確認（既存コードを維持）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = p_schedule_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed')
  FOR UPDATE;

  v_available_seats := v_max_participants - v_current_participants;

  IF v_available_seats <= 0 THEN
    RAISE EXCEPTION 'SOLD_OUT' USING ERRCODE = 'P0003';
  END IF;

  IF p_participant_count > v_available_seats THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0004';
  END IF;

  -- ✅ 予約を挿入（サーバー計算値を使用）
  INSERT INTO reservations (
    schedule_event_id,
    scenario_id,
    store_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    requested_datetime,      -- ← サーバー計算値
    duration,
    participant_count,
    participant_names,
    base_price,              -- ← サーバー計算値
    options_price,
    total_price,             -- ← サーバー計算値
    discount_amount,
    final_price,             -- ← サーバー計算値
    unit_price,              -- ← サーバー計算値
    payment_method,
    payment_status,
    status,
    customer_notes,
    reservation_number,
    created_by,
    organization_id,
    title
  ) VALUES (
    p_schedule_event_id,
    p_scenario_id,
    p_store_id,
    p_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    v_calculated_datetime,           -- ✅ サーバー確定
    p_duration,
    p_participant_count,
    ARRAY[]::text[],
    v_calculated_total_price,        -- ✅ サーバー計算
    0,
    v_calculated_total_price,        -- ✅ サーバー計算
    0,
    v_calculated_total_price,        -- ✅ サーバー計算
    v_calculated_unit_price,         -- ✅ サーバー計算
    'onsite',
    'pending',
    'confirmed',
    p_notes,
    p_reservation_number,
    p_created_by,
    v_event_org_id,
    COALESCE(p_title, '')
  ) RETURNING id INTO v_reservation_id;

  UPDATE schedule_events
  SET current_participants = v_current_participants + p_participant_count
  WHERE id = p_schedule_event_id;

  RETURN v_reservation_id;
END;
$$;
```

#### フロント側の修正

```typescript
// src/lib/reservationApi.ts
// クライアント側で計算した料金は「表示用」のみにし、RPCには送らない
async create(reservation: CreateReservationWithLockParams): Promise<Reservation> {
  const organizationId = reservation.organization_id || await getCurrentOrganizationId()
  if (!organizationId) {
    throw new Error('組織情報が取得できません。再ログインしてください。')
  }

  const reservationNumber = `${dateStr}-${randomStr}`

  const { data: reservationId, error } = await supabase.rpc('create_reservation_with_lock', {
    p_schedule_event_id: reservation.schedule_event_id,
    p_participant_count: reservation.participant_count,
    p_customer_id: reservation.customer_id,
    p_customer_name: reservation.customer_name ?? null,
    p_customer_email: reservation.customer_email ?? null,
    p_customer_phone: reservation.customer_phone ?? null,
    p_scenario_id: reservation.scenario_id,
    p_store_id: reservation.store_id,
    // ↓ 価格・日時パラメータを削除
    // p_requested_datetime: reservation.requested_datetime,  ← 削除
    // p_base_price: reservation.base_price,                  ← 削除
    // p_total_price: reservation.total_price,                ← 削除
    // p_unit_price: reservation.unit_price,                  ← 削除
    p_duration: reservation.duration,
    p_reservation_number: reservationNumber,
    p_notes: reservation.customer_notes ?? null,
    p_created_by: reservation.created_by ?? null,
    p_organization_id: organizationId,
    p_title: reservation.title
  })

  if (error) {
    logger.error('予約作成RPCエラー:', error)
    if (error.code === 'P0003') throw new Error('この公演は満席です')
    if (error.code === 'P0004') throw new Error('選択した人数分の空席がありません')
    if (error.code === 'P0002') throw new Error('公演が見つかりません')
    if (error.code === 'P0014') throw new Error('この公演は中止されています')
    if (error.code === 'P0015') throw new Error('過去の公演は予約できません')
    if (error.code === 'P0016') throw new Error('予約締切を過ぎています')
    if (error.code === 'P0017') throw new Error('料金情報が取得できません')
    throw error
  }

  // 作成された予約を取得（サーバー計算された料金を含む）
  const { data, error: fetchError } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single()

  if (fetchError) throw fetchError
  return data
}
```

#### テスト項目

```typescript
// テストケース
describe('SEC-P0-02: 料金改ざん防止', () => {
  test('クライアント指定の料金を無視してサーバー計算値が使われる', async () => {
    const result = await supabase.rpc('create_reservation_with_lock', {
      p_schedule_event_id: validEventId,
      p_participant_count: 3,
      // 攻撃: 不正な料金を送る
      // p_total_price: 1,  // ← 送信しない
      // ... 
    })
    
    // 実際の予約を確認
    const { data: reservation } = await supabase
      .from('reservations')
      .select('total_price, unit_price')
      .eq('id', result)
      .single()
    
    // シナリオの正規料金 * 人数になっているか
    expect(reservation.unit_price).toBe(正規料金)
    expect(reservation.total_price).toBe(正規料金 * 3)
  })
})
```

#### 工数見積もり
- マイグレーション作成: 2h（締切/料金計算ロジック）
- RPC関数テスト: 1h
- フロント修正: 1h（パラメータ削除・エラーコード追加）
- E2Eテスト: 1h
- **合計**: 5h

---

### 🚨 SEC-P0-03: `notify-waitlist` の権限とURL入力を厳格化

#### 修正方針

```typescript
// supabase/functions/notify-waitlist/index.ts

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // レートリミット（既存を維持）
    const serviceClient = createClient(...)
    const clientIP = getClientIP(req)
    const rateLimit = await checkRateLimit(serviceClient, clientIP, 'notify-waitlist', 30, 60)
    
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
    }

    // 🔒 認証チェック（既存を維持）
    const authResult = await verifyAuth(req)
    if (!authResult.success) {
      return errorResponse(authResult.error || '認証が必要です', 401, corsHeaders)
    }

    const data: NotifyWaitlistRequest = await req.json()

    // ✅ 権限を「スタッフ/管理者のみ」に制限
    const { data: staffMember } = await serviceClient
      .from('staff')
      .select('id, organization_id')
      .eq('user_id', authResult.user.id)
      .eq('status', 'active')
      .eq('organization_id', data.organizationId)  // ✅ 必須
      .maybeSingle()
    
    if (!staffMember) {
      // 顧客は呼び出し不可
      console.warn('⚠️ 顧客による notify-waitlist 呼び出し試行:', authResult.user?.email)
      return errorResponse(
        'この操作にはスタッフ権限が必要です',
        403,
        corsHeaders
      )
    }
    
    // ✅ bookingUrl をサーバー側で生成（入力値を無視）
    const { data: org } = await serviceClient
      .from('organizations')
      .select('slug, domain')
      .eq('id', data.organizationId)
      .single()
    
    const bookingUrl = org?.domain 
      ? `https://${org.domain}`
      : `https://mmq-yoyaq.vercel.app/${org?.slug || 'queens-waltz'}`
    
    // ✅ 監査ログに記録
    await serviceClient.from('edge_function_logs').insert({
      function_name: 'notify-waitlist',
      user_id: authResult.user.id,
      organization_id: data.organizationId,
      schedule_event_id: data.scheduleEventId,
      action: 'invoke',
      metadata: { freedSeats: data.freedSeats },
      ip_address: clientIP,
      user_agent: req.headers.get('user-agent'),
      created_at: new Date().toISOString()
    })

    // 既存のキャンセル待ち通知ロジック
    // ... (bookingUrl を上書き使用)
    
    const emailHtml = `
      ...
      <a href="${bookingUrl}">今すぐ予約する</a>  <!-- ✅ サーバー生成URL -->
      ...
    `
  }
})
```

#### 必要な追加作業

1. **監査ログテーブル作成**
```sql
CREATE TABLE IF NOT EXISTS edge_function_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  schedule_event_id UUID REFERENCES schedule_events(id),
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edge_function_logs_created_at ON edge_function_logs(created_at DESC);
CREATE INDEX idx_edge_function_logs_user_id ON edge_function_logs(user_id);

-- RLS: 管理者のみ閲覧可能
ALTER TABLE edge_function_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY edge_function_logs_admin_only ON edge_function_logs
  FOR SELECT USING (is_org_admin());
```

#### 工数見積もり
- マイグレーション（ログテーブル）: 0.5h
- Edge Function修正: 1.5h
- テスト: 1h
- **合計**: 3h

---

### 🚨 SEC-P0-04: 貸切承認フローをRPC化（アトミック保証）

#### 修正方針

**複数のDB操作を1つのRPC関数に統合**

```sql
-- 新マイグレーション: 028_atomic_private_booking_approval.sql

CREATE OR REPLACE FUNCTION approve_private_booking(
  p_reservation_id UUID,
  p_selected_date DATE,
  p_selected_start_time TIME,
  p_selected_end_time TIME,
  p_selected_store_id UUID,
  p_selected_gm_id UUID,
  p_candidate_order INTEGER
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_reservation_record reservations%ROWTYPE;
  v_schedule_event_id UUID;
  v_org_id UUID;
  v_gm_name TEXT;
  v_store_name TEXT;
  v_scenario_title TEXT;
BEGIN
  -- 🔒 予約情報を取得（ロック）
  SELECT * INTO v_reservation_record
  FROM reservations
  WHERE id = p_reservation_id
    AND status = 'pending'  -- 承認前のみ
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_ALREADY_APPROVED' USING ERRCODE = 'P0018';
  END IF;
  
  v_org_id := v_reservation_record.organization_id;
  v_scenario_title := v_reservation_record.scenario_title;
  
  -- 🔒 権限確認（スタッフ/管理者のみ）
  IF NOT (
    is_org_admin() OR 
    EXISTS (
      SELECT 1 FROM staff 
      WHERE user_id = auth.uid() 
        AND organization_id = v_org_id 
        AND status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;
  
  -- ✅ 同じ枠に既存公演がないかチェック（ロック）
  PERFORM 1
  FROM schedule_events
  WHERE date = p_selected_date
    AND store_id = p_selected_store_id
    AND start_time = p_selected_start_time
    AND is_cancelled = false
    AND organization_id = v_org_id
  FOR UPDATE NOWAIT;  -- デッドロック回避
  
  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_ALREADY_OCCUPIED' USING ERRCODE = 'P0019';
  END IF;
  
  -- GM名と店舗名を取得
  SELECT name INTO v_gm_name
  FROM staff
  WHERE id = p_selected_gm_id;
  
  SELECT name INTO v_store_name
  FROM stores
  WHERE id = p_selected_store_id;
  
  -- ✅ スケジュール作成（アトミックに）
  INSERT INTO schedule_events (
    date,
    venue,
    scenario,
    start_time,
    end_time,
    store_id,
    gms,
    is_reservation_enabled,
    status,
    category,
    organization_id,
    reservation_id,
    reservation_name,
    is_reservation_name_overwritten
  ) VALUES (
    p_selected_date,
    v_store_name,
    v_scenario_title,
    p_selected_start_time,
    p_selected_end_time,
    p_selected_store_id,
    ARRAY[v_gm_name],
    FALSE,
    'confirmed',
    'private',
    v_org_id,
    p_reservation_id,
    v_reservation_record.customer_name,
    FALSE
  ) RETURNING id INTO v_schedule_event_id;
  
  -- ✅ 予約を更新（アトミックに）
  UPDATE reservations
  SET 
    status = 'confirmed',
    gm_staff = p_selected_gm_id,
    store_id = p_selected_store_id,
    schedule_event_id = v_schedule_event_id,
    -- candidate_datetimes の確定情報を更新
    candidate_datetimes = jsonb_set(
      candidate_datetimes,
      '{confirmedCandidate}',
      jsonb_build_object(
        'date', p_selected_date,
        'startTime', p_selected_start_time::TEXT,
        'endTime', p_selected_end_time::TEXT,
        'order', p_candidate_order
      )
    ),
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN v_schedule_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_private_booking TO authenticated;
COMMENT ON FUNCTION approve_private_booking IS 
'貸切予約の承認処理をアトミックに実行。スタッフ/管理者のみ呼び出し可能。';
```

#### フロント修正

```typescript
// src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts
const handleApprove = useCallback(async (
  requestId: string,
  selectedRequest: PrivateBookingRequest | null,
  selectedGMId: string,
  selectedStoreId: string,
  selectedCandidateOrder: number | null,
  stores: any[]
): Promise<{ success: boolean; error?: string }> => {
  if (!selectedGMId || !selectedStoreId || !selectedCandidateOrder) {
    return { success: false, error: '承認に必要な情報が不足しています' }
  }

  try {
    setSubmitting(true)

    const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
      c => c.order === selectedCandidateOrder
    )
    
    if (!selectedCandidate) {
      return { success: false, error: '候補日時が見つかりません' }
    }

    // ✅ RPC呼び出し（アトミックに実行）
    const { data: scheduleEventId, error } = await supabase.rpc('approve_private_booking', {
      p_reservation_id: requestId,
      p_selected_date: selectedCandidate.date,
      p_selected_start_time: selectedCandidate.startTime,
      p_selected_end_time: selectedCandidate.endTime,
      p_selected_store_id: selectedStoreId,
      p_selected_gm_id: selectedGMId,
      p_candidate_order: selectedCandidateOrder
    })

    if (error) {
      if (error.code === 'P0019') {
        return { success: false, error: 'この時間帯には既に別の公演が入っています' }
      }
      throw error
    }

    // ✅ メール送信（別トランザクション、失敗しても承認は確定済み）
    try {
      await sendApprovalEmail(requestId, selectedCandidate, selectedStoreId, stores)
    } catch (emailError) {
      logger.error('承認メール送信エラー:', emailError)
      // メール送信失敗は承認処理に影響させない
    }

    onSuccess()
    return { success: true }
  } catch (error) {
    logger.error('承認エラー:', error)
    return { success: false, error: '承認処理中にエラーが発生しました' }
  } finally {
    setSubmitting(false)
  }
}, [onSuccess])
```

#### テスト項目

```typescript
describe('SEC-P0-04: 貸切承認のアトミック性', () => {
  test('RPC途中失敗時に部分成功が起きない', async () => {
    // シナリオ: schedule_events作成後にreservations更新が失敗
    // 期待: 全体がロールバックされる（RPC関数のトランザクション保証）
  })
  
  test('同時に2人が同じ枠を承認しようとする', async () => {
    // 期待: 片方がP0019エラー（SLOT_ALREADY_OCCUPIED）
  })
})
```

#### 工数見積もり
- RPC関数作成: 2h
- フロント修正: 1.5h
- テスト: 1.5h
- **合計**: 5h

---

## Phase 0: 再発防止（ガードレール整備 / “次のP0”を作らせない）

このPhaseは「UIや機能を変えずに」再発率を落とすための“仕組み”対応。

### 0-1. ルールを明文化（開発者が迷わない）

- 追加: `docs/SECURE_CODING_GUIDELINES.md`
  - 予約/在庫/料金に影響する変更は **RPC必須**
  - Edge Function は **入力値を信用しない**（URL/organizationId等）
  - マルチテナント（`organization_id`）の必須ルール

### 0-2. レビューで落とせるようにする（PRテンプレ強化）

- 更新: `.github/PULL_REQUEST_TEMPLATE.md`
  - **直接UPDATE/DELETEの禁止（予約/在庫/料金）**
  - **非アトミックな複数DB操作の禁止（RPC化 or トランザクション）**
  - **クライアント入力のサーバー検証（fail-closed）**

### 0-3. “壊さずに検出”する（セキュリティ回帰テストの最小セット）

Playwright/E2EまたはSQLで最低限をCIに載せる。

- **RLS回帰（最小）**
  - 顧客が `reservations.status/participant_count/schedule_event_id/price` を直接UPDATEできない
- **在庫回帰（最小）**
  - 日程変更RPCで、旧/新イベントの `current_participants` が整合する
- **Edge Function回帰（最小）**
  - `notify-waitlist` が `bookingUrl` 入力を無視し、サーバー生成URLを使う

### 0-4. “どれが本番に当たるか”を固定する（移行の再発防止）

`database/migrations` と `supabase/migrations` の二重管理で、関数/RLSが“いつの間にか巻き戻る”事故が起きる。

- **方針**: **本番適用のソースオブトゥルースを1つに統一**（推奨: `supabase/migrations`）
- **運用**:
  - `database/migrations` は“設計/検証/履歴”に留めるか、廃止して一本化
  - 少なくとも **同一関数名の `CREATE OR REPLACE FUNCTION` が両方に存在しない**状態を維持

---

## Phase 2: P1修正（早期対応）

### ⚠️ SEC-P1-01: 予約制限チェックをfail-closedに + DB強制

#### 修正A: フロント側をfail-closed化

```typescript
// src/pages/BookingConfirmation/hooks/useBookingSubmit.ts

const checkReservationLimits = async (
  eventId: string,
  participantCount: number,
  eventDate: string,
  startTime: string
): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    const { data: eventData, error: eventError } = await supabase
      .from('schedule_events')
      .select('max_participants, capacity, reservation_deadline_hours, store_id')
      .eq('id', eventId)
      .single()

    if (eventError) {
      logger.error('公演データ取得エラー:', eventError)
      // ✅ エラー時は fail-closed
      return { allowed: false, reason: 'エラーが発生しました。しばらく待ってから再試行してください。' }
    }

    // ... 以下既存チェック ...

  } catch (error) {
    logger.error('予約制限チェックエラー:', error)
    // ✅ エラー時は fail-closed（変更前: allowed: true）
    return { allowed: false, reason: 'エラーが発生しました。しばらく待ってから再試行してください。' }
  }
}
```

#### 修正B: DB側でも締切を強制（既にSEC-P0-02で対応済み）

#### 工数見積もり
- フロント修正: 0.5h
- テスト: 0.5h
- **合計**: 1h

---

### ⚠️ SEC-P1-02: 日程変更の競合制御

#### 現在の問題

```typescript
// src/pages/MyPage/pages/ReservationsPage.tsx: L634-643
// 日程変更が在庫ロックなしでUPDATE
const { error } = await supabase
  .from('reservations')
  .update({
    schedule_event_id: selectedNewEventId,
    store_id: newEvent.store_id,
    requested_datetime: `${newEvent.date}T${newEvent.start_time}`
  })
  .eq('id', dateChangeTarget.id)
// ↑ 新旧両方のeventで在庫ロックしていない
```

#### 修正方針

**日程変更もRPC化**

```sql
CREATE OR REPLACE FUNCTION change_reservation_schedule(
  p_reservation_id UUID,
  p_new_schedule_event_id UUID,
  p_customer_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_old_event_id UUID;
  v_participant_count INTEGER;
  v_new_max_participants INTEGER;
  v_new_current_participants INTEGER;
  v_org_id UUID;
BEGIN
  -- 既存予約をロック
  SELECT schedule_event_id, participant_count, organization_id
  INTO v_old_event_id, v_participant_count, v_org_id
  FROM reservations
  WHERE id = p_reservation_id
    AND customer_id = p_customer_id
    AND status != 'cancelled'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;
  
  -- 新旧両方のイベントをロック（デッドロック回避のためID順）
  IF v_old_event_id < p_new_schedule_event_id THEN
    PERFORM 1 FROM schedule_events WHERE id = v_old_event_id FOR UPDATE;
    PERFORM 1 FROM schedule_events WHERE id = p_new_schedule_event_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM schedule_events WHERE id = p_new_schedule_event_id FOR UPDATE;
    PERFORM 1 FROM schedule_events WHERE id = v_old_event_id FOR UPDATE;
  END IF;
  
  -- 新イベントの空席確認
  SELECT COALESCE(max_participants, capacity, 8), current_participants
  INTO v_new_max_participants, v_new_current_participants
  FROM schedule_events
  WHERE id = p_new_schedule_event_id
    AND is_cancelled = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEW_EVENT_NOT_FOUND' USING ERRCODE = 'P0020';
  END IF;
  
  IF (v_new_current_participants + v_participant_count) > v_new_max_participants THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS_IN_NEW_EVENT' USING ERRCODE = 'P0021';
  END IF;
  
  -- 旧イベントから在庫を返却
  UPDATE schedule_events
  SET current_participants = GREATEST(current_participants - v_participant_count, 0)
  WHERE id = v_old_event_id;
  
  -- 新イベントで在庫を確保
  UPDATE schedule_events
  SET current_participants = current_participants + v_participant_count
  WHERE id = p_new_schedule_event_id;
  
  -- 予約を更新
  UPDATE reservations
  SET 
    schedule_event_id = p_new_schedule_event_id,
    store_id = p_selected_store_id,
    updated_at = NOW()
  WHERE id = p_reservation_id;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION change_reservation_schedule TO authenticated;
```

#### 工数見積もり
- RPC関数作成: 1.5h
- フロント修正: 1h
- テスト: 1h
- **合計**: 3.5h

---

### ⚠️ SEC-P1-03: 監査証跡（reservations_history）追加

#### 実装

```sql
-- 新マイグレーション: 029_reservation_history_audit.sql

CREATE TABLE IF NOT EXISTS reservations_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL,  -- 元の予約ID
  changed_by_user_id UUID REFERENCES auth.users(id),
  changed_by_type TEXT NOT NULL,  -- 'customer', 'staff', 'system'
  action_type TEXT NOT NULL,      -- 'create', 'update', 'cancel', 'restore'
  old_values JSONB,
  new_values JSONB,
  changes JSONB,                  -- 差分のみ
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservations_history_reservation_id ON reservations_history(reservation_id);
CREATE INDEX idx_reservations_history_created_at ON reservations_history(created_at DESC);

-- トリガー関数
CREATE OR REPLACE FUNCTION log_reservation_changes()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_changes JSONB := '{}'::JSONB;
  v_changed_by_type TEXT;
BEGIN
  -- 変更者タイプを判定
  IF is_org_admin() THEN
    v_changed_by_type := 'staff';
  ELSIF get_user_organization_id() IS NOT NULL THEN
    v_changed_by_type := 'staff';
  ELSIF auth.uid() IS NOT NULL THEN
    v_changed_by_type := 'customer';
  ELSE
    v_changed_by_type := 'system';
  END IF;
  
  -- 変更差分を計算
  IF TG_OP = 'UPDATE' THEN
    -- 重要フィールドのみ記録
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changes := jsonb_set(v_changes, '{status}', to_jsonb(NEW.status));
    END IF;
    IF OLD.participant_count IS DISTINCT FROM NEW.participant_count THEN
      v_changes := jsonb_set(v_changes, '{participant_count}', to_jsonb(NEW.participant_count));
    END IF;
    IF OLD.schedule_event_id IS DISTINCT FROM NEW.schedule_event_id THEN
      v_changes := jsonb_set(v_changes, '{schedule_event_id}', to_jsonb(NEW.schedule_event_id));
    END IF;
    IF OLD.total_price IS DISTINCT FROM NEW.total_price THEN
      v_changes := jsonb_set(v_changes, '{total_price}', to_jsonb(NEW.total_price));
    END IF;
    
    -- 変更がある場合のみ記録
    IF v_changes != '{}'::JSONB THEN
      INSERT INTO reservations_history (
        reservation_id,
        changed_by_user_id,
        changed_by_type,
        action_type,
        old_values,
        new_values,
        changes
      ) VALUES (
        NEW.id,
        auth.uid(),
        v_changed_by_type,
        'update',
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_changes
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_reservation_changes
AFTER UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION log_reservation_changes();

-- RLS設定
ALTER TABLE reservations_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_history_select ON reservations_history
  FOR SELECT USING (
    is_org_admin()
    OR changed_by_user_id = auth.uid()
  );

-- INSERT/UPDATE/DELETE は禁止（トリガーからのみ）
CREATE POLICY reservations_history_no_manual_changes ON reservations_history
  FOR ALL USING (FALSE);
```

#### 工数見積もり
- マイグレーション作成: 2h
- 履歴表示UI（オプション）: 3h
- **合計**: 5h

---

## Phase 3: P2修正（品質改善）

### 🟡 SEC-P2-01: URL由来ID参照の対策

#### 修正

```typescript
// src/pages/MyPage/pages/ReservationDetailPage.tsx

const fetchReservation = async () => {
  try {
    const { data: resData, error: resError } = await supabase
      .from('reservations')
      .select('...')
      .eq('id', reservationId)
      .single()
    
    if (resError) {
      // ✅ エラーを統一（存在しないか権限なしか区別しない）
      logger.error('予約取得エラー:', resError)
      toast.error('予約が見つかりませんでした')
      navigate('/mypage')
      return
    }
    
    // ... 正常処理
  } catch (error) {
    logger.error('予約取得処理エラー:', error)
    toast.error('予約情報の取得に失敗しました')
    navigate('/mypage')
  }
}
```

#### 工数見積もり
- 修正: 0.5h
- **合計**: 0.5h

---

## 実装順序（推奨）

### Week 1: P0緊急対応

| 日 | タスク | 担当 | 工数 | 完了条件 |
|----|--------|------|------|----------|
| Day 1 | SEC-P0-01: RLS厳格化 | - | 2.5h | マイグレーション適用 + フロント動作確認 |
| Day 2-3 | SEC-P0-02: 料金/日時検証 | - | 5h | RPC修正 + E2Eテスト |
| Day 3-4 | SEC-P0-03: notify-waitlist権限 | - | 3h | Edge Function修正 + テスト |
| Day 4-5 | SEC-P0-04: 貸切承認RPC化 | - | 5h | RPC作成 + フロント統合 |

**Week 1合計**: 15.5h

### Week 2: P1対応

| 日 | タスク | 工数 |
|----|--------|------|
| Day 6 | SEC-P1-01: fail-closed化 | 1h |
| Day 7 | SEC-P1-02: 日程変更RPC化 | 3.5h |
| Day 8-9 | SEC-P1-03: 監査証跡 | 5h |
| Day 10 | SEC-P1-XX: 冪等性検討 | 調査のみ |

**Week 2合計**: 9.5h

### Week 3: P2対応 + 統合テスト

| 日 | タスク | 工数 |
|----|--------|------|
| Day 11 | SEC-P2-01/02: 細かい改善 | 1h |
| Day 12-14 | 統合テスト + 負荷テスト | 8h |
| Day 15 | 修正内容のドキュメント化 | 2h |

**Week 3合計**: 11h

---

## テスト戦略

### 1. ユニットテスト（RPC関数）

```sql
-- test/rpc/test_create_reservation_with_lock.sql

-- テスト1: 料金改ざん防止
BEGIN;
  -- クライアントが不正な料金を送信
  SELECT create_reservation_with_lock(
    p_schedule_event_id := :event_id,
    p_participant_count := 3,
    -- p_total_price := 1,  -- 送信しない
    ...
  ) INTO v_reservation_id;
  
  -- サーバー計算値が使われているか確認
  SELECT total_price, unit_price INTO v_total, v_unit
  FROM reservations WHERE id = v_reservation_id;
  
  ASSERT v_unit = (正規料金), '料金が正しく計算されていません';
  ASSERT v_total = (正規料金 * 3), '合計料金が正しく計算されていません';
ROLLBACK;

-- テスト2: 締切チェック
BEGIN;
  -- 締切を過ぎたイベントで予約
  UPDATE schedule_events 
  SET reservation_deadline_hours = 24
  WHERE id = :event_id;
  
  -- 23時間前に時刻を設定（テスト用）
  SELECT create_reservation_with_lock(...);
  -- 期待: P0016エラー（PAST_DEADLINE）
ROLLBACK;
```

### 2. 統合テスト（競合シナリオ）

```typescript
// tests/integration/reservation-race-condition.test.ts

describe('予約競合テスト', () => {
  test('同時予約で定員超過しない', async () => {
    const eventId = '残席1の公演'
    
    // 2人が同時に予約
    const [result1, result2] = await Promise.allSettled([
      reservationApi.create({ eventId, participantCount: 1, ... }),
      reservationApi.create({ eventId, participantCount: 1, ... })
    ])
    
    // 片方成功、片方失敗
    expect(
      (result1.status === 'fulfilled' && result2.status === 'rejected') ||
      (result1.status === 'rejected' && result2.status === 'fulfilled')
    ).toBe(true)
    
    // 在庫確認
    const { data: event } = await supabase
      .from('schedule_events')
      .select('current_participants')
      .eq('id', eventId)
      .single()
    
    expect(event.current_participants).toBe(1)  // 1人分のみ確保
  })
  
  test('日程変更中に元の公演が満席になっても安全', async () => {
    // 実装待ち
  })
})
```

### 3. セキュリティテスト

```typescript
// tests/security/authorization.test.ts

describe('認可テスト', () => {
  test('顧客が他人の予約をUPDATEできない', async () => {
    const { data: victimReservation } = await createReservation({ customerId: 'victim' })
    
    // 攻撃者でログイン
    await supabase.auth.signInWithPassword({ email: 'attacker@example.com', password: 'pass' })
    
    // 直接UPDATE試行
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', victimReservation.id)
    
    // RLSで拒否される
    expect(error).toBeTruthy()
    
    // 予約が変更されていないことを確認
    const { data: check } = await supabase
      .from('reservations')
      .select('status')
      .eq('id', victimReservation.id)
      .single()
    
    expect(check.status).toBe('confirmed')  // 変更されていない
  })
  
  test('顧客が notify-waitlist を呼び出せない', async () => {
    // 顧客でログイン
    await supabase.auth.signInWithPassword({ email: 'customer@example.com', password: 'pass' })
    
    const { error } = await supabase.functions.invoke('notify-waitlist', {
      body: { organizationId: 'test-org', scheduleEventId: 'test-event', ... }
    })
    
    // 403エラー
    expect(error?.status).toBe(403)
  })
})
```

### 4. E2Eテスト（Playwright）

```typescript
// e2e/reservation-flow.spec.ts

test('予約フロー全体', async ({ page }) => {
  // ログイン
  await page.goto('/login')
  await page.fill('[name="email"]', 'test@example.com')
  await page.fill('[name="password"]', 'password')
  await page.click('button[type="submit"]')
  
  // 公演選択
  await page.goto('/queens-waltz')
  await page.click('text=テストシナリオ')
  await page.click('button:has-text("予約する")')
  
  // 人数選択
  await page.selectOption('[name="participantCount"]', '3')
  
  // フォーム入力
  await page.fill('[name="customerName"]', 'テスト太郎')
  await page.fill('[name="customerEmail"]', 'test@example.com')
  await page.fill('[name="customerPhone"]', '090-1234-5678')
  
  // 予約確定
  await page.click('button:has-text("予約を確定")')
  
  // 成功メッセージ
  await expect(page.locator('text=予約が完了しました')).toBeVisible()
  
  // マイページで確認
  await page.goto('/mypage')
  await expect(page.locator('text=参加予定の予約 (1)')).toBeVisible()
})
```

---

## リスク管理

### 修正時のリスク

| リスク | 影響 | 対策 |
|--------|------|------|
| マイグレーション失敗でサービス停止 | **致命的** | ステージング環境で事前検証、ロールバックSQL準備 |
| RPC関数の破壊的変更で既存予約が動かない | **重大** | 段階的移行（新旧両方のシグネチャを一時サポート） |
| フロント修正でレグレッション | 中 | E2Eテスト自動化、主要フロー全確認 |
| DB負荷増加（FOR UPDATE多用） | 中 | `statement_timeout` 設定、スロークエリログ監視 |

### ロールバック計画

```sql
-- 各マイグレーションにロールバックSQLを含める

-- 026_restrict_customer_reservation_update.sql のロールバック
DROP POLICY IF EXISTS reservations_update_customer_notes_only ON reservations;

-- 元のポリシーに戻す
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
```

---

## マイグレーション適用順序

### 依存関係

```
026 ─┐
     ├─→ 027 ─┐
028 ─┘        ├─→ 029
              │
030 (future) ─┘
```

### 適用手順

```bash
# 1. ローカル/ステージング環境で検証
supabase db reset  # ローカルDB初期化
supabase db push   # マイグレーション適用

# 2. 動作確認
npm run test:integration

# 3. 本番適用（慎重に）
supabase db push --linked  # 本番DB適用
```

---

## 完了条件（Definition of Done）

### P0完了の判定基準

- [ ] SEC-P0-01: 顧客が `status`/`participant_count`/`schedule_event_id` を直接変更できないことを確認（RLSテスト）
- [ ] SEC-P0-02: API直叩きで不正な料金を送っても、サーバー計算値で上書きされることを確認
- [ ] SEC-P0-03: 顧客が `notify-waitlist` を呼び出すと403エラーになることを確認
- [ ] SEC-P0-04: 貸切承認中にエラーが起きても、部分成功しないことを確認（トランザクション保証）
- [ ] 全P0修正後、既存の予約作成/変更/キャンセルフローが正常動作すること
- [ ] E2Eテストが全てパスすること

### P1完了の判定基準

- [ ] fail-closedテスト: DB接続エラー時に予約が拒否されること
- [ ] 日程変更の競合テスト: 同時変更で在庫が壊れないこと
- [ ] 監査ログが全ての重要操作で記録されること

---

## モニタリング・検証

### 本番適用後の監視項目

```sql
-- 1. 在庫整合性チェック（日次）
SELECT * FROM check_and_fix_inventory_consistency();

-- 2. 監査ログの異常パターン検出
SELECT 
  changed_by_user_id,
  COUNT(*) as change_count,
  array_agg(DISTINCT action_type) as actions
FROM reservations_history
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY changed_by_user_id
HAVING COUNT(*) > 50  -- 1日50回以上変更は異常
ORDER BY change_count DESC;

-- 3. Edge Function呼び出し異常検知
SELECT 
  function_name,
  user_id,
  COUNT(*) as call_count
FROM edge_function_logs
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY function_name, user_id
HAVING COUNT(*) > 10  -- 1時間10回以上は異常
ORDER BY call_count DESC;

-- 4. 予約エラーレート
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE error_code IS NOT NULL) as error_count,
  COUNT(*) as total_attempts,
  ROUND(100.0 * COUNT(*) FILTER (WHERE error_code IS NOT NULL) / COUNT(*), 2) as error_rate
FROM reservation_attempt_logs  -- 実装する場合
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;
```

---

## コミュニケーション計画

### ステークホルダー通知

1. **開発チーム**
   - 修正計画共有（このドキュメント）
   - コードレビュー依頼（各PR）
   - テスト結果共有

2. **運用チーム**
   - P0修正の影響範囲説明
   - ダウンタイム予告（マイグレーション適用時）
   - ロールバック手順の共有

3. **顧客**
   - メンテナンス通知（該当する場合）
   - 予約フローの変更点（ある場合）

---

## 追加調査が必要な項目（疑い段階）

### 要確認1: `create_reservation_with_lock` の適用順

```bash
# database/migrations/ 配下のマイグレーションで
# create_reservation_with_lock が何回も CREATE OR REPLACE されている
# → 最終的にどのバージョンが適用されているか確認

grep -n "CREATE OR REPLACE FUNCTION create_reservation_with_lock" database/migrations/*.sql

# 結果:
# 005_booking_rpc_and_rls_hardening.sql:8
# 006_security_rpc_and_notifications.sql:113
# 022_fix_reservation_race_condition.sql:10
#
# → 022 が最新？（ファイル名の番号順）
# → Supabase管理画面でも確認
```

### 要確認2: 現在のRLSポリシー状態

```sql
-- 本番DBで実行して確認
SELECT 
  tablename, 
  policyname, 
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'reservations'
ORDER BY policyname;

-- reservations_update_customer が存在するか
-- reservations_update_customer_notes_only が存在するか
```

### 要確認3: 直接UPDATE経路の全抽出

```bash
# フロント全体で reservations を直接 UPDATE している箇所
rg "\.from\('reservations'\).*\.update\(" src/ -A 5

# 結果を全て確認して、RPC化 or スタッフ限定化
```

---

## まとめ

### 修正の優先順位

1. **SEC-P0-01/02** → 料金/在庫/状態の改ざん防止（最優先）
2. **SEC-P0-03/04** → 権限/アトミック性の保証
3. **SEC-P1-XX** → 運用安定性の向上
4. **SEC-P2-XX** → 品質改善

### 総工数見積もり

- **P0修正**: 15.5h
- **P1修正**: 9.5h
- **P2修正**: 1h
- **統合テスト**: 8h
- **ドキュメント**: 2h
- **合計**: **36h**（約5営業日）

### 最短リリース可能時期

- **P0のみ修正**: 2営業日後
- **P0+P1修正**: 5営業日後（推奨）
- **全修正**: 7営業日後

---

**計画作成者**: AI Assistant  
**計画作成日**: 2026-01-30  
**承認待ち**: -
