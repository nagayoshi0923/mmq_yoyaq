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

