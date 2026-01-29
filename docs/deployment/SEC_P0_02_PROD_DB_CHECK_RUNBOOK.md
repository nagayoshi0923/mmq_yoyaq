# SEC-P0-02 運用Runbook: 本番DB確認（create_reservation_with_lock）

**作成日**: 2026-01-30  
**目的**: `create_reservation_with_lock` の「本番DB上の実シグネチャ/実装」を確定し、修正方針（DB優先 or フロント優先）を迷わず決める  
**対象**: Supabase Dashboard（Production / Staging）SQL Editor  

---

## 前提

- このプロジェクトでは、`create_reservation_with_lock` が複数回 `CREATE OR REPLACE` されており、**“最新のファイル”と“本番の実体”が一致している保証がない**。
- そのため、**修正前に必ず本番DBで事実を確認**する（推測で進めない）。

---

## 手順（そのままコピペで運用できる形）

### 1) 関数の「存在するシグネチャ」を列挙（最優先）

```sql
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

**判定ポイント**:
- **パラメータに `p_total_price` / `p_unit_price` / `p_base_price` / `p_requested_datetime` があるか**
- そもそも **複数シグネチャ（オーバーロード）が存在**していないか

---

### 2) 実装（関数ボディ）を取得して“何を信用しているか”を確認

```sql
SELECT
  p.oid::regprocedure AS signature,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_reservation_with_lock'
ORDER BY p.oid;
```

**チェック項目**:
- 料金（`total_price/unit_price/base_price`）が **引数からそのままINSERT** されていないか
- `requested_datetime` が **引数由来** になっていないか（本来は `schedule_events` から確定）
- `schedule_events` の **悲観ロック（`FOR UPDATE`）** があるか
- `reservations` の集計が競合に強いか（最低でも event row lock がある）
- 認可（`auth.uid()` / `get_user_organization_id()` / `is_org_admin()`）の境界があるか

---

### 3) 本番で適用済みマイグレーションを確認（“いつ/何が”入ったか）

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 50;
```

**判定ポイント**:
- 期待するマイグレーション（例: 022相当）が本番に入っているか
- `database/migrations` と `supabase/migrations` の **どちらが本番適用のソースか**が揺れていないか

---

### 4) 予約テーブル/RLSポリシー状態も合わせて確認（関連事故の早期検出）

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'reservations'
ORDER BY policyname;
```

---

## 結果ごとの分岐（判断を固定化）

### ケースA: 価格/日時パラメータが“存在しない”シグネチャのみ（022型）

- **意味**: フロントが価格/日時パラメータを送っていると、予約作成が壊れている可能性が高い
- **対応**:
  - フロントは **v2（新RPC）を優先呼び出し**、存在しない場合は022型へフォールバック
  - 価格はDBで確定する設計へ移行（SEC-P0-02の本筋）

### ケースB: 価格/日時パラメータが“存在する”シグネチャ（005/006型）

- **意味**: 料金改ざんの余地が残る（SEC-P0-02が成立し得る）
- **対応**:
  - DB側に **v2 RPC（サーバー計算）を追加**し、フロントを v2 優先へ切り替え
  - **旧関数（同シグネチャ）も安全化**して「旧RPC直叩き」攻撃経路を塞ぐ
    - 料金/日時をサーバー確定し、クライアント入力は無視
    - 互換性を壊さない（引数は残すが使わない）

### ケースC: 複数シグネチャが混在（オーバーロード）

- **意味**: どの関数が呼ばれているかが呼び出し側の引数で変わる＝事故が起きやすい
- **対応**:
  - **v2の関数名を別名に固定**して、フロントは v2 以外を基本使わない
  - 移行完了後に旧関数を整理（削除/統合）

---

## 記録（運用ログに残すもの）

- 実行日時 / 環境（staging or production）
- (1) の出力（signature一覧）
- (2) の出力（definition全文 or 要点）
- 判定（ケースA/B/C）
- その後の実施内容（マイグレーション適用、フロント切り替え、ロールバック有無）

---

## ポストデプロイ検証（必須）: 改ざんテスト（ROLLBACK付き）

目的:
- 「**クライアントが不正な料金/日時を送っても**、DBがサーバー計算値で上書きする」ことを確認する
- 本番でデータを汚さないため、**必ず ROLLBACK** する

### 準備（共通）

このテストは **擬似的に“顧客として”実行**するため、テスト対象の組織/公演に紐づく `customers` を1件自動選択し、`request.jwt.claims` をセットします。

### テスト1: 旧RPC（create_reservation_with_lock）に不正な料金/日時を入れても無視される

```sql
BEGIN;

DO $$
DECLARE
  v_event_id uuid;
  v_org_id uuid;
  v_customer_id uuid;
  v_customer_user_id uuid;
  v_reservation_id uuid;

  v_expected_dt timestamptz;
  v_expected_unit integer;
  v_expected_total integer;

  v_fee integer;
  v_costs jsonb;
  v_start_time time;
  v_time_slot text;
  v_cost jsonb;

  v_unit integer;
  v_total integer;
  v_dt timestamptz;

  v_participant_count integer := 2;
  v_res_no text;
BEGIN
  -- 1) 未来の公演を1件選ぶ（本番データを自動選択）
  SELECT id, organization_id, start_time, (date + start_time)::timestamptz
  INTO v_event_id, v_org_id, v_start_time, v_expected_dt
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
  ORDER BY date ASC, start_time ASC
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'NO_EVENT_FOUND';
  END IF;

  -- 2) 同じorganizationの顧客を1件選び、擬似JWTを設定
  SELECT id, user_id
  INTO v_customer_id, v_customer_user_id
  FROM customers
  WHERE organization_id = v_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_customer_id IS NULL OR v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_CUSTOMER_FOUND_FOR_ORG %', v_org_id;
  END IF;

  -- Supabase の auth.uid() は環境により request.jwt.claim.sub を参照するため、
  -- SQL Editor でも確実に動くよう両方セットする
  PERFORM set_config('request.jwt.claim.sub', v_customer_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer_user_id)::text, true);

  -- 3) “不正な料金/日時”を渡して旧RPCを呼ぶ（※安全化できていれば無視される）
  v_res_no := to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  v_reservation_id := create_reservation_with_lock(
    v_event_id,                 -- p_schedule_event_id
    v_participant_count,        -- p_participant_count
    v_customer_id,              -- p_customer_id
    'SEC_P0_02_TEST',           -- p_customer_name
    'sec-test@example.com',     -- p_customer_email
    '0000000000',               -- p_customer_phone
    NULL,                       -- p_scenario_id（イベント側を優先するためNULLでOK）
    NULL,                       -- p_store_id（イベント側を優先するためNULLでOK）
    '2000-01-01T00:00:00Z'::timestamptz, -- p_requested_datetime（改ざん）
    999,                        -- p_duration（改ざん）
    1,                          -- p_base_price（改ざん）
    1,                          -- p_total_price（改ざん）
    1,                          -- p_unit_price（改ざん）
    v_res_no,                   -- p_reservation_number
    'SEC_P0_02_TEST_NOTES',     -- p_notes
    NULL,                       -- p_created_by
    v_org_id,                   -- p_organization_id（無視されても可）
    'SEC_P0_02_TEST_TITLE'      -- p_title（無視されても可）
  );

  -- 4) 期待値（サーバー計算）を算出
  SELECT s.participation_fee, s.participation_costs
  INTO v_fee, v_costs
  FROM schedule_events e
  JOIN scenarios s ON s.id = e.scenario_id
  WHERE e.id = v_event_id;

  IF v_fee IS NULL THEN
    RAISE EXCEPTION 'SCENARIO_FEE_NOT_FOUND (participation_fee is NULL)';
  END IF;

  IF EXTRACT(HOUR FROM v_start_time) < 12 THEN
    v_time_slot := 'morning';
  ELSIF EXTRACT(HOUR FROM v_start_time) < 18 THEN
    v_time_slot := 'afternoon';
  ELSE
    v_time_slot := 'evening';
  END IF;

  v_cost := NULL;
  IF v_costs IS NOT NULL AND jsonb_typeof(v_costs) = 'array' THEN
    SELECT elem INTO v_cost
    FROM jsonb_array_elements(v_costs) elem
    WHERE COALESCE(elem->>'status', 'active') = 'active'
      AND elem->>'time_slot' = v_time_slot
    LIMIT 1;

    IF v_cost IS NULL THEN
      SELECT elem INTO v_cost
      FROM jsonb_array_elements(v_costs) elem
      WHERE COALESCE(elem->>'status', 'active') = 'active'
        AND elem->>'time_slot' = '通常'
      LIMIT 1;
    END IF;
  END IF;

  IF v_cost IS NOT NULL THEN
    IF v_cost->>'type' = 'percentage' THEN
      v_expected_unit := ROUND(v_fee * (1 + (COALESCE((v_cost->>'amount')::numeric, 0) / 100)))::integer;
    ELSE
      v_expected_unit := COALESCE((v_cost->>'amount')::integer, v_fee);
    END IF;
  ELSE
    v_expected_unit := v_fee;
  END IF;

  v_expected_total := v_expected_unit * v_participant_count;

  -- 5) 実データを取得して検証
  SELECT unit_price, total_price, requested_datetime
  INTO v_unit, v_total, v_dt
  FROM reservations
  WHERE id = v_reservation_id;

  IF v_unit IS DISTINCT FROM v_expected_unit THEN
    RAISE EXCEPTION 'SEC_P0_02_FAILED: unit_price mismatch (expected %, got %)', v_expected_unit, v_unit;
  END IF;

  IF v_total IS DISTINCT FROM v_expected_total THEN
    RAISE EXCEPTION 'SEC_P0_02_FAILED: total_price mismatch (expected %, got %)', v_expected_total, v_total;
  END IF;

  IF v_dt IS DISTINCT FROM v_expected_dt THEN
    RAISE EXCEPTION 'SEC_P0_02_FAILED: requested_datetime mismatch (expected %, got %)', v_expected_dt, v_dt;
  END IF;

  RAISE NOTICE '✅ SEC-P0-02 Test OK (old RPC hardened): reservation_id=%', v_reservation_id;
END $$;

ROLLBACK;
```

### テスト2: v2 RPC がサーバー計算であること（簡易）

```sql
BEGIN;

DO $$
DECLARE
  v_event_id uuid;
  v_org_id uuid;
  v_customer_id uuid;
  v_customer_user_id uuid;
  v_reservation_id uuid;
BEGIN
  SELECT id, organization_id
  INTO v_event_id, v_org_id
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
  ORDER BY date ASC, start_time ASC
  LIMIT 1;

  SELECT id, user_id
  INTO v_customer_id, v_customer_user_id
  FROM customers
  WHERE organization_id = v_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', v_customer_user_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer_user_id)::text, true);

  v_reservation_id := create_reservation_with_lock_v2(
    v_event_id,
    1,
    v_customer_id,
    'SEC_P0_02_TEST_V2',
    'sec-test@example.com',
    '0000000000',
    'NOTE',
    NULL,
    NULL
  );

  RAISE NOTICE '✅ SEC-P0-02 Test OK (v2 exists): reservation_id=%', v_reservation_id;
END $$;

ROLLBACK;
```

