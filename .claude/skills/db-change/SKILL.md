---
name: db-change
description: Supabaseのスキーマ変更・マイグレーションを安全手順で実施する。バックアップ確認→影響範囲→staging適用→検証→本番適用→ロールバック手順の型。ユーザーが「テーブル追加して」「カラム変えて」「マイグレーション当てて」などDB変更を依頼したとき必ず使う。予約データは絶対に壊せない。
---

# DB 変更の安全手順

**鉄則: DB変更 → フロントデプロイの順。逆にすると本番エラー（事故実績あり）。**

プロジェクト: 本番=`cznpcewciwywcqcxktba` / staging=`lavutzztfqbdndjiwluc`。取り違え厳禁。

## 手順

### 1. 事前確認

- [ ] 変更内容をユーザーに提示（DDL全文 + 何が変わるか1行ずつ）
- [ ] 破壊的変更（DROP / 型変更 / NOT NULL追加）が含まれるか明示
- [ ] 影響範囲: 対象テーブル/関数の呼び出し元を scout に列挙させる
- [ ] `CREATE OR REPLACE FUNCTION` は**liveの現物**を `pg_get_functiondef` で取得してから書く
      （古いmigrationファイルから書くと前回の変更を巻き戻す事故実績あり）

### 2. 罠チェックリスト（該当したら対処してから進む）

- [ ] トリガー内 INSERT の `ON CONFLICT` → 対応する UNIQUE 制約が実在するか確認
- [ ] トリガー内の複数 INSERT → 内側 BEGIN/EXCEPTION で隔離（2度再発した罠）
- [ ] 新テーブル → 本番は既定で authenticated に ALL が付く。**明示 REVOKE** を忘れない
- [ ] pg_cron から呼ぶ処理 → URL/Secret は `public.app_config` から SELECT（`current_setting()` はNULLでサイレント失敗）
- [ ] RLS ポリシーの変更は禁止。SECURITY DEFINER RPC で対応

### 3. staging 適用 → 検証

```bash
npm run db:push:staging
```
- 確認クエリで結果を報告（件数・制約・関数定義）
- フロント側の変更があるなら staging で実機確認まで

### 4. 本番適用

- ユーザーの明示OKを取ってから:
```bash
npm run db:push:prod
```
- 適用後すぐ確認クエリ。異常があれば即ロールバック

### 5. ロールバック手順（適用前に必ず用意）

- 逆DDLをmigrationと同時に書いておく（ADD→DROP、変更→元の定義）
- データ破壊を伴う場合: staging ミラーが id 保持の実スナップショット。
  VALUES化 → prod INSERT で復元可能（復旧実績あり）

## 禁止

- ユーザー確認なしの本番適用
- フロント先行デプロイ
- 「ついで」の別テーブル変更（1migration = 1目的）
