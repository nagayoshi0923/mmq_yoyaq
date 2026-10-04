# DB の基準（baseline）

`<版>_prod.sql` は、本番から構造だけを書き出した基準です（データ・秘密情報は含まない）。
リポジトリから本番と同じ構造を作るときは、この基準に、版がそれより新しい `supabase/migrations` を順に流します。

- 確認: `bash scripts/check-db-baseline.sh`（使い捨ての手元 DB で再現し、`supabase/structure/prod.json` と比べる）。
  GitHub でも DB の変更を含む取り込み依頼と毎週月曜に自動で走る（`.github/workflows/db-baseline-check.yml`）。
- 基準より古い `supabase/migrations` は経緯の記録です。消したり移したりはしない（反映の確認・DB の試験スクリプトが参照している）。
- 以後の DB 変更は、これまでどおり migration と rollback の対で出す。

## 作り直すとき

1. `supabase db dump --db-url <本番のセッションプーラー接続>` で構造を書き出す（パスワードは Keychain `supabase-db-prod`。画面やログに出さない）。
2. 書き出しに入らない部分（`auth.users` の見張り、保管庫の箱と決まり、リアルタイム配信の対象表、定時実行）を本番の定義から足す。
3. 読み込み中に既定の権限が自動で付かないよう、先頭で `ALTER DEFAULT PRIVILEGES ... REVOKE` する。
4. `LANGUAGE sql` の関数は書き出しで本文先頭の説明行が落ちるので、本番の `pg_get_functiondef` で置き直す。
5. `bash scripts/check-db-baseline.sh` が通ることを確かめ、ファイル名の版を最後に含めた migration の版にする。

2026-10-04 の版（20261004120000）の手順と、再現で残る意味の同じ差（括弧の付け方 1 件、所有者だけの権限の書き方 3 表、手元にだけある拡張 pg_graphql）は docs/MMQ_SEIBI_PLAN_2026-10.md の 1-1 に記録。
