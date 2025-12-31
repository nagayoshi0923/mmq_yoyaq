# タイムアウトエラーの修正ガイド

## 問題の概要

アプリケーションで以下のエラーが発生していました:

1. **ロール取得タイムアウト**: `usersテーブルからロール取得`が繰り返しタイムアウト
2. **関数未定義エラー**: `Cc.getStaffShifts is not a function`
3. **shift.idエラー**: `Cannot read properties of undefined (reading 'startsWith')`

## 修正内容

### 1. shiftApi.tsの修正

**問題**: `ShiftSubmission.tsx`で`shiftApi.getStaffShifts()`を呼び出していましたが、この関数が存在しませんでした。

**修正**: `src/lib/shiftApi.ts`に`getStaffShifts()`メソッドを追加しました（`getByMonth()`のエイリアス）。

```typescript
// getByMonthのエイリアス（後方互換性のため）
async getStaffShifts(staffId: string, year: number, month: number): Promise<ShiftSubmission[]> {
  return this.getByMonth(staffId, year, month)
}
```

### 2. AuthContextの最適化

**問題**: 
- ロール取得とスタッフ情報取得が頻繁にタイムアウト
- 複数の重複したセッション設定処理が同時に実行されていた

**修正内容**:

1. **重複呼び出し防止**: `isProcessing`フラグを追加して、同時に複数の認証処理が走らないようにしました

2. **タイムアウト時間の延長**:
   - ロール取得: 3秒 → 5秒
   - スタッフ情報取得: 2秒 → 3秒

3. **クエリメソッドの変更**: `.single()`から`.maybeSingle()`に変更
   - レコードが存在しない場合でもエラーにならないため、より堅牢になります

### 3. ShiftSubmission.tsxのシフト提出ロジック修正

**問題**: 
- `shift.id`が`undefined`の場合に`.startsWith()`を呼び出してエラーが発生
- 存在しない`shiftApi.createShift()`と`shiftApi.updateShift()`を呼び出していた

**修正内容**:

1. **upsertMultipleメソッドの使用**: 個別の`createShift`/`updateShift`呼び出しを廃止し、`upsertMultiple`で一括処理に変更

2. **データ構造の改善**: temp-IDの判定を廃止し、すべて`upsert`で処理（staff_id + dateの組み合わせで自動判定）

3. **提出後のデータ再構築**: シフト提出後、データベースから最新情報を取得して状態を完全に再構築

```typescript
// 修正前（エラーあり）
if (shift.id.startsWith('temp-')) {
  await shiftApi.createShift(shiftData)
} else {
  await shiftApi.updateShift(shift.id, shiftData)
}

// 修正後
const shiftsToUpsert = shiftsToSave.map(shift => ({
  staff_id: currentStaffId,
  date: shift.date,
  morning: shift.morning,
  afternoon: shift.afternoon,
  evening: shift.evening,
  all_day: shift.all_day,
  status: 'submitted' as const,
  submitted_at: new Date().toISOString()
}))

await shiftApi.upsertMultiple(shiftsToUpsert)
```

### 4. データベースRLSポリシーの修正

**問題**: `update_users_rls_policy.sql`のRLSポリシーが無限再帰を引き起こす可能性がありました。

```sql
-- 問題のあるポリシー（無限再帰の原因）
CREATE POLICY users_select_policy ON users FOR SELECT USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u   -- ここでusersテーブルを再度参照している
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
);
```

**修正**: 新しいSQLファイル`database/fix_users_rls_timeout.sql`を作成しました。

主な変更点:
- 無限再帰を引き起こす可能性のあるポリシーを削除
- シンプルな`auth.uid() = id`ベースのポリシーに変更
- パフォーマンス向上のためのインデックスを追加
- 管理者用の操作はservice_roleキーを使用

## 適用手順

### 1. フロントエンドの修正（すでに完了）

修正済みのファイル:
- `src/lib/shiftApi.ts` - `getStaffShifts()`メソッド追加
- `src/contexts/AuthContext.tsx` - タイムアウト修正、重複呼び出し防止
- `src/pages/ShiftSubmission.tsx` - シフト提出ロジック修正

ビルド済みファイル:
- `dist/` ディレクトリに最新版が生成されています

### 2. データベースの修正（要実行）

Supabaseダッシュボードで以下のSQLを実行してください:

```bash
# Supabase Dashboard > SQL Editor で以下のファイルを実行
database/fix_users_rls_timeout.sql
```

このSQLファイルは以下を実行します:
- 既存の問題のあるRLSポリシーを削除
- シンプルで高速なポリシーを作成
- パフォーマンス向上のためのインデックスを追加

## 期待される結果

修正後は以下のようになります:

✅ ロール取得タイムアウトエラーが解消
✅ スタッフ情報の取得が高速化
✅ シフト提出ページのエラーが解消
✅ 重複した認証処理が防止される

## 確認方法

1. ブラウザのコンソールを開く
2. アプリケーションにログイン
3. 以下のログが表示されることを確認:
   - `✅ データベースからロール取得: admin` (タイムアウトなし)
   - `✅ スタッフ名取得成功` (タイムアウトなし)
   - エラーログが出力されないこと

4. シフト提出ページ (`/shift-submission`) にアクセス
5. エラーなくページが表示されること

## トラブルシューティング

### まだタイムアウトが発生する場合

1. Supabaseのダッシュボードで以下を確認:
   - `users`テーブルにインデックスが作成されているか
   - RLSポリシーが正しく設定されているか

2. データベース接続を確認:
   ```sql
   -- users テーブルが正常に動作しているか確認
   SELECT id, email, role FROM users LIMIT 5;
   ```

3. ネットワークタブでクエリの応答時間を確認

### 管理者機能が動作しない場合

- 現在の実装では、各ユーザーは自分自身のレコードのみアクセス可能
- 管理者が他のユーザーを管理する場合は、`service_role`キーを使用したAPIを作成する必要があります

## 今後の改善案

1. **ロールベースのアクセス制御**:
   - 管理者用のAPI（service_roleキー使用）を別途作成
   - フロントエンドからは自分自身の情報のみ取得

2. **キャッシング戦略**:
   - ロール情報をlocalStorageにキャッシュ
   - スタッフ情報のキャッシュ期間を延長

3. **パフォーマンスモニタリング**:
   - データベースクエリの実行時間を監視
   - Supabaseのダッシュボードでスロークエリを確認

## 関連ファイル

- `src/lib/shiftApi.ts` - シフトAPI関数
- `src/contexts/AuthContext.tsx` - 認証コンテキスト
- `database/fix_users_rls_timeout.sql` - RLSポリシー修正SQL
- `database/update_users_rls_policy.sql` - 旧ポリシー（問題あり）
- `database/fix_rls_policies.sql` - 他のテーブルのRLSポリシー

## デプロイ方法

### Vercelへのデプロイ

```bash
# distディレクトリの内容をVercelにデプロイ
npx vercel --prod

# または、GitHubにpushして自動デプロイ
git add .
git commit -m "fix: タイムアウトエラーとシフト提出エラーを修正"
git push origin main
```

### 手動デプロイ（Vercel Dashboard経由）

1. `dist/` ディレクトリの内容をアップロード
2. または、GitHubのmainブランチにpushして自動デプロイを待つ

## 変更履歴

- 2025-10-16: 初版作成
  - shiftApi.getStaffShifts()メソッド追加
  - AuthContextの重複呼び出し防止
  - タイムアウト時間の調整
  - ShiftSubmission.tsxのシフト提出ロジック修正
  - データベースRLSポリシーの修正
  - ビルド完了

