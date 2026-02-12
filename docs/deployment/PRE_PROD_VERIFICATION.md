# 本番マイグレーション適用前の確認手順

本番DBにマイグレーションを適用する前に、エラーが出ないこと・セキュリティ対策が効いていることを確認する手順です。

---

## Part 1: マイグレーションのエラー確認

### 方法A: ローカル Supabase で検証（推奨）

1. **ローカル Supabase を起動**
   ```bash
   cd /Users/mai/mmq_yoyaq/mmq_yoyaq
   supabase start
   ```

2. **マイグレーションを適用**
   ```bash
   supabase db reset
   ```
   ※ `db reset` はローカルDBを初期化して全マイグレーションを最初から適用します

3. **エラーが出たら**
   - 表示されたエラーメッセージを確認
   - 該当するマイグレーションファイルを修正してから再実行

4. **成功したら確認用SQLを実行**
   - Supabase Studio にアクセス: http://localhost:54323
   - SQL Editor で `docs/deployment/sql/VERIFY_security_functions_and_policies.sql` を実行
   - エラーなく実行できればOK

---

### 方法B: ステージング DB で検証

本番と同じ構成のステージングDBがある場合:

1. **ステージングに接続**
   ```bash
   supabase link --project-ref <ステージングのReference ID>
   ```

2. **マイグレーション適用**
   ```bash
   supabase db push
   ```

3. **エラーが出たら** → ログを確認し、該当マイグレーションを修正

4. **VERIFY SQL を実行** → 結果を確認

5. **本番用にリンクを切り替え**
   ```bash
   supabase link --project-ref <本番のReference ID>
   ```

---

## Part 2: 攻撃方法と確認手順

マイグレーションで対策した脆弱性に対して、**攻撃が失敗することを確認**する手順です。

### 攻撃1: 0円予約攻撃（P0-A 対策の確認）

**攻撃内容**: Supabase API を直接叩き、`p_base_price: 0`, `p_total_price: 0` で予約を作成する。

**確認手順**:
1. Supabase Dashboard → SQL Editor で以下を実行:
   ```sql
   -- 危険なオーバーロードが削除されているか確認（0行であるべき）
   SELECT proname, pg_get_function_arguments(oid)
   FROM pg_proc
   WHERE proname = 'create_reservation_with_lock_v2'
     AND pg_get_function_arguments(oid) LIKE '%INTEGER%INTEGER%';
   ```
   - **期待結果**: 0行（危険な署名の関数が存在しない）

2. ブラウザのDevTools → Console で試す（失敗するべき）:
   ```javascript
   const { data, error } = await window.supabase?.rpc('create_reservation_with_lock_v2', {
     p_schedule_event_id: '適当なUUID',
     p_customer_id: '適当なUUID',
     p_base_price: 0,
     p_total_price: 0,
     // ... 他の引数
   });
   console.log(error); // 関数が存在しない or 引数が合わないエラー
   ```

---

### 攻撃2: 他組織の予約をキャンセル（P0-B 対策の確認）

**攻撃内容**: Org-A の admin が、Org-B の予約IDを指定して `cancel_reservation_with_lock` を呼ぶ。

**確認手順**:
1. 組織Aの admin でログイン
2. 組織Bの予約IDを確認（DB または別ユーザーで取得）
3. 予約キャンセルAPIを呼ぶ
4. **期待結果**: エラー「他の組織の予約は操作できません」など、拒否される

**SQLで確認**:
```sql
-- cancel_reservation_with_lock に組織チェックが含まれているか
SELECT prosrc FROM pg_proc
WHERE proname = 'cancel_reservation_with_lock'
  AND prosrc ILIKE '%organization_id%'
  AND prosrc ILIKE '%get_user_organization_id%';
```
- **期待結果**: 1行（組織チェックのコードが含まれている）

---

### 攻撃3: 他組織の予約を一括削除（P0-D 対策の確認）

**攻撃内容**: Org-A の admin が `admin_delete_reservations_by_ids` に Org-B の予約IDを渡す。

**確認手順**:
1. Org-A の admin でログイン
2. Org-B の予約IDの配列を渡して RPC を呼ぶ
3. **期待結果**: `{ success: false, error: '他の組織の予約は削除できません' }`

**SQLで確認**:
```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'admin_delete_reservations_by_ids'
  AND prosrc ILIKE '%他の組織の予約は削除できません%';
```
- **期待結果**: 1行

---

### 攻撃4: reservations_history の他組織データ閲覧（P0-E 対策の確認）

**攻撃内容**: Org-A のユーザーが Org-B の予約履歴を SELECT する。

**確認手順**:
1. Org-A のユーザーでログイン（JWT取得）
2. `reservations_history` を SELECT（RLSが有効なら組織フィルタがかかる）
3. **期待結果**: 自組織のデータのみ返る。他組織の行は0件

**SQLで確認**:
```sql
-- reservations_history の SELECT ポリシーに organization_id が含まれているか
SELECT tablename, policyname, qual::text
FROM pg_policies
WHERE tablename = 'reservations_history'
  AND cmd = 'SELECT'
  AND qual::text ILIKE '%organization_id%';
```
- **期待結果**: 1行以上（組織スコープの条件がある）

---

### 攻撃5: auth_logs への不正 INSERT（P1-21 対策の確認）

**攻撃内容**: 一般ユーザーが `auth_logs` に直接 INSERT する。

**確認手順**:
1. 一般ユーザー（非 service_role）の JWT で Supabase クライアントを初期化
2. `supabase.from('auth_logs').insert({ ... })` を実行
3. **期待結果**: RLS で拒否され、INSERT できない

**SQLで確認**:
```sql
-- auth_logs の INSERT ポリシーが service_role 等に制限されているか
SELECT policyname, roles, cmd, qual::text, with_check::text
FROM pg_policies
WHERE tablename = 'auth_logs' AND cmd = 'INSERT';
```
- **期待結果**: `authenticated` や `anon` では INSERT 不可（ポリシーが厳格）

---

## Part 3: まとめチェックリスト

| # | 確認項目 | 方法 | 期待結果 |
|---|----------|------|----------|
| 1 | マイグレーション適用 | `supabase db reset` または `db push` | エラーなし |
| 2 | VERIFY SQL 実行 | SQL Editor で実行 | エラーなし、想定どおりの結果 |
| 3 | P0-A 0円予約 | 危険なオーバーロード削除確認 | 0行 |
| 4 | P0-B 他組織キャンセル | cancel に org チェック | 含まれる |
| 5 | P0-D 他組織一括削除 | admin_delete に org チェック | 含まれる |
| 6 | P0-E 他組織履歴閲覧 | reservations_history RLS | org スコープ |
| 7 | P1-21 auth_logs | INSERT 制限 | 一般ユーザー不可 |

---

## 本番適用時の注意

- 本番適用前に**必ずバックアップ**を取得すること
- 可能なら**低トラフィック時**に実施
- 適用後は VERIFY SQL を再実行して確認
