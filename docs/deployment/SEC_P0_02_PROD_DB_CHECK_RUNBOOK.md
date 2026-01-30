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
また、SQL Editorが `postgres` ロールで実行される場合、`auth.uid()` が `NULL` になることがあります。  
その場合は **`SET LOCAL ROLE authenticated;` を実行してから** テストを行ってください（本runbookのSQLは対応済み）。

---

## トラブルシュート（よくある）: `CUSTOMER_NOT_FOUND` / `FORBIDDEN_CUSTOMER` が出る

SQL Editor は実行ごとに接続が切り替わる・ロールが変わる・RLSが効く等で、**擬似JWTが安定しない**ことがあります。  
この場合、以下の「ID固定＋auth確認」手順で必ず切り分けできます。

### TS-0: まず“使えるID”を取得（1行返る）

```sql
WITH
event AS (
  SELECT id, organization_id, date, start_time
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
  ORDER BY date ASC, start_time ASC
  LIMIT 1
),
cust AS (
  SELECT id, user_id
  FROM customers
  WHERE organization_id = (SELECT organization_id FROM event)
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  (SELECT id FROM event) AS event_id,
  (SELECT organization_id FROM event) AS organization_id,
  (SELECT id FROM cust) AS customer_id,
  (SELECT user_id FROM cust) AS customer_user_id;
```

### TS-1: `auth.uid()` が期待通りか確認（1行返る）

TS-0 の `customer_user_id` を入れて実行し、`uid = customer_user_id` になっていることを確認。

```sql
SELECT
  set_config('request.jwt.claim.sub', '<customer_user_id>', true) AS _sub,
  set_config('request.jwt.claims', json_build_object('sub', '<customer_user_id>'::uuid)::text, true) AS _claims,
  auth.uid() AS uid,
  current_setting('request.jwt.claim.sub', true) AS claim_sub;
```

`uid` が NULL の場合:
- SQL Editor の実行ロールが原因の可能性が高いので、次を追加して再実行:

```sql
SET LOCAL ROLE authenticated;
```

### TS-2: 「1回の実行」で JWTセット→RPC→検証 を完結させる（推奨）

接続切替の影響を避けるため、**同一クエリ内で set_config まで行う**方式。

```sql
BEGIN;

WITH
ids AS (
  SELECT
    '<event_id>'::uuid AS event_id,
    '<organization_id>'::uuid AS organization_id,
    '<customer_id>'::uuid AS customer_id,
    '<customer_user_id>'::uuid AS customer_user_id
),
claims AS (
  SELECT
    set_config('request.jwt.claim.sub', (SELECT customer_user_id::text FROM ids), true) AS _a,
    set_config('request.jwt.claims', json_build_object('sub', (SELECT customer_user_id FROM ids))::text, true) AS _b
),
call AS (
  SELECT create_reservation_with_lock(
    (SELECT event_id FROM ids),
    2,
    (SELECT customer_id FROM ids),
    'SEC_P0_02_TEST',
    'sec-test@example.com',
    '0000000000',
    NULL,
    NULL,
    '2000-01-01T00:00:00Z'::timestamptz, -- 改ざん
    999,                                 -- 改ざん
    1, 1, 1,                             -- 改ざん
    to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)),
    'SEC_P0_02_TEST_NOTES',
    NULL,
    (SELECT organization_id FROM ids),
    'SEC_P0_02_TEST_TITLE'
  ) AS rid
  FROM claims
),
inspect AS (
  -- SQL Editorで見えない場合があるためRLSを切って確認（postgres向け）
  SELECT set_config('row_security', 'off', true) AS _rs, (SELECT rid FROM call) AS rid
),
res AS (
  SELECT
    r.id,
    r.unit_price,
    r.total_price,
    r.requested_datetime,
    (SELECT (se.date + se.start_time)::timestamptz FROM schedule_events se WHERE se.id = (SELECT event_id FROM ids)) AS expected_dt
  FROM reservations r
  WHERE r.id = (SELECT rid FROM inspect)
)
SELECT
  id AS reservation_id,
  unit_price,
  total_price,
  requested_datetime,
  expected_dt,
  (unit_price <> 1 AND total_price <> 1 AND requested_datetime = expected_dt) AS pass
FROM res;

ROLLBACK;
```

※ `<event_id>`, `<organization_id>`, `<customer_id>`, `<customer_user_id>` は TS-0 の結果を貼り替え。

---

## 代替（最も確実）: ブラウザ/Nodeで「実際の顧客JWT」で検証

SQL Editor の擬似JWTは環境依存があるため、**運用としてはアプリのJWTで検証する方が確実**です。

ブラウザコンソール（顧客ログイン状態）で実行:

```ts
// 1) “不正な料金/日時”で旧RPCを叩く（DB側が上書きしてくれればOK）
const res = await supabase.rpc('create_reservation_with_lock', {
  p_schedule_event_id: '<event_id>',
  p_participant_count: 2,
  p_customer_id: '<customer_id>',
  p_customer_name: 'SEC_P0_02_TEST',
  p_customer_email: 'sec-test@example.com',
  p_customer_phone: '0000000000',
  p_scenario_id: null,
  p_store_id: null,
  p_requested_datetime: '2000-01-01T00:00:00Z',
  p_duration: 999,
  p_base_price: 1,
  p_total_price: 1,
  p_unit_price: 1,
  p_reservation_number: 'SEC-P0-02-' + Math.random().toString(16).slice(2, 6).toUpperCase(),
  p_notes: 'SEC_P0_02_TEST_NOTES',
  p_created_by: null,
  p_organization_id: '<organization_id>',
  p_title: 'SEC_P0_02_TEST_TITLE',
})

if (res.error) throw res.error

// 2) 作成された予約を取得して、料金/日時が“サーバー確定”になっているか確認
const { data: r, error } = await supabase
  .from('reservations')
  .select('id, unit_price, total_price, requested_datetime, schedule_event_id')
  .eq('id', res.data)
  .single()
if (error) throw error
console.log(r)
```

---

## SQL Editor向け（最短）: SQLファイルを実行して pass を確認

長いSQLは**ファイルに分離**し、Runbookは「実行するファイル」だけを示します。

### 0) 使うIDを取得

- 実行ファイル: `docs/deployment/sql/SEC_P0_02_ts0_pick_ids.sql`
- 返ってきた `event_id / organization_id / customer_id / customer_user_id` を控える

### 1) auth.uid() が期待通りか確認

- 実行ファイル: `docs/deployment/sql/SEC_P0_02_ts1_check_auth_uid.sql`
- **置換不要**（TS-0と同様に自動選択）
- `uid` と `customer_user_id` が一致すること

### 2) 旧RPC（改ざんテスト）

- 実行ファイル: `docs/deployment/sql/SEC_P0_02_test_old_rpc_one_query.sql`
- **pass=true** を確認

### 3) v2（動作テスト）

- 実行ファイル: `docs/deployment/sql/SEC_P0_02_test_v2_one_query.sql`
- **pass=true** を確認

### テスト1: 旧RPC（create_reservation_with_lock）に不正な料金/日時を入れても無視される

```sql
BEGIN;

-- auth.uid() を有効にする（SQL Editorがpostgresのままの場合に必須）
SET LOCAL ROLE authenticated;

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

SET LOCAL ROLE authenticated;

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

---

## SQL Editorで結果を目視したい場合（推奨）: 1行で pass を返す版（2ステップ）

SQL Editorによっては `NOTICE` が見えづらく、実行結果が `Success. No rows returned` だけに見えることがあります。  
また、`BEGIN ... SELECT ... ROLLBACK` を**1回でまとめて実行**すると、画面が「最後のステートメント（ROLLBACK）」の結果だけを表示してしまい、`Success. No rows returned` に見えることがあります。  
**必ずステップAの範囲だけを選択して実行**してください（Supabase SQL Editor の「選択範囲を実行 / Run selected」推奨）。

そのため、このセクションは **2ステップ**です。
- **ステップA**: `BEGIN;` + `WITH ... SELECT ...;` を実行して **pass行を確認**
- **ステップB**: `ROLLBACK;` を実行して **後片付け**

（データは最終的にロールバックされます）

### 重要（RLSにより0行になる場合）

SQL Editorの実行ロール/ポリシー状態によっては、`reservations` のSELECTがRLSで弾かれ **0行**になることがあります。  
その場合、SQL Editor（通常は `postgres`）で **`set_config('row_security','off', true)`** を入れて結果を目視します。

> それでも SQL Editor 側の制約で `reservations` / `reservations_history` を参照できず「0行」になり続ける場合があります。  
> その場合は、代替として **TS-2（定義チェック）** を実行し、「料金/日時がサーバー計算」になっていることを機械的に確認してください。

#### 代替（TS-2）: 定義チェック（置換不要）

```sql
-- 期待: 両方 pass=true
-- - create_reservation_with_lock
-- - create_reservation_with_lock_v2
-- SQL: docs/deployment/sql/SEC_P0_02_ts2_check_rpc_def_server_pricing.sql
```

### テスト1（旧RPC）: passがtrueになること

```sql
-- ステップA: 実行して pass=true を目視
BEGIN;

WITH
event AS (
  SELECT id, organization_id, scenario_id, store_id, date, start_time, (date + start_time)::timestamptz AS event_dt
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.organization_id = schedule_events.organization_id
        AND c.user_id IS NOT NULL
    )
  ORDER BY date ASC, start_time ASC
  LIMIT 1
),
cust AS (
  SELECT id, user_id
  FROM customers
  WHERE organization_id = (SELECT organization_id FROM event)
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
),
claims AS (
  SELECT
    set_config('request.jwt.claim.sub', (SELECT user_id::text FROM cust), true) AS _a,
    set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM cust))::text, true) AS _b
),
rls_off AS (
  -- RLSでreservationsが見えず0行になる環境向け（SQL Editorがpostgresの場合に有効）
  SELECT set_config('row_security', 'off', true) AS _rs
),
call AS (
  SELECT create_reservation_with_lock(
    (SELECT id FROM event),
    2,
    (SELECT id FROM cust),
    'SEC_P0_02_TEST',
    'sec-test@example.com',
    '0000000000',
    NULL,
    NULL,
    '2000-01-01T00:00:00Z'::timestamptz,
    999,
    1,
    1,
    1,
    to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)),
    'SEC_P0_02_TEST_NOTES',
    NULL,
    (SELECT organization_id FROM event),
    'SEC_P0_02_TEST_TITLE'
  ) AS rid
  FROM claims, rls_off
),
res AS (
  SELECT r.id,
         r.unit_price,
         r.total_price,
         r.requested_datetime,
         (SELECT event_dt FROM event) AS expected_dt
  FROM reservations r
  WHERE r.id = (SELECT rid FROM call)
)
SELECT
  id AS reservation_id,
  unit_price,
  total_price,
  requested_datetime,
  expected_dt,
  (unit_price <> 1 AND total_price <> 1 AND requested_datetime = expected_dt) AS pass
FROM res;
```

```sql
-- ステップB: 後片付け（本番データを残さない）
ROLLBACK;
```

### テスト2（v2）: passがtrueになること

```sql
-- ステップA: 実行して pass=true を目視
BEGIN;

WITH
event AS (
  SELECT id, organization_id
  FROM schedule_events
  WHERE is_cancelled = false
    AND date >= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.organization_id = schedule_events.organization_id
        AND c.user_id IS NOT NULL
    )
  ORDER BY date ASC, start_time ASC
  LIMIT 1
),
cust AS (
  SELECT id, user_id
  FROM customers
  WHERE organization_id = (SELECT organization_id FROM event)
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
),
claims AS (
  SELECT
    set_config('request.jwt.claim.sub', (SELECT user_id::text FROM cust), true) AS _a,
    set_config('request.jwt.claims', json_build_object('sub', (SELECT user_id FROM cust))::text, true) AS _b
),
rls_off AS (
  SELECT set_config('row_security', 'off', true) AS _rs
),
call AS (
  SELECT create_reservation_with_lock_v2(
    (SELECT id FROM event),
    1,
    (SELECT id FROM cust),
    'SEC_P0_02_TEST_V2',
    'sec-test@example.com',
    '0000000000',
    'NOTE',
    NULL,
    NULL
  ) AS rid
  FROM claims, rls_off
)
SELECT rid AS reservation_id, true AS pass
FROM call;
```

```sql
-- ステップB: 後片付け（本番データを残さない）
ROLLBACK;
```

