# supabase/structure/ — DB 構造の写し（drift 検知の基準）

`prod.json` / `staging.json` は、各環境の `public` スキーマの構造（表・列・制約・索引・RLS・ポリシー・トリガー・ビュー・関数の本文ハッシュと権限・enum）を `scripts/db-structure-snapshot.mjs` で写し取ったもの。データは含まない。

## ルール

- DB を変える PR（migration）は、staging / 本番へ適用した日に対応する JSON を `--write` で更新して同じ PR か直後の PR に含める。
- `--diff` で差が出たら、それは「記録されていない DB 変更」。migration を足して記録するか、DB を戻す。黙って JSON だけ更新しない。
- 本番と staging の差（`--diff-against`）は、staging だけに適用済みの migration を本番へ反映する判断材料にする。

## 使い方

```sh
npm run db:structure:prod        # supabase/structure/prod.json を更新
npm run db:structure:staging     # supabase/structure/staging.json を更新
npm run db:drift:prod            # 本番 と prod.json を比較（差があれば exit 1）
npm run db:drift:staging         # staging と staging.json を比較
node scripts/db-structure-snapshot.mjs staging --diff-against supabase/structure/prod.json   # 環境間の差
```

接続情報は `scripts/db-status.mjs` と同じ Keychain（`supabase-db-prod` / `supabase-db-staging`）から読む。パスワードはコマンドラインにも出力にも載せない。

## 位置づけ

- MMQ 構造アトラス（mmq-model-atlas）の「全テーブル一覧」はこの JSON から生成できる形にしている（`tables.<name>.columns` が同じ項目）。アトラスの手作業 ER（主要65表の図・関連・画面対応）は別。
- `supabase/schemas/` は人が読む参照定義、`supabase/migrations/` は適用手順、この JSON は「いま実環境にある構造」。三者が食い違ったら実環境の JSON が事実で、migration が不足している。
